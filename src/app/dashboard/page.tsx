'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  TrendingUp, TrendingDown, Package, Users, Mail, ClipboardList,
  AlertCircle, ArrowUpRight, RefreshCw, Loader2, MessageCircle,
  ShoppingBag, Star,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface DashData {
  revenue: {
    last30d: number; orders30d: number; aov: number
    thisWeek: number; ordersThisWeek: number; weekChange: number | null
    allTime: number; allTimeOrders: number
  }
  dailyRevenue: { day: string; revenue: number; orders: number }[]
  topProducts: { product: string; units: number; revenue: number }[]
  customers: { total: number; byMonth: { month: string; new_customers: number }[]; repeatBuyers: number }
  email: { totalSubscribers: number; lists: { name: string; profile_count: number }[]; recentCampaigns: { name: string; send_time: string; unique_opens: number; unique_clicks: number; revenue: number }[] }
  inventory: { active_skus: number; draft_skus: number; negative_stock: number; zero_stock: number; critical_low: number; healthy: number }
  tasks: { total: number; done: number; overdue: number; urgent: number }
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const FONT  = "'Jost', system-ui, sans-serif"
const SERIF = "'Cormorant Garamond', Georgia, serif"

function fmt$(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}
function fmtFull$(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function shortMonth(m: string) {
  const [, mo] = m.split('-')
  return ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(mo)] ?? m
}
function shortDay(d: string) {
  const dt = new Date(d + 'T12:00:00')
  return (dt.getMonth() + 1) + '/' + dt.getDate()
}

// ── Inline SVG bar chart ──────────────────────────────────────────────────────
function BarChart({ data, valueKey, labelKey, color = 'var(--wdp-neon, #D7FF10)', height = 80 }: {
  data: Record<string, number | string>[]
  valueKey: string
  labelKey: string
  color?: string
  height?: number
}) {
  const values = data.map(d => Number(d[valueKey]) ?? 0)
  const max = Math.max(...values, 1)
  const W = 100 / data.length

  return (
    <div style={{ width: '100%', overflow: 'hidden' }}>
      <svg viewBox={`0 0 ${data.length * 24} ${height + 22}`} style={{ width: '100%', display: 'block' }} preserveAspectRatio="none">
        {data.map((d, i) => {
          const v = Number(d[valueKey]) ?? 0
          const barH = max > 0 ? (v / max) * height : 0
          const x = i * 24
          return (
            <g key={i}>
              <rect
                x={x + 2}
                y={height - barH}
                width={20}
                height={barH}
                rx={3}
                fill={v > 0 ? color : 'rgba(120,120,120,0.15)'}
                opacity={v > 0 ? 0.9 : 1}
              />
              <text
                x={x + 12}
                y={height + 14}
                textAnchor="middle"
                fontSize={8}
                fill="rgba(116,116,116,0.7)"
                fontFamily={FONT}
              >
                {String(d[labelKey])}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// Horizontal bar chart for top products
function HBarChart({ data, max }: { data: { label: string; value: number }[]; max: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {data.map((d, i) => (
        <div key={i}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontFamily: FONT, fontSize: 12, color: 'var(--wdp-ink)', fontWeight: 500, lineHeight: 1.2 }}>{d.label}</span>
            <span style={{ fontFamily: FONT, fontSize: 12, color: 'var(--wdp-ink-mid)', fontVariantNumeric: 'tabular-nums' }}>{fmt$(d.value)}</span>
          </div>
          <div style={{ height: 5, background: 'var(--wdp-border)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.max((d.value / max) * 100, 2)}%`,
              background: i === 0 ? 'var(--wdp-neon, #D7FF10)' : i === 1 ? '#C27A54' : 'var(--wdp-ink-mid)',
              borderRadius: 99,
              opacity: 1 - i * 0.1,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── KPI tile ──────────────────────────────────────────────────────────────────
function KPITile({
  label, value, sub, icon: Icon, iconColor, iconBg, delta, deltaLabel, alert,
}: {
  label: string; value: string; sub?: string
  icon: React.ElementType; iconColor: string; iconBg: string
  delta?: number | null; deltaLabel?: string; alert?: boolean
}) {
  const up = delta !== undefined && delta !== null && delta >= 0
  const DeltaIcon = up ? TrendingUp : TrendingDown

  return (
    <div style={{
      background: 'var(--wdp-surface, #FFFFFF)',
      border: '1px solid var(--wdp-border)',
      borderRadius: 12,
      padding: '16px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      ...(alert ? { borderLeftWidth: 3, borderLeftColor: '#C14B3A' } : {}),
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)' }}>
          {label}
        </span>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={13} style={{ color: iconColor }} strokeWidth={2} />
        </div>
      </div>
      <div>
        <div style={{ fontFamily: FONT, fontSize: 24, fontWeight: 800, color: 'var(--wdp-ink)', lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>
          {value}
        </div>
        {sub && <div style={{ fontFamily: FONT, fontSize: 11, color: 'var(--wdp-ink-mid)', marginTop: 4 }}>{sub}</div>}
      </div>
      {delta !== undefined && delta !== null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <DeltaIcon size={11} style={{ color: up ? '#2A7A52' : '#C14B3A' }} strokeWidth={2.5} />
          <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: up ? '#2A7A52' : '#C14B3A' }}>
            {Math.abs(delta)}% {deltaLabel ?? (up ? 'vs last week' : 'vs last week')}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <h2 style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 700, color: 'var(--wdp-ink)', letterSpacing: '-0.3px', margin: 0 }}>
        {title}
      </h2>
      {action && (
        <button onClick={onAction} style={{
          fontFamily: FONT, fontSize: 11, fontWeight: 600, color: 'var(--wdp-ink-mid)',
          background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.05em',
        }}>
          {action}
        </button>
      )}
    </div>
  )
}

// ── Card wrapper ──────────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--wdp-surface, #FFFFFF)',
      border: '1px solid var(--wdp-border)',
      borderRadius: 12,
      padding: '18px 20px',
      ...style,
    }}>
      {children}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function load(showRefresh = false) {
    if (showRefresh) setRefreshing(true)
    const d = await fetch('/api/dashboard').then(r => r.json())
    setData(d)
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <div className="page-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 400 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontSize: 13, color: 'var(--wdp-ink-mid)' }}>
          <Loader2 size={16} className="animate-spin" /> Loading dashboard…
        </div>
      </div>
    )
  }

  if (!data) return null
  const { revenue, dailyRevenue, topProducts, customers, email, inventory, tasks } = data

  // Daily revenue chart data (last 14 days, fill missing days)
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i))
    const day = d.toISOString().slice(0, 10)
    const found = dailyRevenue.find(r => r.day === day)
    return { day, label: shortDay(day), revenue: found?.revenue ?? 0, orders: found?.orders ?? 0 }
  })

  const topProdMax = Math.max(...topProducts.map(p => p.revenue), 1)

  const custMonths = customers.byMonth.slice(-6)

  return (
    <div className="page-wrap" style={{ maxWidth: 1100, background: 'var(--wdp-ground, #FAF9F6)' }}>

      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)', marginBottom: 4 }}>
            Weeknight Dinner Party
          </div>
          <h1 style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 700, color: 'var(--wdp-ink)', margin: 0, letterSpacing: '-0.5px' }}>
            Business Dashboard
          </h1>
          <div style={{ fontFamily: FONT, fontSize: 12, color: 'var(--wdp-ink-mid)', marginTop: 4 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => load(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: FONT, fontSize: 12, fontWeight: 600, color: 'var(--wdp-ink-mid)',
              background: 'var(--wdp-surface)', border: '1px solid var(--wdp-border)',
              borderRadius: 8, padding: '7px 12px', cursor: 'pointer',
            }}
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
          <Link href="/chat" style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontFamily: FONT, fontSize: 12, fontWeight: 700, color: '#000',
            background: 'var(--wdp-neon, #D7FF10)', border: 'none',
            borderRadius: 8, padding: '7px 14px', cursor: 'pointer', textDecoration: 'none',
          }}>
            <MessageCircle size={12} />
            Ask Rose Mary
          </Link>
        </div>
      </div>

      {/* ── Alert banner if issues ──────────────────────────────────────────── */}
      {(inventory.negative_stock > 0 || tasks.overdue > 0) && (
        <div style={{
          background: 'rgba(193,75,58,0.07)', border: '1px solid rgba(193,75,58,0.22)',
          borderRadius: 10, padding: '10px 16px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <AlertCircle size={14} style={{ color: '#C14B3A', flexShrink: 0 }} strokeWidth={2} />
          <span style={{ fontFamily: FONT, fontSize: 12.5, color: '#C14B3A', fontWeight: 600 }}>
            {[
              inventory.negative_stock > 0 && `${inventory.negative_stock} SKU with negative Shopify stock`,
              tasks.overdue > 0 && `${tasks.overdue} overdue task${tasks.overdue > 1 ? 's' : ''}`,
            ].filter(Boolean).join(' · ')}
          </span>
          <Link href="/chat" style={{ marginLeft: 'auto', fontFamily: FONT, fontSize: 11.5, fontWeight: 700, color: '#C14B3A', textDecoration: 'none' }}>
            Ask Rose Mary →
          </Link>
        </div>
      )}

      {/* ── KPI tiles ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 28 }}>
        <KPITile
          label="Revenue · 30 days"
          value={fmtFull$(revenue.last30d)}
          sub={`${revenue.orders30d} orders · ${fmtFull$(revenue.aov)} AOV`}
          icon={TrendingUp}
          iconColor="#2A7A52"
          iconBg="rgba(128,230,166,0.18)"
          delta={revenue.weekChange}
        />
        <KPITile
          label="This Week"
          value={fmtFull$(revenue.thisWeek)}
          sub={`${revenue.ordersThisWeek} order${revenue.ordersThisWeek !== 1 ? 's' : ''}`}
          icon={ShoppingBag}
          iconColor="#4A7C8A"
          iconBg="rgba(120,183,197,0.18)"
          delta={revenue.weekChange}
        />
        <KPITile
          label="Email List"
          value={email.totalSubscribers.toString()}
          sub={`${email.lists.find(l => l.name.toLowerCase().includes('email'))?.profile_count ?? 0} email · ${email.lists.find(l => l.name.toLowerCase().includes('text'))?.profile_count ?? 0} SMS`}
          icon={Mail}
          iconColor="#78B7C5"
          iconBg="rgba(120,183,197,0.18)"
        />
        <KPITile
          label="Customers"
          value={customers.total.toString()}
          sub={`${customers.repeatBuyers} repeat buyers`}
          icon={Users}
          iconColor="#C27A54"
          iconBg="rgba(194,122,84,0.12)"
        />
        <KPITile
          label="Active SKUs"
          value={inventory.active_skus.toString()}
          sub={`${inventory.draft_skus} in draft · ${inventory.healthy} healthy`}
          icon={Package}
          iconColor={inventory.negative_stock > 0 ? '#C14B3A' : '#747474'}
          iconBg={inventory.negative_stock > 0 ? 'rgba(193,75,58,0.10)' : 'rgba(120,120,120,0.12)'}
          alert={inventory.negative_stock > 0}
        />
        <KPITile
          label="Tasks"
          value={tasks.total.toString()}
          sub={`${tasks.done} done · ${tasks.overdue} overdue · ${tasks.urgent} urgent`}
          icon={ClipboardList}
          iconColor={tasks.overdue > 0 ? '#C27A54' : '#747474'}
          iconBg={tasks.overdue > 0 ? 'rgba(194,122,84,0.12)' : 'rgba(120,120,120,0.12)'}
          alert={tasks.overdue > 2}
        />
      </div>

      {/* ── Two-column grid ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Revenue sparkline */}
        <Card>
          <SectionHead title="Daily Revenue" />
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontFamily: FONT, fontSize: 20, fontWeight: 800, color: 'var(--wdp-ink)', letterSpacing: '-0.4px', fontVariantNumeric: 'tabular-nums' }}>
              {fmtFull$(revenue.last30d)}
            </span>
            <span style={{ fontFamily: FONT, fontSize: 11, color: 'var(--wdp-ink-mid)', marginLeft: 8 }}>last 30 days</span>
          </div>
          <BarChart
            data={last14}
            valueKey="revenue"
            labelKey="label"
            color="var(--wdp-neon, #D7FF10)"
            height={72}
          />
          {last14.every(d => d.revenue === 0) && (
            <div style={{ fontFamily: FONT, fontSize: 11, color: 'var(--wdp-ink-dim)', textAlign: 'center', marginTop: 8 }}>
              No sales data in the last 14 days
            </div>
          )}
        </Card>

        {/* Customer growth */}
        <Card>
          <SectionHead title="Customer Growth" />
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontFamily: FONT, fontSize: 20, fontWeight: 800, color: 'var(--wdp-ink)', letterSpacing: '-0.4px' }}>
              {customers.total}
            </span>
            <span style={{ fontFamily: FONT, fontSize: 11, color: 'var(--wdp-ink-mid)', marginLeft: 8 }}>total customers</span>
          </div>
          <BarChart
            data={custMonths.map(m => ({ ...m, label: shortMonth(m.month), value: m.new_customers }))}
            valueKey="value"
            labelKey="label"
            color="#C27A54"
            height={72}
          />
          <div style={{ fontFamily: FONT, fontSize: 11, color: 'var(--wdp-ink-mid)', marginTop: 8 }}>
            {custMonths.length > 1 && (() => {
              const last = custMonths[custMonths.length - 1]
              const prev = custMonths[custMonths.length - 2]
              const delta = last.new_customers - prev.new_customers
              return delta >= 0
                ? `↑ ${delta} more new customers than ${shortMonth(prev.month)}`
                : `↓ ${Math.abs(delta)} fewer new customers than ${shortMonth(prev.month)}`
            })()}
          </div>
        </Card>
      </div>

      {/* ── Top products + Email ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Top products */}
        <Card>
          <SectionHead title="Top Products" action="View inventory →" onAction={() => window.location.href = '/inventory'} />
          {topProducts.length > 0 ? (
            <HBarChart
              data={topProducts.slice(0, 6).map(p => ({ label: p.product, value: p.revenue }))}
              max={topProdMax}
            />
          ) : (
            <div style={{ fontFamily: FONT, fontSize: 12, color: 'var(--wdp-ink-dim)', textAlign: 'center', padding: '24px 0' }}>
              No sales data yet
            </div>
          )}
        </Card>

        {/* Email performance */}
        <Card>
          <SectionHead title="Email" action="View campaigns →" onAction={() => window.location.href = '/email'} />
          <div style={{ display: 'flex', gap: 16, marginBottom: 18 }}>
            {email.lists.map(l => (
              <div key={l.name} style={{ flex: 1 }}>
                <div style={{ fontFamily: FONT, fontSize: 20, fontWeight: 800, color: 'var(--wdp-ink)', letterSpacing: '-0.4px' }}>
                  {l.profile_count}
                </div>
                <div style={{ fontFamily: FONT, fontSize: 10.5, color: 'var(--wdp-ink-mid)', marginTop: 2 }}>{l.name}</div>
              </div>
            ))}
          </div>
          {email.recentCampaigns.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontFamily: FONT, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)', marginBottom: 2 }}>
                Recent Campaigns
              </div>
              {email.recentCampaigns.slice(0, 3).map((c, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 0', borderBottom: i < 2 ? '1px solid var(--wdp-border)' : 'none',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 500, color: 'var(--wdp-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.name || '(Untitled)'}
                    </div>
                    <div style={{ fontFamily: FONT, fontSize: 10.5, color: 'var(--wdp-ink-mid)', marginTop: 1 }}>
                      {new Date(c.send_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexShrink: 0, marginLeft: 8 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: 'var(--wdp-ink)', fontVariantNumeric: 'tabular-nums' }}>
                        {c.unique_opens ?? 0}
                      </div>
                      <div style={{ fontFamily: FONT, fontSize: 9.5, color: 'var(--wdp-ink-dim)' }}>opens</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: 'var(--wdp-ink)', fontVariantNumeric: 'tabular-nums' }}>
                        {c.unique_clicks ?? 0}
                      </div>
                      <div style={{ fontFamily: FONT, fontSize: 9.5, color: 'var(--wdp-ink-dim)' }}>clicks</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontFamily: FONT, fontSize: 12, color: 'var(--wdp-ink-dim)', textAlign: 'center', padding: '12px 0' }}>
              No campaigns sent yet
            </div>
          )}
        </Card>
      </div>

      {/* ── GA4 placeholder + Inventory ──────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* GA4 placeholder */}
        <Card style={{ position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            background: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(216,210,198,0.08) 10px, rgba(216,210,198,0.08) 11px)',
          }} />
          <div style={{ position: 'relative' }}>
            <SectionHead title="Website Analytics" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {['Sessions', 'Bounce Rate', 'Avg. Time on Page', 'Top Countries'].map(metric => (
                <div key={metric} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: FONT, fontSize: 12.5, color: 'var(--wdp-ink-mid)' }}>{metric}</span>
                  <span style={{
                    fontFamily: FONT, fontSize: 11, color: 'var(--wdp-ink-dim)',
                    background: 'var(--wdp-border)', borderRadius: 4, padding: '3px 8px',
                  }}>
                    —
                  </span>
                </div>
              ))}
              <Link href="/settings" style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontFamily: FONT, fontSize: 11.5, fontWeight: 700,
                color: 'var(--wdp-ink)', textDecoration: 'none',
                background: 'var(--wdp-neon, #D7FF10)', borderRadius: 7, padding: '7px 14px',
                marginTop: 4, alignSelf: 'flex-start',
              }}>
                <ArrowUpRight size={12} />
                Connect Google Analytics
              </Link>
            </div>
          </div>
        </Card>

        {/* Inventory health */}
        <Card>
          <SectionHead title="Inventory Health" action="View all →" onAction={() => window.location.href = '/inventory'} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Healthy', value: inventory.healthy, color: '#2A7A52', bg: 'rgba(128,230,166,0.15)' },
              { label: 'Critical (≤5)', value: inventory.critical_low, color: '#C27A54', bg: 'rgba(194,122,84,0.12)' },
              { label: 'Oversell', value: inventory.negative_stock, color: '#C14B3A', bg: 'rgba(193,75,58,0.10)' },
              { label: 'Draft', value: inventory.draft_skus, color: '#747474', bg: 'rgba(120,120,120,0.12)' },
            ].map(s => (
              <div key={s.label} style={{
                background: s.bg, borderRadius: 9, padding: '10px 12px',
              }}>
                <div style={{ fontFamily: FONT, fontSize: 18, fontWeight: 800, color: s.color, fontVariantNumeric: 'tabular-nums' }}>
                  {s.value}
                </div>
                <div style={{ fontFamily: FONT, fontSize: 10.5, color: s.color, marginTop: 2, opacity: 0.8 }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
          {inventory.negative_stock > 0 && (
            <div style={{
              background: 'rgba(193,75,58,0.08)', border: '1px solid rgba(193,75,58,0.2)',
              borderRadius: 8, padding: '9px 12px',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <AlertCircle size={13} style={{ color: '#C14B3A', flexShrink: 0 }} strokeWidth={2} />
              <span style={{ fontFamily: FONT, fontSize: 11.5, color: '#C14B3A' }}>
                {inventory.negative_stock} SKU with negative stock — sync with Shopify or recount
              </span>
            </div>
          )}
        </Card>
      </div>

      {/* ── All-time stats footer ─────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--wdp-surface)', border: '1px solid var(--wdp-border)',
        borderRadius: 12, padding: '16px 20px',
        display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontFamily: FONT, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)', marginBottom: 4 }}>
            All-Time Revenue
          </div>
          <div style={{ fontFamily: FONT, fontSize: 22, fontWeight: 800, color: 'var(--wdp-ink)', letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums' }}>
            {fmtFull$(revenue.allTime)}
          </div>
        </div>
        <div style={{ width: 1, height: 40, background: 'var(--wdp-border)', flexShrink: 0 }} />
        <div>
          <div style={{ fontFamily: FONT, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)', marginBottom: 4 }}>
            Total Orders
          </div>
          <div style={{ fontFamily: FONT, fontSize: 22, fontWeight: 800, color: 'var(--wdp-ink)', letterSpacing: '-0.5px' }}>
            {revenue.allTimeOrders}
          </div>
        </div>
        <div style={{ width: 1, height: 40, background: 'var(--wdp-border)', flexShrink: 0 }} />
        <div>
          <div style={{ fontFamily: FONT, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)', marginBottom: 4 }}>
            Email + SMS
          </div>
          <div style={{ fontFamily: FONT, fontSize: 22, fontWeight: 800, color: 'var(--wdp-ink)', letterSpacing: '-0.5px' }}>
            {email.totalSubscribers}
          </div>
        </div>
        <div style={{ width: 1, height: 40, background: 'var(--wdp-border)', flexShrink: 0 }} />
        <div>
          <div style={{ fontFamily: FONT, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)', marginBottom: 4 }}>
            Brand Age
          </div>
          <div style={{ fontFamily: FONT, fontSize: 22, fontWeight: 800, color: 'var(--wdp-ink)', letterSpacing: '-0.5px' }}>
            {(() => {
              const launch = new Date('2026-04-01')
              const now = new Date()
              const months = Math.floor((now.getTime() - launch.getTime()) / (1000 * 60 * 60 * 24 * 30))
              return `${months}mo`
            })()}
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Link href="/chat" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: FONT, fontSize: 12, fontWeight: 700, color: '#000',
            background: 'var(--wdp-neon, #D7FF10)', borderRadius: 8, padding: '8px 16px',
            textDecoration: 'none',
          }}>
            <Star size={12} />
            Ask Rose Mary to analyze this
          </Link>
        </div>
      </div>
    </div>
  )
}
