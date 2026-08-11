'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, RefreshCw, X, Package, User } from 'lucide-react'

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
  total_tax: number
  total_discounts: number
  total_shipping: number
  discount_codes: string | null
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
  variant_title?: string | null
}

interface OrderDetail extends OrderRow {
  first_name: string | null
  last_name: string | null
  phone: string | null
  customer_orders_count: number | null
  customer_total_spent: number | null
}

interface ProductRevenue {
  title: string
  revenue: number
  quantity: number
}

type DateRange = 7 | 30 | 90

interface CogsBreakdownItem {
  title: string
  orders: number
  jars: number
  costPerUnit: number
  totalCogs: number
}

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
  const total    = orders.reduce((s, o) => s + (o.total_price ?? 0), 0)
  const subtotal = orders.reduce((s, o) => s + (o.subtotal_price ?? 0), 0)
  const totalTax = orders.reduce((s, o) => s + (Number(o.total_tax) || 0), 0)
  const count    = orders.length
  const avg      = count > 0 ? total / count : 0

  // Gross sales = sum of (line_item.price × qty) — matches Shopify Analytics.
  // total_discounts from the API includes shipping discounts, so we can't use
  // subtotal + total_discounts; that inflates gross sales by the shipping discount amount.
  let grossSales = 0
  for (const o of orders) {
    try {
      const items = JSON.parse(o.line_items) as Array<{ price: string; quantity: number }>
      grossSales += items.reduce((s, i) => s + parseFloat(i.price) * i.quantity, 0)
    } catch { /* skip malformed */ }
  }

  // Product-only discounts (excludes shipping discounts)
  const totalDiscounts = grossSales - subtotal
  // Effective shipping = what the customer actually paid after shipping discounts
  const totalShipping = total - subtotal - totalTax

  return { total, subtotal, totalDiscounts, totalShipping, totalTax, count, avg, grossSales }
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
  accent,
}: {
  label: string
  value: string
  sub?: string
  trend?: { pct: number }
  accent?: 'green'
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
        className="text-2xl font-semibold tabular-nums"
        style={{
          fontFamily: "'Jost', system-ui, sans-serif",
          color: accent === 'green' ? '#5c7a4e' : '#2C2C2C',
        }}
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

const STATUS_STYLES: Record<string, { classes: string; label: string }> = {
  paid:               { classes: 'bg-sage-light text-ink-dark',        label: 'Paid' },
  pending:            { classes: 'bg-butter-light text-ink-dark',      label: 'Pending' },
  refunded:           { classes: 'bg-terracotta-light text-ink-dark',  label: 'Refunded' },
  voided:             { classes: 'bg-mushroom/40 text-ink/60',         label: 'Voided' },
  authorized:         { classes: 'bg-blueberry-light text-ink-dark',   label: 'Authorized' },
  partially_refunded: { classes: 'bg-terracotta-light text-ink-dark',  label: 'Part. Refunded' },
  fulfilled:          { classes: 'bg-sage-light text-ink-dark',        label: 'Fulfilled' },
  unfulfilled:        { classes: 'bg-butter-light text-ink-dark',      label: 'Unfulfilled' },
  partial:            { classes: 'bg-blueberry-light text-ink-dark',   label: 'Partial' },
  in_progress:        { classes: 'bg-blueberry-light text-ink-dark',   label: 'In Progress' },
  cancelled:          { classes: 'bg-mushroom/40 text-ink/60',         label: 'Cancelled' },
  restocked:          { classes: 'bg-mushroom/40 text-ink/60',         label: 'Restocked' },
}

function StatusBadge({ status }: { status: string }) {
  const entry = STATUS_STYLES[status]
  return (
    <span
      className={cn(
        'text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full',
        entry?.classes ?? 'bg-mushroom/30 text-ink/60'
      )}
      style={{ fontFamily: "'Jost', system-ui, sans-serif", letterSpacing: '0.07em' }}
    >
      {entry?.label ?? status.replace(/_/g, ' ')}
    </span>
  )
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────

function ConfirmModal({
  action,
  orderNumber,
  onConfirm,
  onCancel,
}: {
  action: 'fulfill' | 'cancel'
  orderNumber: number
  onConfirm: () => void
  onCancel: () => void
}) {
  const FONT = { fontFamily: "'Jost', system-ui, sans-serif" }
  const isFulfill = action === 'fulfill'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* backdrop */}
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(44,44,44,0.3)', backdropFilter: 'blur(2px)' }}
        onClick={onCancel}
      />
      {/* panel */}
      <div style={{
        position: 'relative', background: '#fff', borderRadius: 14, padding: '28px 28px 22px',
        width: 340, boxShadow: '0 12px 48px rgba(0,0,0,0.14)', border: '1px solid rgba(216,210,198,0.6)',
      }}>
        <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.5)', margin: '0 0 6px', ...FONT }}>
          Order #{orderNumber}
        </p>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: '#2C2C2C', margin: '0 0 10px', fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
          {isFulfill ? 'Mark as Fulfilled?' : 'Cancel this Order?'}
        </h3>
        <p style={{ fontSize: 13, color: 'rgba(116,116,116,0.75)', lineHeight: 1.55, margin: '0 0 22px', ...FONT }}>
          {isFulfill
            ? 'This will mark the order as fulfilled in Shopify and send a shipping notification to the customer.'
            : 'This will void the order in Shopify. The payment will be refunded if already captured. This cannot be undone.'}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, padding: '10px 0', borderRadius: 8, background: 'transparent', color: '#2C2C2C', fontSize: 13, fontWeight: 600, border: '1px solid rgba(216,210,198,0.7)', cursor: 'pointer', ...FONT }}
          >
            Go back
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', ...FONT,
              background: isFulfill ? '#9BAE9A' : '#a35a37',
              color: '#fff',
            }}
          >
            {isFulfill ? 'Yes, fulfill' : 'Yes, cancel order'}
          </button>
        </div>
      </div>
    </div>
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
                className="h-full bg-sage rounded-md transition-all duration-500 flex items-center px-2"
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

// ─── Order Detail Drawer ──────────────────────────────────────────────────────

function OrderDetailDrawer({
  shopifyId,
  onClose,
  onUpdate,
}: {
  shopifyId: string
  onClose: () => void
  onUpdate: (o: OrderRow) => void
}) {
  const FONT = { fontFamily: "'Jost', system-ui, sans-serif" }
  const SERIF = { fontFamily: "'Cormorant Garamond', Georgia, serif" }
  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [acting, setActing] = useState<'fulfill' | 'cancel' | null>(null)
  const [pending, setPending] = useState<'fulfill' | 'cancel' | null>(null)

  useEffect(() => {
    fetch(`/api/shopify/orders/${shopifyId}`)
      .then(r => r.json())
      .then(d => setDetail(d as OrderDetail))
  }, [shopifyId])

  async function doFulfill() {
    if (!detail) return
    setPending(null)
    setActing('fulfill')
    const res = await fetch(`/api/shopify/orders/${detail.shopify_id}/fulfill`, { method: 'POST' })
    if (res.ok) {
      const updated = { ...detail, fulfillment_status: 'fulfilled' }
      setDetail(updated as OrderDetail)
      onUpdate(updated as OrderRow)
    }
    setActing(null)
  }

  async function doCancel() {
    if (!detail) return
    setPending(null)
    setActing('cancel')
    const res = await fetch(`/api/shopify/orders/${detail.shopify_id}/cancel`, { method: 'POST' })
    if (res.ok) {
      const updated = { ...detail, financial_status: 'voided', fulfillment_status: 'cancelled' }
      setDetail(updated as OrderDetail)
      onUpdate(updated as OrderRow)
    }
    setActing(null)
  }

  const canFulfill = detail && detail.fulfillment_status !== 'fulfilled' && detail.financial_status !== 'voided'
  const canCancel = detail && detail.financial_status !== 'voided' && detail.financial_status !== 'refunded'

  let items: LineItem[] = []
  if (detail?.line_items) {
    try { items = JSON.parse(detail.line_items) as LineItem[] } catch { /* skip */ }
  }

  const customerName = detail?.first_name
    ? `${detail.first_name} ${detail.last_name ?? ''}`.trim()
    : null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(44,44,44,0.18)' }}
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col bg-white shadow-2xl overflow-y-auto"
        style={{ width: 'min(420px, 100vw)', borderLeft: '1px solid rgba(216,210,198,0.6)' }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(216,210,198,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 3px', ...FONT }}>Order</p>
            <h2 style={{ ...SERIF, fontSize: 24, fontWeight: 700, margin: 0, color: '#2C2C2C' }}>
              #{detail?.order_number ?? '…'}
            </h2>
          </div>
          <button onClick={onClose} style={{ padding: 8, color: 'rgba(116,116,116,0.5)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 8 }}>
            <X size={18} />
          </button>
        </div>

        {!detail ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontSize: 13, color: 'rgba(116,116,116,0.5)', ...FONT }}>Loading…</p>
          </div>
        ) : (
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Status row */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <StatusBadge status={detail.financial_status} />
              <StatusBadge status={detail.fulfillment_status ?? 'unfulfilled'} />
            </div>

            {/* Customer */}
            <div style={{ background: '#FAF9F6', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <User size={13} style={{ color: 'rgba(116,116,116,0.5)' }} />
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.55)', ...FONT }}>Customer</span>
              </div>
              {customerName && (
                <p style={{ fontSize: 14, fontWeight: 600, color: '#2C2C2C', margin: '0 0 3px', ...FONT }}>{customerName}</p>
              )}
              <p style={{ fontSize: 13, color: 'rgba(116,116,116,0.7)', margin: '0 0 3px', ...FONT }}>{detail.email ?? '—'}</p>
              {detail.phone && (
                <p style={{ fontSize: 12, color: 'rgba(116,116,116,0.5)', margin: 0, ...FONT }}>{detail.phone}</p>
              )}
              {detail.customer_orders_count != null && detail.customer_orders_count > 1 && (
                <p style={{ fontSize: 11, color: 'rgba(116,116,116,0.45)', marginTop: 6, ...FONT }}>
                  {detail.customer_orders_count} orders · ${Number(detail.customer_total_spent ?? 0).toFixed(0)} lifetime
                </p>
              )}
            </div>

            {/* Items */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Package size={13} style={{ color: 'rgba(116,116,116,0.5)' }} />
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.55)', ...FONT }}>Items</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid rgba(216,210,198,0.35)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: '#2C2C2C', margin: '0 0 1px', ...FONT }}>{item.title}</p>
                      {item.variant_title && (
                        <p style={{ fontSize: 11, color: 'rgba(116,116,116,0.5)', margin: 0, ...FONT }}>{item.variant_title}</p>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, marginLeft: 12 }}>
                      <span style={{ fontSize: 12, color: 'rgba(116,116,116,0.5)', ...FONT }}>×{item.quantity}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#2C2C2C', fontVariantNumeric: 'tabular-nums', ...FONT }}>
                        {formatCurrency(parseFloat(item.price) * item.quantity)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            {(() => {
              let discountCodes: { code: string; amount: string }[] = []
              try { discountCodes = JSON.parse(detail.discount_codes ?? '[]') } catch { /* skip */ }
              const hasDiscount = detail.total_discounts > 0
              const hasShipping = detail.total_shipping > 0
              const hasTax = detail.total_tax > 0
              return (
                <div style={{ background: '#FAF9F6', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'rgba(116,116,116,0.6)', ...FONT }}>Subtotal</span>
                    <span style={{ fontSize: 12, color: '#2C2C2C', fontVariantNumeric: 'tabular-nums', ...FONT }}>{formatCurrency(detail.subtotal_price)}</span>
                  </div>
                  {hasDiscount && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 12, color: '#9BAE9A', ...FONT }}>
                        Discount{discountCodes.length > 0 && (
                          <span style={{ fontSize: 10, marginLeft: 5, fontWeight: 600, letterSpacing: '0.06em', opacity: 0.9 }}>
                            {discountCodes.map(d => d.code).join(', ')}
                          </span>
                        )}
                      </span>
                      <span style={{ fontSize: 12, color: '#9BAE9A', fontVariantNumeric: 'tabular-nums', ...FONT }}>−{formatCurrency(detail.total_discounts)}</span>
                    </div>
                  )}
                  {hasShipping && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: 'rgba(116,116,116,0.6)', ...FONT }}>Shipping</span>
                      <span style={{ fontSize: 12, color: '#2C2C2C', fontVariantNumeric: 'tabular-nums', ...FONT }}>{formatCurrency(detail.total_shipping)}</span>
                    </div>
                  )}
                  {hasTax && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: 'rgba(116,116,116,0.6)', ...FONT }}>Tax</span>
                      <span style={{ fontSize: 12, color: '#2C2C2C', fontVariantNumeric: 'tabular-nums', ...FONT }}>{formatCurrency(detail.total_tax)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid rgba(216,210,198,0.5)', marginTop: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#2C2C2C', ...FONT }}>Total</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#2C2C2C', fontVariantNumeric: 'tabular-nums', ...FONT }}>{formatCurrency(detail.total_price)}</span>
                  </div>
                </div>
              )
            })()}

            {/* Date */}
            <p style={{ fontSize: 11.5, color: 'rgba(116,116,116,0.5)', margin: 0, ...FONT }}>
              Placed {formatDate(detail.created_at)}
              {detail.processed_at && detail.processed_at !== detail.created_at && ` · Processed ${formatDate(detail.processed_at)}`}
            </p>

            {/* Confirm modal */}
            {pending && detail && (
              <ConfirmModal
                action={pending}
                orderNumber={detail.order_number}
                onConfirm={pending === 'fulfill' ? doFulfill : doCancel}
                onCancel={() => setPending(null)}
              />
            )}

            {/* Actions */}
            {(canFulfill || canCancel) && (
              <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
                {canFulfill && (
                  <button
                    onClick={() => setPending('fulfill')}
                    disabled={acting !== null}
                    style={{ flex: 1, padding: '10px 0', borderRadius: 8, background: acting === 'fulfill' ? 'rgba(155,174,154,0.5)' : '#9BAE9A', color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', cursor: acting !== null ? 'not-allowed' : 'pointer', opacity: acting !== null ? 0.6 : 1, ...FONT }}
                  >
                    {acting === 'fulfill' ? 'Fulfilling…' : 'Mark Fulfilled'}
                  </button>
                )}
                {canCancel && (
                  <button
                    onClick={() => setPending('cancel')}
                    disabled={acting !== null}
                    style={{ flex: canFulfill ? '0 0 auto' : 1, padding: '10px 16px', borderRadius: 8, background: 'transparent', color: '#a35a37', fontSize: 13, fontWeight: 600, border: '1px solid rgba(163,90,55,0.3)', cursor: acting !== null ? 'not-allowed' : 'pointer', opacity: acting !== null ? 0.6 : 1, ...FONT }}
                  >
                    {acting === 'cancel' ? 'Cancelling…' : 'Cancel Order'}
                  </button>
                )}
              </div>
            )}

            {/* Shopify link */}
            <a
              href={`https://admin.shopify.com/store/eiy0fe-13/orders/${detail.shopify_id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, color: 'rgba(116,116,116,0.5)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, ...FONT }}
            >
              View in Shopify ↗
            </a>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Order Table Row (with actions) ──────────────────────────────────────────

function OrderTableRow({ order, onUpdate, onSelect }: { order: OrderRow; onUpdate: (o: OrderRow) => void; onSelect: () => void }) {
  const [acting, setActing] = useState<'fulfill' | 'cancel' | null>(null)
  const [pending, setPending] = useState<'fulfill' | 'cancel' | null>(null)

  const canFulfill = order.fulfillment_status !== 'fulfilled' && order.financial_status !== 'voided'
  const canCancel = order.financial_status !== 'voided' && order.financial_status !== 'refunded'

  async function doFulfill() {
    setPending(null)
    setActing('fulfill')
    const res = await fetch(`/api/shopify/orders/${order.shopify_id}/fulfill`, { method: 'POST' })
    if (res.ok) onUpdate({ ...order, fulfillment_status: 'fulfilled' })
    setActing(null)
  }

  async function doCancel() {
    setPending(null)
    setActing('cancel')
    const res = await fetch(`/api/shopify/orders/${order.shopify_id}/cancel`, { method: 'POST' })
    if (res.ok) onUpdate({ ...order, financial_status: 'voided', fulfillment_status: 'cancelled' })
    setActing(null)
  }

  return (
    <>
      {pending && (
        <ConfirmModal
          action={pending}
          orderNumber={order.order_number}
          onConfirm={pending === 'fulfill' ? doFulfill : doCancel}
          onCancel={() => setPending(null)}
        />
      )}
      <tr
        className="border-b border-mushroom/20 hover:bg-oatmilk/30 transition-colors cursor-pointer"
        onClick={onSelect}
      >
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
        <td className="py-3" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-1.5">
            {canFulfill && (
              <button
                onClick={() => setPending('fulfill')}
                disabled={acting !== null}
                className="text-[10px] font-semibold px-2.5 py-1 rounded border bg-sage-light border-sage/40 text-ink-dark hover:bg-sage/40 transition-colors disabled:opacity-40 cursor-pointer"
                style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
              >
                {acting === 'fulfill' ? '…' : 'Fulfill'}
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => setPending('cancel')}
                disabled={acting !== null}
                className="text-[10px] font-semibold px-2.5 py-1 rounded border bg-mushroom/40 border-mushroom/60 text-ink/70 hover:bg-mushroom/60 transition-colors disabled:opacity-40 cursor-pointer"
                style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
              >
                {acting === 'cancel' ? '…' : 'Cancel'}
              </button>
            )}
          </div>
        </td>
      </tr>
    </>
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
  const [actualCogs, setActualCogs] = useState<number | null>(null)
  const [cogsUnitsSold, setCogsUnitsSold] = useState(0)
  const [totalUnitsOrdered, setTotalUnitsOrdered] = useState(0)
  const [totalJars, setTotalJars] = useState(0)
  const [costedProductCount, setCostedProductCount] = useState(0)
  const [cogsBreakdown, setCogsBreakdown] = useState<CogsBreakdownItem[]>([])
  const [cogsTooltipOpen, setCogsTooltipOpen] = useState(false)
  const cogsTooltipRef = useRef<HTMLDivElement>(null)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)

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

  async function loadCogs(d: DateRange) {
    const cogsRes = await fetch(`/api/inventory/cogs?days=${d}`)
    const cogsData = await cogsRes.json() as {
      cogs: number
      unitsSold: number
      totalUnitsOrdered: number
      totalJars: number
      costedProductCount: number
      breakdown: CogsBreakdownItem[]
    }
    setActualCogs(cogsData.cogs)
    setCogsUnitsSold(cogsData.unitsSold)
    setTotalUnitsOrdered(cogsData.totalUnitsOrdered)
    setTotalJars(cogsData.totalJars)
    setCostedProductCount(cogsData.costedProductCount)
    setCogsBreakdown(cogsData.breakdown ?? [])
  }

  // Close tooltip when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (cogsTooltipRef.current && !cogsTooltipRef.current.contains(e.target as Node)) {
        setCogsTooltipOpen(false)
      }
    }
    if (cogsTooltipOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [cogsTooltipOpen])

  async function loadAll(d: DateRange) {
    setLoading(true)
    const statusRes = await fetch('/api/shopify/connect')
    const status = await statusRes.json() as ShopifyStatus
    setShopifyStatus(status)
    if (status.connected) {
      await Promise.all([loadOrders(d), loadCogs(d)])
    }
    setLoading(false)
  }

  useEffect(() => { loadAll(days) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDaysChange(d: DateRange) {
    setDays(d)
    setLoading(true)
    await Promise.all([loadOrders(d), loadCogs(d)])
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
              {(() => {
                const grossSales = current.grossSales   // sum of line_item prices, matches Shopify
                const netSales = current.subtotal
                const oneMJ = totalJars
                const grossProfit = netSales - (actualCogs ?? 0) - oneMJ
                const grossMarginPct = netSales > 0 ? (grossProfit / netSales) * 100 : 0
                const prevGrossSales = prev.subtotal + prev.totalDiscounts
                const revTrendPct = prevGrossSales > 0 ? ((grossSales - prevGrossSales) / prevGrossSales) * 100 : 0
                return (
                  <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                    <KpiCard
                      label={`Gross Sales (${days}d)`}
                      value={formatCurrency(grossSales)}
                      trend={prevGrossSales > 0 ? { pct: revTrendPct } : undefined}
                      accent="green"
                    />
                    <KpiCard
                      label={`Orders (${days}d)`}
                      value={String(current.count)}
                    />
                    <KpiCard
                      label={`Units Sold (${days}d)`}
                      value={String(totalJars)}
                      sub="jars"
                    />
                    <KpiCard
                      label="Gross Margin"
                      value={actualCogs != null ? `${grossMarginPct.toFixed(1)}%` : '—'}
                      sub="after COGS & 1MJ"
                      accent="green"
                    />
                    <KpiCard
                      label="Avg Order Value"
                      value={formatCurrency(current.avg)}
                    />
                    <KpiCard
                      label="Prev Period Sales"
                      value={formatCurrency(prevGrossSales)}
                      sub={`${days}d ago`}
                    />
                  </div>
                )
              })()}

              {/* P&L */}
              {(() => {
                const FONT = { fontFamily: "'Jost', system-ui, sans-serif" }
                const grossSales = current.grossSales   // sum of line_item.price × qty
                const netSales = current.subtotal       // subtotal_price (after product discounts)
                const totalSales = current.total        // total_price = net sales + shipping + tax
                const cogs = actualCogs ?? 0
                const oneMJ = totalJars                 // $1 per jar
                const grossProfit = netSales - cogs - oneMJ
                const fmt = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

                const Row = ({ label, sub, value, dim, red, green, bold, divider, indent }: {
                  label: string; sub?: string; value: string
                  dim?: boolean; red?: boolean; green?: boolean; bold?: boolean; divider?: boolean; indent?: boolean
                }) => (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: bold ? '13px 0' : '9px 0',
                    borderTop: divider ? '1px solid rgba(216,210,198,0.6)' : '1px solid rgba(216,210,198,0.2)',
                    paddingLeft: indent ? 12 : 0,
                  }}>
                    <span style={{ fontSize: bold ? 13.5 : 12.5, fontWeight: bold ? 700 : 400, color: dim ? 'rgba(116,116,116,0.55)' : green ? '#5c7a4e' : '#2C2C2C', ...FONT }}>
                      {label}
                      {sub && <span style={{ fontSize: 10.5, color: 'rgba(116,116,116,0.45)', fontWeight: 400, marginLeft: 6 }}>{sub}</span>}
                    </span>
                    <span style={{ fontSize: bold ? 15 : 13, fontWeight: bold ? 700 : 600, fontVariantNumeric: 'tabular-nums', color: red ? '#a35a37' : green ? '#5c7a4e' : dim ? 'rgba(116,116,116,0.55)' : '#2C2C2C', ...FONT }}>
                      {value}
                    </span>
                  </div>
                )

                const SectionLabel = ({ children }: { children: string }) => (
                  <div style={{
                    fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
                    color: 'rgba(116,116,116,0.55)', padding: '7px 10px 6px',
                    background: 'rgba(216,210,198,0.18)', borderRadius: 6,
                    margin: '10px 0 2px', ...FONT
                  }}>{children}</div>
                )

                const shippingAndTax = current.totalShipping + current.totalTax

                return (
                  <div style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 12, padding: 22 }}>
                    {/* Header */}
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

                    {/* ── REVENUE ── */}
                    <SectionLabel>Revenue</SectionLabel>
                    <Row label="Gross Sales" value={fmt(grossSales)} green />
                    {current.totalDiscounts > 0 && <Row label="Discounts" sub="· applied at checkout" value={fmt(-current.totalDiscounts)} red indent />}
                    <Row label="Net Sales" value={fmt(netSales)} bold />
                    {shippingAndTax > 0 && (
                      <Row label="Shipping &amp; Tax" sub="· collected &amp; remitted" value={fmt(shippingAndTax)} dim indent />
                    )}

                    {/* ── COSTS ── */}
                    <SectionLabel>Costs</SectionLabel>

                    {/* Cost section */}
                    <div ref={cogsTooltipRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderTop: '1px solid rgba(216,210,198,0.2)' }}>
                      <button
                        onClick={() => setCogsTooltipOpen(v => !v)}
                        style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', padding: 0, cursor: cogsBreakdown.length > 0 ? 'pointer' : 'default', textAlign: 'left' }}
                      >
                        <span style={{ fontSize: 12.5, color: '#2C2C2C', ...FONT }}>
                          Cost of Goods Sold
                          <span style={{ fontSize: 10.5, color: 'rgba(116,116,116,0.45)', marginLeft: 6 }}>· Inventory</span>
                        </span>
                        {cogsBreakdown.length > 0 && (
                          <span style={{ marginLeft: 6, fontSize: 10, color: 'rgba(116,116,116,0.4)' }}>
                            {cogsTooltipOpen ? '▲' : '▼'}
                          </span>
                        )}
                      </button>
                      <span style={{ fontSize: 13, fontWeight: 600, color: cogs > 0 ? '#a35a37' : '#2C2C2C', fontVariantNumeric: 'tabular-nums', ...FONT }}>{fmt(-cogs)}</span>

                      {/* COGS breakdown tooltip */}
                      {cogsTooltipOpen && cogsBreakdown.length > 0 && (
                        <div style={{
                          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
                          background: '#fff', border: '1px solid rgba(216,210,198,0.8)',
                          borderRadius: 10, padding: '14px 16px', minWidth: 340,
                          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                        }}>
                          <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 10px', ...FONT }}>COGS Breakdown</p>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 56px 56px 72px', gap: 4, marginBottom: 6 }}>
                            {['Product', 'Units', 'Jars', 'COGS'].map(h => (
                              <span key={h} style={{ fontSize: 10, fontWeight: 600, color: 'rgba(116,116,116,0.5)', textAlign: h !== 'Product' ? 'right' : 'left', ...FONT }}>{h}</span>
                            ))}
                          </div>
                          {cogsBreakdown.map((item, i) => (
                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 56px 56px 72px', gap: 4, padding: '5px 0', borderTop: '1px solid rgba(216,210,198,0.3)' }}>
                              <span style={{ fontSize: 12, color: '#2C2C2C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...FONT }} title={item.title}>{item.title}</span>
                              <span style={{ fontSize: 12, color: '#2C2C2C', textAlign: 'right', fontVariantNumeric: 'tabular-nums', ...FONT }}>{item.orders}</span>
                              <span style={{ fontSize: 12, color: '#2C2C2C', textAlign: 'right', fontVariantNumeric: 'tabular-nums', ...FONT }}>{item.jars}</span>
                              <span style={{ fontSize: 12, color: '#a35a37', textAlign: 'right', fontVariantNumeric: 'tabular-nums', ...FONT }}>{fmt(-item.totalCogs)}</span>
                            </div>
                          ))}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 56px 56px 72px', gap: 4, padding: '7px 0 0', borderTop: '1px solid rgba(216,210,198,0.6)', marginTop: 2 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#2C2C2C', ...FONT }}>Total</span>
                            <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#2C2C2C', ...FONT }}>{cogsUnitsSold}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#2C2C2C', ...FONT }}>{totalJars}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#a35a37', ...FONT }}>{fmt(-cogs)}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 1 Million Jars */}
                    <Row
                      label="1 Million Jars"
                      sub={`· $1 × ${totalJars} jars`}
                      value={fmt(-oneMJ)}
                      red
                    />

                    {/* Gross Profit */}
                    <Row
                      label="Gross Profit"
                      value={fmt(grossProfit)}
                      bold
                      divider
                      green={grossProfit > 0}
                      red={grossProfit < 0}
                    />

                    <p style={{ fontSize: 11.5, color: 'rgba(116,116,116,0.6)', margin: '14px 0 0', borderTop: '1px solid rgba(216,210,198,0.25)', paddingTop: 12, ...FONT }}>
                      Operating expenses and net profit tracked in{' '}
                      <a href="https://app.qbo.intuit.com" target="_blank" rel="noopener noreferrer" style={{ color: '#a17a1f', textDecoration: 'underline' }}>QuickBooks</a>
                      {costedProductCount === 0
                        ? ' · Add ingredient & packaging costs in Inventory to track COGS'
                        : ' · COGS = units sold × cost per unit · Gross Profit = Net Sales − COGS − 1MJ'
                      }.
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
                          <OrderTableRow
                            key={o.id}
                            order={o}
                            onUpdate={updated => setOrders(prev => prev.map(x => x.id === updated.id ? updated : x))}
                            onSelect={() => setSelectedOrderId(String(o.shopify_id))}
                          />
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

      {selectedOrderId && (
        <OrderDetailDrawer
          shopifyId={selectedOrderId}
          onClose={() => setSelectedOrderId(null)}
          onUpdate={updated => {
            setOrders(prev => prev.map(x => String(x.shopify_id) === String(updated.shopify_id) ? updated : x))
          }}
        />
      )}
    </div>
  )
}
