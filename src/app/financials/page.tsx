'use client'

import { useEffect, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShopifyStatus {
  connected: boolean
  last_synced_at?: string | null
}

interface OrderRow {
  id: number
  shopify_id: string
  order_number: number
  email: string | null
  total_price: number
  subtotal_price: number
  financial_status: string
  fulfillment_status: string | null
  line_items: string
  created_at: string
  processed_at: string | null
}

interface LineItem {
  id?: number
  title: string
  quantity: number
  price: string
}

interface ProductRevenue {
  title: string
  revenue: number
  quantity: number
}

type DateRange = 7 | 30 | 90

// ─── Helpers ──────────────────────────────────────────────────────────────────

function maskEmail(email: string | null): string {
  if (!email) return '—'
  const [local, domain] = email.split('@')
  if (!domain) return email
  const masked = local.slice(0, 2) + '•'.repeat(Math.max(0, local.length - 2))
  return `${masked}@${domain}`
}

function formatCurrency(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function computeStats(orders: OrderRow[]) {
  const total = orders.reduce((s, o) => s + (o.total_price ?? 0), 0)
  const count = orders.length
  const avg = count > 0 ? total / count : 0
  return { total, count, avg }
}

function computeProductRevenue(orders: OrderRow[]): ProductRevenue[] {
  const map = new Map<string, { revenue: number; quantity: number }>()
  for (const o of orders) {
    let items: LineItem[] = []
    try { items = JSON.parse(o.line_items) as LineItem[] } catch { /* skip */ }
    for (const item of items) {
      const key = item.title
      const existing = map.get(key) ?? { revenue: 0, quantity: 0 }
      const lineRev = parseFloat(item.price) * item.quantity
      map.set(key, {
        revenue: existing.revenue + lineRev,
        quantity: existing.quantity + item.quantity,
      })
    }
  }
  return Array.from(map.entries())
    .map(([title, data]) => ({ title, ...data }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8)
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  trend,
}: {
  label: string
  value: string
  sub?: string
  trend?: { pct: number }
}) {
  return (
    <div className="bg-white rounded-xl border border-mushroom/50 p-5 space-y-1.5">
      <p
        className="text-[10px] font-semibold uppercase tracking-widest text-ink/50"
        style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
      >
        {label}
      </p>
      <p
        className="text-2xl font-semibold text-ink-dark tabular-nums"
        style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
      >
        {value}
      </p>
      {trend && (
        <div className="flex items-center gap-1">
          {trend.pct >= 0 ? (
            <TrendingUp className="w-3.5 h-3.5 text-thyme" />
          ) : (
            <TrendingDown className="w-3.5 h-3.5 text-terracotta" />
          )}
          <span
            className={cn('text-xs font-semibold', trend.pct >= 0 ? 'text-thyme' : 'text-terracotta')}
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
          >
            {trend.pct >= 0 ? '+' : ''}{trend.pct.toFixed(1)}% vs prev period
          </span>
        </div>
      )}
      {sub && !trend && (
        <p className="text-xs text-ink/40" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{sub}</p>
      )}
    </div>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  paid:       'bg-thyme-light text-thyme border border-thyme/30',
  pending:    'bg-butter-light text-ink-dark border border-butter/40',
  refunded:   'bg-terracotta-light text-terracotta border border-terracotta/30',
  voided:     'bg-mushroom/20 text-ink/50 border border-mushroom/40',
  authorized: 'bg-blueberry-light text-blueberry border border-blueberry/30',
  partially_refunded: 'bg-terracotta-light text-terracotta border border-terracotta/30',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full',
        STATUS_STYLES[status] ?? 'bg-oatmilk text-ink border border-mushroom/40'
      )}
      style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
    >
      {status.replace(/_/g, ' ')}
    </span>
  )
}

// ─── CSS Bar Chart ─────────────────────────────────────────────────────────────

function RevenueBarChart({ data }: { data: ProductRevenue[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-ink/40" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
          No product data yet.
        </p>
      </div>
    )
  }

  const max = Math.max(...data.map(d => d.revenue))

  return (
    <div className="space-y-2.5">
      {data.map(item => {
        const pct = max > 0 ? (item.revenue / max) * 100 : 0
        return (
          <div key={item.title} className="flex items-center gap-3">
            <div
              className="w-36 shrink-0 text-xs text-ink truncate text-right"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
              title={item.title}
            >
              {item.title}
            </div>
            <div className="flex-1 h-6 bg-oatmilk rounded-md overflow-hidden">
              <div
                className="h-full bg-thyme rounded-md transition-all duration-500 flex items-center px-2"
                style={{ width: `${Math.max(pct, 2)}%` }}
              >
                {pct > 20 && (
                  <span
                    className="text-[10px] text-white font-semibold truncate"
                    style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                  >
                    {formatCurrency(item.revenue)}
                  </span>
                )}
              </div>
            </div>
            {pct <= 20 && (
              <span
                className="text-xs text-ink/60 tabular-nums shrink-0"
                style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
              >
                {formatCurrency(item.revenue)}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Order Table Row (with actions) ──────────────────────────────────────────

function OrderTableRow({ order, onUpdate }: { order: OrderRow; onUpdate: (o: OrderRow) => void }) {
  const [acting, setActing] = useState<'fulfill' | 'cancel' | null>(null)

  const canFulfill = order.fulfillment_status !== 'fulfilled' && order.financial_status !== 'voided'
  const canCancel = order.financial_status !== 'voided' && order.financial_status !== 'refunded'

  async function fulfill() {
    setActing('fulfill')
    const res = await fetch(`/api/shopify/orders/${order.shopify_id}/fulfill`, { method: 'POST' })
    if (res.ok) onUpdate({ ...order, fulfillment_status: 'fulfilled' })
    setActing(null)
  }

  async function cancel() {
    if (!confirm(`Cancel order #${order.order_number}?`)) return
    setActing('cancel')
    const res = await fetch(`/api/shopify/orders/${order.shopify_id}/cancel`, { method: 'POST' })
    if (res.ok) onUpdate({ ...order, financial_status: 'voided', fulfillment_status: 'cancelled' })
    setActing(null)
  }

  return (
    <tr className="border-b border-mushroom/20 hover:bg-oatmilk/30 transition-colors">
      <td className="py-3 pr-4">
        <span className="text-sm font-semibold text-ink-dark tabular-nums" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
          #{order.order_number}
        </span>
      </td>
      <td className="py-3 pr-4">
        <span className="text-sm text-ink/70" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
          {formatDate(order.created_at)}
        </span>
      </td>
      <td className="py-3 pr-4">
        <span className="text-xs text-ink/60" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
          {maskEmail(order.email)}
        </span>
      </td>
      <td className="py-3 pr-4">
        <span className="text-sm font-semibold text-ink-dark tabular-nums" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
          {formatCurrency(order.total_price)}
        </span>
      </td>
      <td className="py-3 pr-4"><StatusBadge status={order.financial_status} /></td>
      <td className="py-3 pr-4">
        <StatusBadge status={order.fulfillment_status ?? 'unfulfilled'} />
      </td>
      <td className="py-3">
        <div className="flex items-center gap-1.5">
          {canFulfill && (
            <button
              onClick={fulfill}
              disabled={acting !== null}
              className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-thyme-light text-thyme border border-thyme/30 hover:bg-thyme hover:text-white transition-colors disabled:opacity-40 cursor-pointer"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            >
              {acting === 'fulfill' ? '…' : 'Fulfill'}
            </button>
          )}
          {canCancel && (
            <button
              onClick={cancel}
              disabled={acting !== null}
              className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-terracotta-light text-terracotta border border-terracotta/30 hover:bg-terracotta hover:text-white transition-colors disabled:opacity-40 cursor-pointer"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            >
              {acting === 'cancel' ? '…' : 'Cancel'}
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FinancialsPage() {
  const [shopifyStatus, setShopifyStatus] = useState<ShopifyStatus | null>(null)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [prevOrders, setPrevOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState<DateRange>(30)
  const [syncing, setSyncing] = useState(false)
  const [blendedMargin, setBlendedMargin] = useState(55)
  const [costedProductCount, setCostedProductCount] = useState(0)

  async function loadOrders(d: DateRange) {
    const res = await fetch(`/api/shopify/orders?days=${d}`)
    const data = await res.json() as OrderRow[]
    setOrders(data)

    // Fetch previous period for comparison
    const prevRes = await fetch(`/api/shopify/orders?days=${d * 2}`)
    const prevData = await prevRes.json() as OrderRow[]
    // Keep only the "previous" half — orders older than d days but within 2d
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - d)
    setPrevOrders(prevData.filter(o => new Date(o.created_at) < cutoff))
  }

  async function loadAll(d: DateRange) {
    setLoading(true)
    const [statusRes, marginRes] = await Promise.all([
      fetch('/api/shopify/connect'),
      fetch('/api/inventory/margin'),
    ])
    const status = await statusRes.json() as ShopifyStatus
    setShopifyStatus(status)
    if (status.connected) {
      await loadOrders(d)
    }
    const marginData = await marginRes.json() as { blendedMargin: number; costedProductCount: number }
    setBlendedMargin(marginData.blendedMargin)
    setCostedProductCount(marginData.costedProductCount)
    setLoading(false)
  }

  useEffect(() => { loadAll(days) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDaysChange(d: DateRange) {
    setDays(d)
    setLoading(true)
    await loadOrders(d)
    setLoading(false)
  }

  async function handleSync() {
    setSyncing(true)
    try {
      await fetch('/api/shopify/sync', { method: 'POST' })
      await loadOrders(days)
    } finally {
      setSyncing(false)
    }
  }

  if (loading && shopifyStatus === null) {
    return (
      <div className="p-8 max-w-6xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-ink mb-1" style={{ fontFamily: "'Jost', system-ui, sans-serif", letterSpacing: '0.15em' }}>
          Operations
        </p>
        <h1 className="text-5xl text-ink-dark mb-8" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700 }}>
          Financials
        </h1>
        <div className="flex justify-center py-16">
          <p className="text-sm text-ink/50" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Loading…</p>
        </div>
      </div>
    )
  }

  const current = computeStats(orders)
  const prev = computeStats(prevOrders)
  const revTrend = prev.total > 0 ? ((current.total - prev.total) / prev.total) * 100 : 0
  const productRevenue = computeProductRevenue(orders)

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <p
          className="text-xs font-semibold uppercase tracking-widest text-ink mb-1"
          style={{ fontFamily: "'Jost', system-ui, sans-serif", letterSpacing: '0.15em' }}
        >
          Operations
        </p>
        <h1
          className="text-5xl text-ink-dark"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700 }}
        >
          Financials
        </h1>
      </div>

      {/* Not connected state */}
      {!shopifyStatus?.connected ? (
        <div className="bg-white rounded-xl border border-mushroom/50 p-10 flex flex-col items-center gap-3 text-center">
          <p
            className="text-base font-semibold text-ink-dark"
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
          >
            Shopify not connected
          </p>
          <p
            className="text-sm text-ink/60 max-w-sm"
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
          >
            Connect your Shopify store on the Marketing page to see revenue, orders, and product performance here.
          </p>
          <a
            href="/marketing"
            className="mt-2 px-4 py-2 rounded-lg bg-ink-dark text-cream text-sm hover:bg-ink transition-colors cursor-pointer"
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
          >
            Go to Marketing → Connect Shopify
          </a>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            {/* Date range selector */}
            <div className="flex gap-1 p-1 bg-oatmilk rounded-lg">
              {([7, 30, 90] as DateRange[]).map(d => (
                <button
                  key={d}
                  onClick={() => handleDaysChange(d)}
                  disabled={loading}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-sm font-semibold transition-all cursor-pointer disabled:opacity-50',
                    days === d
                      ? 'bg-white text-ink-dark shadow-sm'
                      : 'text-ink hover:text-ink-dark'
                  )}
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                >
                  {d}d
                </button>
              ))}
            </div>

            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ink-dark text-cream text-sm hover:bg-ink transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            >
              <RefreshCw className={cn('w-3.5 h-3.5', syncing && 'animate-spin')} />
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <p className="text-sm text-ink/50" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Loading…</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* KPI row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                  label={`Revenue (${days}d)`}
                  value={formatCurrency(current.total)}
                  trend={prev.total > 0 ? { pct: revTrend } : undefined}
                />
                <KpiCard
                  label={`Orders (${days}d)`}
                  value={String(current.count)}
                />
                <KpiCard
                  label="Avg Order Value"
                  value={formatCurrency(current.avg)}
                />
                <KpiCard
                  label="Prev Period Revenue"
                  value={formatCurrency(prev.total)}
                  sub={`${days}d ago`}
                />
              </div>

              {/* P&L */}
              {(() => {
                const FONT = { fontFamily: "'Jost', system-ui, sans-serif" }
                const rev = current.total
                const cogs = rev * (1 - blendedMargin / 100)
                const gross = rev - cogs
                const fmt = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                const rows = [
                  { label: 'Revenue', value: rev, source: 'Shopify', bold: false, divider: false },
                  { label: 'Cost of Goods Sold', value: -cogs, source: costedProductCount > 0 ? 'Inventory' : 'Inventory (est.)', bold: false, divider: false },
                  { label: 'Gross Profit', value: gross, source: null, bold: true, divider: true },
                ]
                return (
                  <div style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 12, padding: 22 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <h2 style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#2C2C2C', margin: 0, ...FONT }}>Profit &amp; Loss</h2>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 600, color: '#5c8a3f', background: 'rgba(160,198,109,0.16)', padding: '3px 9px', borderRadius: 999, ...FONT }}>
                          <span style={{ width: 5, height: 5, borderRadius: 999, background: '#A0C66D', display: 'inline-block' }} />Shopify
                        </span>
                        <a href="https://app.qbo.intuit.com" target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 600, color: '#a17a1f', background: 'rgba(240,215,122,0.25)', padding: '3px 9px', borderRadius: 999, textDecoration: 'none', ...FONT }}>
                          <span style={{ width: 5, height: 5, borderRadius: 999, background: '#F0D77A', display: 'inline-block' }} />QuickBooks ↗
                        </a>
                      </div>
                    </div>
                    <div>
                      {rows.map(r => (
                        <div key={r.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0', borderTop: r.divider ? '1px solid rgba(216,210,198,0.6)' : '1px solid rgba(216,210,198,0.25)' }}>
                          <span style={{ fontSize: r.bold ? 13.5 : 12.5, fontWeight: r.bold ? 700 : 400, color: '#2C2C2C', ...FONT }}>
                            {r.label}
                            {r.source && <span style={{ fontSize: 10.5, color: 'rgba(116,116,116,0.55)', fontWeight: 400, marginLeft: 6 }}>· {r.source}</span>}
                          </span>
                          <span style={{ fontSize: r.bold ? 15 : 13, fontWeight: r.bold ? 700 : 600, color: r.value < 0 ? '#a35a37' : '#2C2C2C', ...FONT }}>
                            {fmt(r.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p style={{ fontSize: 11.5, color: 'rgba(116,116,116,0.6)', margin: '14px 0 0', borderTop: '1px solid rgba(216,210,198,0.25)', paddingTop: 12, ...FONT }}>
                      Operating expenses and net profit tracked in{' '}
                      <a href="https://app.qbo.intuit.com" target="_blank" rel="noopener noreferrer" style={{ color: '#a17a1f', textDecoration: 'underline' }}>QuickBooks</a>
                      {costedProductCount === 0 ? ' · COGS estimated at ' + blendedMargin.toFixed(1) + '% margin' : ' · COGS from ' + costedProductCount + ' costed products'}.
                    </p>
                  </div>
                )
              })()}

              {/* Revenue by product */}
              <div className="bg-white rounded-xl border border-mushroom/50 p-6">
                <h2
                  className="text-xs font-semibold uppercase tracking-widest text-ink mb-5"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif", letterSpacing: '0.12em' }}
                >
                  Revenue by Product
                </h2>
                <RevenueBarChart data={productRevenue} />
              </div>

              {/* Recent orders table */}
              <div className="bg-white rounded-xl border border-mushroom/50 p-6">
                <h2
                  className="text-xs font-semibold uppercase tracking-widest text-ink mb-5"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif", letterSpacing: '0.12em' }}
                >
                  Recent Orders
                </h2>

                {orders.length === 0 ? (
                  <div className="py-6 text-center space-y-3">
                    <p className="text-sm text-ink/40" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                      No orders found for the last {days} days.
                    </p>
                    <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-butter-light border border-butter/40 rounded-xl text-xs text-ink/70 max-w-md" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                      <span className="text-base">💡</span>
                      <span>If you have existing orders, go to <a href="/marketing" className="font-semibold underline underline-offset-2">Marketing</a>, click <strong>Reconnect</strong> on the Shopify card, and re-authorize — this grants the <code className="bg-white/60 px-1 rounded">read_all_orders</code> permission needed for historical order data.</span>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-mushroom/40">
                          {['Order', 'Date', 'Customer', 'Total', 'Payment', 'Fulfillment', 'Actions'].map(h => (
                            <th
                              key={h}
                              className="text-left pb-3 text-[10px] font-semibold uppercase tracking-widest text-ink/50 pr-4"
                              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {orders.slice(0, 50).map(o => (
                          <OrderTableRow key={o.id} order={o} onUpdate={updated => setOrders(prev => prev.map(x => x.id === updated.id ? updated : x))} />
                        ))}
                      </tbody>
                    </table>
                    {orders.length > 50 && (
                      <p
                        className="text-xs text-ink/40 mt-3 text-center"
                        style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                      >
                        Showing 50 of {orders.length} orders
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
