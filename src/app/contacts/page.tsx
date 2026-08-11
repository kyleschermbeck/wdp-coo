'use client'

import { useEffect, useState, useCallback } from 'react'
import { Search, RefreshCw, ChevronRight, X, ShoppingBag, DollarSign, Users, Mail, MousePointer, ShoppingCart, Eye, Send, AlertCircle, Package, TrendingUp, Calendar } from 'lucide-react'
import { format, parseISO, formatDistanceToNow } from 'date-fns'

const FONT   = "'Jost', system-ui, sans-serif"
const SERIF  = "'Cormorant Garamond', Georgia, serif"
const INK    = '#2C2C2C'
const INK_LIGHT = 'rgba(44,44,44,0.55)'
const MUSHROOM  = '#D8D2C6'
const OATMILK   = '#F2EDE5'
const BORDER    = `1px solid ${MUSHROOM}`
const ACCENT    = '#C27A54'
const GREEN     = '#7A9E7E'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShopifyCustomer {
  id: number
  shopify_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  orders_count: number
  total_spent: number
  tags: string | null
  note: string | null
  created_at: string | null
}

interface OrderItem { title: string; quantity: number; price: number; variant_title: string | null }
interface JourneyOrder {
  shopify_id: string; order_number: number
  total_price: number; financial_status: string; fulfillment_status: string | null
  created_at: string; items: OrderItem[]
}

interface KlaviyoProfile {
  klaviyo_id: string; email: string | null
  first_name: string | null; last_name: string | null; created: string | null
}

interface JourneyMetrics {
  total_orders: number; total_spent: number; avg_order_value: number
  first_order_date: string | null; last_order_date: string | null
  subscribed_date: string | null; days_to_first_purchase: number | null
  favorite_product: string | null; in_klaviyo: boolean
  has_ordered: boolean; is_prospect: boolean
}

interface Journey {
  email: string
  orders: JourneyOrder[]
  klaviyo_profile: KlaviyoProfile | null
  lists: Array<{ list_id: string; list_name: string }>
  metrics: JourneyMetrics
}

interface Prospect {
  klaviyo_id: string; email: string
  first_name: string | null; last_name: string | null
  subscribed_at: string | null; lists: string | null
}

interface KlaviyoEvent {
  id: string; datetime: string; metric: string
  properties: Record<string, unknown>
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EVENT_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  'Received Email':     { icon: Mail,         color: GREEN,   label: 'Received Email' },
  'Opened Email':       { icon: Eye,          color: '#6B9AB8', label: 'Opened Email' },
  'Clicked Email':      { icon: MousePointer, color: ACCENT,  label: 'Clicked Link' },
  'Placed Order':       { icon: ShoppingCart, color: '#A17A1F', label: 'Placed Order' },
  'Unsubscribed':       { icon: AlertCircle,  color: '#B05050', label: 'Unsubscribed' },
  'Subscribed to List': { icon: Send,         color: GREEN,   label: 'Subscribed' },
}
function eventMeta(metric: string) {
  return EVENT_META[metric] ?? { icon: Mail, color: INK_LIGHT, label: metric }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${n.toFixed(2)}`
}

function initials(c: ShopifyCustomer | Prospect) {
  const f = c.first_name?.[0] ?? ''
  const l = c.last_name?.[0] ?? ''
  if (f || l) return (f + l).toUpperCase()
  return (c.email?.[0] ?? '?').toUpperCase()
}

function displayName(c: ShopifyCustomer | Prospect) {
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ')
  return name || c.email || 'Unknown'
}

function statusColor(status: string) {
  switch (status) {
    case 'paid':        return { bg: '#EEF7F0', color: '#3A7A3A', border: '#B8DFC0' }
    case 'refunded':    return { bg: '#FFF0EE', color: '#B05050', border: '#F0C0B8' }
    case 'fulfilled':   return { bg: '#EEF7F0', color: '#3A7A3A', border: '#B8DFC0' }
    case 'unfulfilled': return { bg: '#FFF8EE', color: '#A06010', border: '#E8D090' }
    default:            return { bg: OATMILK,   color: INK_LIGHT, border: MUSHROOM }
  }
}

// ─── Klaviyo event timeline ───────────────────────────────────────────────────

function KlaviyoTimeline({ email }: { email: string | null }) {
  const [events, setEvents] = useState<KlaviyoEvent[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!email) { setLoading(false); return }
    setLoading(true)
    setEvents(null)
    fetch(`/api/klaviyo/events?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then((d: { events?: KlaviyoEvent[] }) => setEvents(d.events ?? []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false))
  }, [email])

  if (loading) return <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT }}>Loading email history…</p>
  if (!events || events.length === 0) return <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT }}>No email events found in Klaviyo.</p>

  return (
    <div>
      <p style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK_LIGHT, marginBottom: 12 }}>Email History</p>
      <div style={{ position: 'relative', paddingLeft: 28 }}>
        {/* vertical line */}
        <div style={{ position: 'absolute', left: 9, top: 0, bottom: 0, width: 1.5, background: MUSHROOM }} />
        {events.map((ev, i) => {
          const meta = eventMeta(ev.metric)
          const Icon = meta.icon
          const subject = (ev.properties['Subject'] ?? ev.properties['subject']) as string | undefined
          const value   = ev.properties['$value'] ?? ev.properties['value']
          const listName = (ev.properties['List Name'] ?? ev.properties['list_name']) as string | undefined
          const dt = parseISO(ev.datetime)
          return (
            <div key={ev.id} style={{ display: 'flex', gap: 12, paddingBottom: i < events.length - 1 ? 12 : 0 }}>
              <div style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: meta.color + '20', border: `1.5px solid ${meta.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
                <Icon style={{ width: 10, height: 10, color: meta.color }} />
              </div>
              <div style={{ flex: 1, paddingTop: 1 }}>
                <p style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: INK, margin: 0 }}>{meta.label}</p>
                {subject  && <p style={{ fontFamily: FONT, fontSize: 11, color: INK_LIGHT, margin: '1px 0 0', lineHeight: 1.4 }}>{subject}</p>}
                {listName && <p style={{ fontFamily: FONT, fontSize: 11, color: INK_LIGHT, margin: '1px 0 0' }}>{listName}</p>}
                {value != null && <p style={{ fontFamily: FONT, fontSize: 11, color: GREEN, margin: '1px 0 0', fontWeight: 600 }}>${Number(value).toFixed(2)}</p>}
                <p style={{ fontFamily: FONT, fontSize: 10, color: INK_LIGHT, margin: '2px 0 0', opacity: 0.7 }}>{format(dt, 'MMM d, yyyy · h:mm a')}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Order history section ────────────────────────────────────────────────────

function OrderHistory({ orders }: { orders: JourneyOrder[] }) {
  if (orders.length === 0) return (
    <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT }}>No orders found.</p>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {orders.map(o => {
        const fs = statusColor(o.financial_status)
        const ff = o.fulfillment_status ? statusColor(o.fulfillment_status) : null
        return (
          <div key={o.shopify_id} style={{ background: OATMILK, borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: INK }}>Order #{o.order_number}</span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: fs.bg, color: fs.color, border: `1px solid ${fs.border}` }}>{o.financial_status}</span>
                {ff && o.fulfillment_status && <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, background: ff.bg, color: ff.color, border: `1px solid ${ff.border}` }}>{o.fulfillment_status}</span>}
              </div>
            </div>
            <p style={{ fontFamily: FONT, fontSize: 10, color: INK_LIGHT, margin: '0 0 8px' }}>{format(parseISO(o.created_at), 'MMM d, yyyy')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {o.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: FONT, fontSize: 11, color: INK }}>
                    {item.quantity > 1 ? `${item.quantity}× ` : ''}{item.title}
                    {item.variant_title && <span style={{ color: INK_LIGHT }}> · {item.variant_title}</span>}
                  </span>
                  <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: INK }}>${(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div style={{ borderTop: BORDER, marginTop: 8, paddingTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
              <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: INK }}>{fmt$(o.total_price)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Customer detail panel ────────────────────────────────────────────────────

type DetailTab = 'overview' | 'orders' | 'email'

function CustomerDetail({ customer, onClose }: { customer: ShopifyCustomer; onClose: () => void }) {
  const [tab, setTab]         = useState<DetailTab>('overview')
  const [journey, setJourney] = useState<Journey | null>(null)
  const [loadingJ, setLoadingJ] = useState(false)

  const name     = displayName(customer)
  const joinDate = customer.created_at ? format(parseISO(customer.created_at), 'MMM d, yyyy') : '—'
  const avgOrder = customer.orders_count > 0 ? customer.total_spent / customer.orders_count : 0

  useEffect(() => {
    if (!customer.email) return
    setLoadingJ(true)
    setJourney(null)
    fetch(`/api/customers/journey?email=${encodeURIComponent(customer.email)}`)
      .then(r => r.json())
      .then((d: Journey) => setJourney(d))
      .catch(() => {})
      .finally(() => setLoadingJ(false))
  }, [customer.email])

  const m = journey?.metrics

  return (
    <div style={{ background: '#fff', border: BORDER, borderRadius: 12, padding: '24px', position: 'sticky', top: 0, maxHeight: 'calc(100vh - 120px)', overflowY: 'auto' }}>
      {/* Close */}
      <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', cursor: 'pointer', color: INK_LIGHT, padding: 4 }}>
        <X style={{ width: 16, height: 16 }} />
      </button>

      {/* Avatar + name */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
          <span style={{ fontFamily: FONT, fontSize: 18, fontWeight: 700, color: '#fff' }}>{initials(customer)}</span>
        </div>
        <p style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600, color: INK, margin: 0, textAlign: 'center' }}>{name}</p>
        {customer.email && name !== customer.email && (
          <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT, margin: '3px 0 0', textAlign: 'center' }}>{customer.email}</p>
        )}
        {customer.phone && <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT, margin: '2px 0 0', textAlign: 'center' }}>{customer.phone}</p>}
        {/* Klaviyo badge */}
        {m?.in_klaviyo && (
          <span style={{ marginTop: 8, fontFamily: FONT, fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: '#EEF7F0', color: '#3A7A3A', border: '1px solid #B8DFC0' }}>
            ✓ Email Subscriber
          </span>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 18, background: OATMILK, borderRadius: 8, padding: 4 }}>
        {(['overview', 'orders', 'email'] as DetailTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, fontFamily: FONT, fontSize: 11, fontWeight: 600,
              padding: '6px 0', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: tab === t ? '#fff' : 'transparent',
              color: tab === t ? INK : INK_LIGHT,
              boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              textTransform: 'capitalize',
            }}
          >{t}</button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {tab === 'overview' && (
        <>
          {/* KPI grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            {[
              { icon: ShoppingBag, label: 'Orders',          value: String(customer.orders_count) },
              { icon: DollarSign,  label: 'Total Spent',     value: fmt$(customer.total_spent) },
              { icon: DollarSign,  label: 'Avg Order',       value: fmt$(avgOrder) },
              { icon: Users,       label: 'Customer Since',  value: joinDate },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} style={{ background: OATMILK, borderRadius: 8, padding: '11px 13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                  <Icon style={{ width: 11, height: 11, color: INK_LIGHT }} />
                  <p style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK_LIGHT, margin: 0 }}>{label}</p>
                </div>
                <p style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: INK, margin: 0 }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Journey insights (from API) */}
          {loadingJ && <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT, textAlign: 'center', padding: '12px 0' }}>Loading journey data…</p>}
          {m && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {m.subscribed_date && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#EEF7F0', borderRadius: 7, border: '1px solid #B8DFC0' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Mail style={{ width: 12, height: 12, color: GREEN }} />
                    <span style={{ fontFamily: FONT, fontSize: 11, color: GREEN, fontWeight: 600 }}>Subscribed</span>
                  </div>
                  <span style={{ fontFamily: FONT, fontSize: 11, color: '#3A7A3A' }}>
                    {format(parseISO(m.subscribed_date), 'MMM d, yyyy')}
                  </span>
                </div>
              )}
              {m.days_to_first_purchase !== null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: OATMILK, borderRadius: 7, border: BORDER }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <TrendingUp style={{ width: 12, height: 12, color: INK_LIGHT }} />
                    <span style={{ fontFamily: FONT, fontSize: 11, color: INK_LIGHT, fontWeight: 600 }}>Days to first purchase</span>
                  </div>
                  <span style={{ fontFamily: FONT, fontSize: 12, color: INK, fontWeight: 700 }}>
                    {m.days_to_first_purchase < 0 ? 'Bought before subscribing' : `${m.days_to_first_purchase} days`}
                  </span>
                </div>
              )}
              {m.favorite_product && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: OATMILK, borderRadius: 7, border: BORDER }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Package style={{ width: 12, height: 12, color: INK_LIGHT }} />
                    <span style={{ fontFamily: FONT, fontSize: 11, color: INK_LIGHT, fontWeight: 600 }}>Favorite blend</span>
                  </div>
                  <span style={{ fontFamily: FONT, fontSize: 11, color: INK, maxWidth: 150, textAlign: 'right' }}>{m.favorite_product}</span>
                </div>
              )}
              {journey?.lists && journey.lists.length > 0 && (
                <div style={{ padding: '8px 12px', background: OATMILK, borderRadius: 7, border: BORDER }}>
                  <p style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK_LIGHT, margin: '0 0 5px' }}>Klaviyo Lists</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {journey.lists.map(l => (
                      <span key={l.list_id} style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#EEF7F0', color: '#3A7A3A', border: '1px solid #B8DFC0' }}>{l.list_name}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tags + note */}
          {customer.tags && (
            <div style={{ marginBottom: 12 }}>
              <p style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK_LIGHT, marginBottom: 6 }}>Tags</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {customer.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                  <span key={t} style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: OATMILK, color: INK_LIGHT, border: BORDER }}>{t}</span>
                ))}
              </div>
            </div>
          )}
          {customer.note && (
            <div>
              <p style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK_LIGHT, marginBottom: 6 }}>Note</p>
              <p style={{ fontFamily: FONT, fontSize: 13, color: INK, lineHeight: 1.55, background: OATMILK, borderRadius: 8, padding: '10px 12px', margin: 0 }}>{customer.note}</p>
            </div>
          )}
        </>
      )}

      {/* ── Orders tab ── */}
      {tab === 'orders' && (
        loadingJ
          ? <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT, textAlign: 'center', padding: '20px 0' }}>Loading orders…</p>
          : <OrderHistory orders={journey?.orders ?? []} />
      )}

      {/* ── Email tab ── */}
      {tab === 'email' && <KlaviyoTimeline email={customer.email} />}
    </div>
  )
}

// ─── Prospect row ─────────────────────────────────────────────────────────────

function ProspectRow({ prospect }: { prospect: Prospect }) {
  const name = displayName(prospect)
  const subDate = prospect.subscribed_at ? formatDistanceToNow(parseISO(prospect.subscribed_at), { addSuffix: true }) : '—'
  const lists = prospect.lists ? prospect.lists.split(',').filter(Boolean) : []

  return (
    <div style={{ background: '#fff', border: BORDER, borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: '#D8D2C6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: INK }}>{initials(prospect)}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: INK, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
        {prospect.email && name !== prospect.email && <p style={{ fontFamily: FONT, fontSize: 11, color: INK_LIGHT, margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prospect.email}</p>}
      </div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {lists.map(l => (
          <span key={l} style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#EEF7F0', color: '#3A7A3A', border: '1px solid #B8DFC0' }}>{l}</span>
        ))}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p style={{ fontFamily: FONT, fontSize: 10, color: INK_LIGHT, margin: 0 }}>subscribed</p>
        <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: INK, margin: 0 }}>{subDate}</p>
      </div>
    </div>
  )
}

// ─── Customer row ─────────────────────────────────────────────────────────────

function CustomerRow({ customer, onClick, active }: { customer: ShopifyCustomer; onClick: () => void; active: boolean }) {
  const name = displayName(customer)
  const tags = customer.tags ? customer.tags.split(',').map(t => t.trim()).filter(Boolean) : []

  return (
    <div
      onClick={onClick}
      style={{
        background: active ? '#FBF7F3' : '#fff',
        border: active ? `1px solid ${ACCENT}` : BORDER,
        borderRadius: 10, padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: 14,
        cursor: 'pointer', transition: 'all 0.1s',
      }}
    >
      <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: active ? ACCENT : INK, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: '#fff' }}>{initials(customer)}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 600, color: INK, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</p>
        {customer.email && name !== customer.email && (
          <p style={{ fontFamily: FONT, fontSize: 11.5, color: INK_LIGHT, margin: '1px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customer.email}</p>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 180, flexShrink: 0 }}>
        {customer.phone && (
          <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#EEF7F0', color: '#3A7A3A', border: '1px solid #B8DFC0' }}>SMS</span>
        )}
        {tags.slice(0, 2).map(t => (
          <span key={t} style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: OATMILK, color: INK_LIGHT, border: BORDER }}>{t}</span>
        ))}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 56 }}>
        <p style={{ fontFamily: FONT, fontSize: 10, color: INK_LIGHT, margin: 0 }}>orders</p>
        <p style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: INK, margin: 0 }}>{customer.orders_count}</p>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 64 }}>
        <p style={{ fontFamily: FONT, fontSize: 10, color: INK_LIGHT, margin: 0 }}>spent</p>
        <p style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: GREEN, margin: 0 }}>{fmt$(customer.total_spent)}</p>
      </div>
      <ChevronRight style={{ width: 14, height: 14, color: MUSHROOM, flexShrink: 0 }} />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type SortKey = 'total_spent' | 'orders_count' | 'created_at'
type PageView = 'customers' | 'prospects'

export default function ContactsPage() {
  const [view, setView]         = useState<PageView>('customers')
  const [customers, setCustomers] = useState<ShopifyCustomer[]>([])
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [query, setQuery]       = useState('')
  const [loading, setLoading]   = useState(true)
  const [syncing, setSyncing]   = useState(false)
  const [selected, setSelected] = useState<ShopifyCustomer | null>(null)
  const [sortBy, setSortBy]     = useState<SortKey>('total_spent')
  const [shopifyConnected, setShopifyConnected] = useState<boolean | null>(null)

  const load = useCallback(async () => {
    const [shopRes, custRes, prospRes] = await Promise.allSettled([
      fetch('/api/shopify/connect').then(r => r.json()),
      fetch('/api/shopify/customers').then(r => r.json()),
      fetch('/api/customers/prospects').then(r => r.json()),
    ])
    if (shopRes.status === 'fulfilled') setShopifyConnected((shopRes.value as { connected: boolean }).connected)
    const loaded: ShopifyCustomer[] = custRes.status === 'fulfilled' && Array.isArray(custRes.value) ? custRes.value : []
    setCustomers(loaded)
    if (prospRes.status === 'fulfilled') {
      const pd = prospRes.value as { prospects?: Prospect[] }
      setProspects(pd.prospects ?? [])
    }
    setLoading(false)
    return loaded
  }, [])

  useEffect(() => {
    load().then(loaded => {
      const param = new URLSearchParams(window.location.search).get('customer')
      if (param) {
        const found = loaded.find(c => c.shopify_id === param)
        if (found) setSelected(found)
      }
    })
  }, [load])

  async function sync() {
    setSyncing(true)
    await Promise.allSettled([
      fetch('/api/shopify/sync', { method: 'POST' }),
      fetch('/api/klaviyo/sync', { method: 'POST' }),
    ])
    await load()
    setSyncing(false)
  }

  const filtered = customers
    .filter(c => {
      if (!query) return true
      const q = query.toLowerCase()
      return (
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.first_name ?? '').toLowerCase().includes(q) ||
        (c.last_name ?? '').toLowerCase().includes(q) ||
        (c.tags ?? '').toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      if (sortBy === 'created_at') return (b.created_at ?? '').localeCompare(a.created_at ?? '')
      return (b[sortBy] as number) - (a[sortBy] as number)
    })

  const filteredProspects = prospects.filter(p => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      (p.email ?? '').toLowerCase().includes(q) ||
      (p.first_name ?? '').toLowerCase().includes(q) ||
      (p.last_name ?? '').toLowerCase().includes(q)
    )
  })

  const totalRevenue   = customers.reduce((s, c) => s + c.total_spent, 0)
  const totalOrders    = customers.reduce((s, c) => s + c.orders_count, 0)
  const repeatBuyers   = customers.filter(c => c.orders_count > 1).length

  return (
    <div style={{ padding: 'clamp(20px,4vw,40px)', fontFamily: FONT }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: INK_LIGHT, marginBottom: 4 }}>Shopify + Klaviyo</p>
          <h1 style={{ fontFamily: SERIF, fontSize: 44, fontWeight: 700, color: INK, margin: 0, lineHeight: 1 }}>Contacts</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* View toggle */}
          <div style={{ display: 'flex', background: OATMILK, borderRadius: 8, padding: 3, border: BORDER }}>
            {(['customers', 'prospects'] as PageView[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  fontFamily: FONT, fontSize: 12, fontWeight: 600,
                  padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: view === v ? '#fff' : 'transparent',
                  color: view === v ? INK : INK_LIGHT,
                  boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {v === 'customers' ? `Customers (${customers.length})` : `Prospects (${prospects.length})`}
              </button>
            ))}
          </div>
          {shopifyConnected && (
            <button
              onClick={sync}
              disabled={syncing}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 8, border: 'none', background: INK, color: '#fff', fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: syncing ? 0.5 : 1 }}
            >
              <RefreshCw style={{ width: 14, height: 14, ...(syncing ? { animation: 'spin 1s linear infinite' } : {}) }} />
              {syncing ? 'Syncing…' : 'Sync'}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p style={{ color: INK_LIGHT, fontSize: 14 }}>Loading…</p>
      ) : !shopifyConnected ? (
        <div style={{ background: '#fff', border: BORDER, borderRadius: 12, padding: '48px', textAlign: 'center' }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: INK, marginBottom: 6 }}>Shopify not connected</p>
          <p style={{ fontSize: 13, color: INK_LIGHT }}>Connect your Shopify store in <a href="/settings" style={{ color: ACCENT }}>Settings → Integrations</a> to sync contact data here.</p>
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
            {[
              { icon: Users,       label: 'Customers',     value: String(customers.length) },
              { icon: ShoppingBag, label: 'Total Orders',  value: String(totalOrders) },
              { icon: DollarSign,  label: 'Total Revenue', value: fmt$(totalRevenue) },
              { icon: TrendingUp,  label: 'Repeat Buyers', value: `${repeatBuyers} (${customers.length > 0 ? Math.round(repeatBuyers / customers.length * 100) : 0}%)` },
              { icon: Mail,        label: 'Prospects',     value: String(prospects.length), note: 'in Klaviyo, no order' },
            ].map(k => (
              <div key={k.label} style={{ background: '#fff', border: BORDER, borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 4 }}>
                  <k.icon style={{ width: 11, height: 11, color: INK_LIGHT }} />
                  <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: INK_LIGHT, margin: 0 }}>{k.label}</p>
                </div>
                <p style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 600, color: INK, margin: 0 }}>{k.value}</p>
                {'note' in k && k.note && <p style={{ fontFamily: FONT, fontSize: 9, color: INK_LIGHT, margin: '2px 0 0' }}>{k.note}</p>}
              </div>
            ))}
          </div>

          {/* Search + Sort */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: INK_LIGHT }} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={view === 'customers' ? 'Search by name, email, or tag…' : 'Search prospects…'}
                style={{ width: '100%', paddingLeft: 36, paddingRight: 14, paddingTop: 10, paddingBottom: 10, fontFamily: FONT, fontSize: 13.5, color: INK, background: '#fff', border: BORDER, borderRadius: 8, outline: 'none', boxSizing: 'border-box' as const }}
              />
            </div>
            {view === 'customers' && (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {(['total_spent', 'orders_count', 'created_at'] as SortKey[]).map(k => (
                  <button
                    key={k}
                    onClick={() => setSortBy(k)}
                    style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, padding: '8px 12px', borderRadius: 7, border: BORDER, cursor: 'pointer', background: sortBy === k ? INK : '#fff', color: sortBy === k ? '#fff' : INK_LIGHT }}
                  >
                    {k === 'total_spent' ? 'Top Spenders' : k === 'orders_count' ? 'Most Orders' : 'Newest'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {view === 'customers' && (
            <>
              <p style={{ fontSize: 12, color: INK_LIGHT, marginBottom: 12 }}>{filtered.length} customer{filtered.length !== 1 ? 's' : ''}</p>
              <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 360px' : '1fr', gap: 16, alignItems: 'start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {customers.length === 0 ? (
                    <div style={{ background: '#fff', border: BORDER, borderRadius: 12, padding: '48px', textAlign: 'center' }}>
                      <p style={{ fontSize: 14, color: INK_LIGHT, marginBottom: 12 }}>No customers synced yet.</p>
                      <button onClick={sync} disabled={syncing} style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, padding: '9px 18px', borderRadius: 8, border: 'none', background: INK, color: '#fff', cursor: 'pointer' }}>
                        {syncing ? 'Syncing…' : 'Sync now'}
                      </button>
                    </div>
                  ) : filtered.length === 0 ? (
                    <div style={{ background: '#fff', border: BORDER, borderRadius: 12, padding: '32px', textAlign: 'center' }}>
                      <p style={{ fontSize: 13, color: INK_LIGHT }}>No customers match your search.</p>
                    </div>
                  ) : (
                    filtered.map(c => (
                      <CustomerRow
                        key={c.shopify_id}
                        customer={c}
                        active={selected?.shopify_id === c.shopify_id}
                        onClick={() => setSelected(prev => prev?.shopify_id === c.shopify_id ? null : c)}
                      />
                    ))
                  )}
                </div>
                {selected && <CustomerDetail customer={selected} onClose={() => setSelected(null)} />}
              </div>
            </>
          )}

          {view === 'prospects' && (
            <>
              <p style={{ fontSize: 12, color: INK_LIGHT, marginBottom: 12 }}>
                {filteredProspects.length} prospect{filteredProspects.length !== 1 ? 's' : ''} — subscribed to email but haven't ordered yet
              </p>
              {filteredProspects.length === 0 ? (
                <div style={{ background: '#fff', border: BORDER, borderRadius: 12, padding: '32px', textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: INK_LIGHT }}>
                    {prospects.length === 0
                      ? 'No prospects found — all subscribers have placed an order. 🎉'
                      : 'No prospects match your search.'}
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {filteredProspects.map(p => <ProspectRow key={p.klaviyo_id} prospect={p} />)}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
