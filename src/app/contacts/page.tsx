'use client'

import { useEffect, useState, useCallback } from 'react'
import { Search, RefreshCw, ChevronRight, X, ShoppingBag, DollarSign, Users, Mail, MousePointer, ShoppingCart, Eye, Send, AlertCircle } from 'lucide-react'
import { format, parseISO } from 'date-fns'

const FONT = "'Jost', system-ui, sans-serif"
const SERIF = "'Cormorant Garamond', Georgia, serif"
const INK = '#2C2C2C'
const INK_LIGHT = 'rgba(44,44,44,0.55)'
const MUSHROOM = '#D8D2C6'
const OATMILK = '#F2EDE5'
const BORDER = `1px solid ${MUSHROOM}`

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

function fmt$(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${n.toFixed(2)}`
}

function initials(c: ShopifyCustomer) {
  const f = c.first_name?.[0] ?? ''
  const l = c.last_name?.[0] ?? ''
  if (f || l) return (f + l).toUpperCase()
  return (c.email?.[0] ?? '?').toUpperCase()
}

function displayName(c: ShopifyCustomer) {
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ')
  return name || c.email || `Customer #${c.shopify_id}`
}

interface KlaviyoEvent {
  id: string
  datetime: string
  metric: string
  properties: Record<string, unknown>
}

const EVENT_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  'Received Email':  { icon: Mail,          color: '#7A9E7E', label: 'Received' },
  'Opened Email':    { icon: Eye,            color: '#6B9AB8', label: 'Opened' },
  'Clicked Email':   { icon: MousePointer,   color: '#C27A54', label: 'Clicked' },
  'Placed Order':    { icon: ShoppingCart,   color: '#A17A1F', label: 'Ordered' },
  'Unsubscribed':    { icon: AlertCircle,    color: '#B05050', label: 'Unsubscribed' },
  'Subscribed to List': { icon: Send,        color: '#7A9E7E', label: 'Subscribed' },
}

function eventMeta(metric: string) {
  return EVENT_META[metric] ?? { icon: Mail, color: INK_LIGHT, label: metric }
}

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

  return (
    <div style={{ marginTop: 20 }}>
      <p style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: INK_LIGHT, marginBottom: 10 }}>
        Klaviyo Activity
      </p>
      {loading ? (
        <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT }}>Loading…</p>
      ) : !events || events.length === 0 ? (
        <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT }}>No activity found in Klaviyo.</p>
      ) : (
        <div style={{ position: 'relative' }}>
          {/* vertical line */}
          <div style={{ position: 'absolute', left: 10, top: 6, bottom: 6, width: 1, background: MUSHROOM }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {events.map((ev, i) => {
              const meta = eventMeta(ev.metric)
              const Icon = meta.icon
              const subject = (ev.properties['Subject'] ?? ev.properties['subject'] ?? ev.properties['$subject']) as string | undefined
              const value = (ev.properties['$value'] ?? ev.properties['value']) as number | undefined
              const listName = (ev.properties['List Name'] ?? ev.properties['list_name']) as string | undefined
              const dt = parseISO(ev.datetime)
              return (
                <div key={ev.id} style={{ display: 'flex', gap: 12, paddingBottom: i < events.length - 1 ? 12 : 0 }}>
                  {/* dot */}
                  <div style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: meta.color + '20', border: `1.5px solid ${meta.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
                    <Icon style={{ width: 10, height: 10, color: meta.color }} />
                  </div>
                  {/* content */}
                  <div style={{ flex: 1, paddingTop: 1 }}>
                    <p style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: INK, margin: 0 }}>{meta.label}</p>
                    {subject && <p style={{ fontFamily: FONT, fontSize: 11, color: INK_LIGHT, margin: '1px 0 0', lineHeight: 1.4 }}>{subject}</p>}
                    {listName && <p style={{ fontFamily: FONT, fontSize: 11, color: INK_LIGHT, margin: '1px 0 0' }}>{listName}</p>}
                    {value != null && <p style={{ fontFamily: FONT, fontSize: 11, color: '#7A9E7E', margin: '1px 0 0', fontWeight: 600 }}>${Number(value).toFixed(2)}</p>}
                    <p style={{ fontFamily: FONT, fontSize: 10, color: INK_LIGHT, margin: '2px 0 0', opacity: 0.7 }}>{format(dt, 'MMM d, yyyy · h:mm a')}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function CustomerTag({ label }: { label: string }) {
  return (
    <span style={{
      fontFamily: FONT, fontSize: 10, fontWeight: 600,
      padding: '2px 8px', borderRadius: 20,
      background: OATMILK, color: INK_LIGHT,
      border: BORDER, display: 'inline-block',
    }}>
      {label}
    </span>
  )
}

function CustomerRow({ customer, onClick, active }: { customer: ShopifyCustomer; onClick: () => void; active: boolean }) {
  const name = displayName(customer)
  const tags = customer.tags ? customer.tags.split(',').map(t => t.trim()).filter(Boolean) : []

  return (
    <div
      onClick={onClick}
      style={{
        background: active ? '#FBF7F3' : '#fff',
        border: active ? '1px solid #C27A54' : BORDER,
        borderRadius: 10, padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: 14,
        cursor: 'pointer', transition: 'all 0.1s',
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
        background: active ? '#C27A54' : INK,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: '#fff' }}>{initials(customer)}</span>
      </div>

      {/* Name + email */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 600, color: INK, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</p>
        {customer.email && name !== customer.email && (
          <p style={{ fontFamily: FONT, fontSize: 11.5, color: INK_LIGHT, margin: '1px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customer.email}</p>
        )}
      </div>

      {/* Tags */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 200, flexShrink: 0 }}>
        {customer.phone && (
          <span style={{
            fontFamily: FONT, fontSize: 10, fontWeight: 700,
            padding: '2px 8px', borderRadius: 20,
            background: '#EEF7F0', color: '#3A7A3A',
            border: '1px solid #B8DFC0', display: 'inline-block',
          }}>SMS</span>
        )}
        {tags.slice(0, 2).map(t => <CustomerTag key={t} label={t} />)}
      </div>

      {/* Orders */}
      <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 60 }}>
        <p style={{ fontFamily: FONT, fontSize: 11, color: INK_LIGHT, margin: 0 }}>orders</p>
        <p style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: INK, margin: 0 }}>{customer.orders_count}</p>
      </div>

      {/* Spent */}
      <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 70 }}>
        <p style={{ fontFamily: FONT, fontSize: 11, color: INK_LIGHT, margin: 0 }}>spent</p>
        <p style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: '#7A9E7E', margin: 0 }}>{fmt$(customer.total_spent)}</p>
      </div>

      <ChevronRight style={{ width: 14, height: 14, color: MUSHROOM, flexShrink: 0 }} />
    </div>
  )
}

function CustomerDetail({ customer, onClose }: { customer: ShopifyCustomer; onClose: () => void }) {
  const tags = customer.tags ? customer.tags.split(',').map(t => t.trim()).filter(Boolean) : []
  const name = displayName(customer)
  const joinDate = customer.created_at ? format(parseISO(customer.created_at), 'MMM d, yyyy') : '—'
  const avgOrder = customer.orders_count > 0 ? customer.total_spent / customer.orders_count : 0

  return (
    <div style={{
      background: '#fff', border: BORDER, borderRadius: 12,
      padding: '24px', position: 'sticky', top: 0,
      maxHeight: 'calc(100vh - 120px)', overflowY: 'auto',
    }}>
      {/* Close */}
      <button
        onClick={onClose}
        style={{ position: 'absolute', top: 16, right: 16, background: 'transparent', border: 'none', cursor: 'pointer', color: INK_LIGHT, padding: 4 }}
      >
        <X style={{ width: 16, height: 16 }} />
      </button>

      {/* Avatar + name */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20 }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: '#C27A54', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
        }}>
          <span style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, color: '#fff' }}>{initials(customer)}</span>
        </div>
        <p style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: INK, margin: 0, textAlign: 'center' }}>{name}</p>
        {customer.email && name !== customer.email && (
          <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT, margin: '4px 0 0', textAlign: 'center' }}>{customer.email}</p>
        )}
        {customer.phone && (
          <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT, margin: '2px 0 0', textAlign: 'center' }}>{customer.phone}</p>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        {[
          { icon: ShoppingBag, label: 'Orders', value: String(customer.orders_count) },
          { icon: DollarSign, label: 'Total Spent', value: fmt$(customer.total_spent) },
          { icon: DollarSign, label: 'Avg Order', value: fmt$(avgOrder) },
          { icon: Users, label: 'Customer Since', value: joinDate },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} style={{ background: OATMILK, borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Icon style={{ width: 12, height: 12, color: INK_LIGHT }} />
              <p style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: INK_LIGHT, margin: 0 }}>{label}</p>
            </div>
            <p style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600, color: INK, margin: 0 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: INK_LIGHT, marginBottom: 8 }}>Tags</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tags.map(t => <CustomerTag key={t} label={t} />)}
          </div>
        </div>
      )}

      {/* Note */}
      {customer.note && (
        <div style={{ marginBottom: 0 }}>
          <p style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: INK_LIGHT, marginBottom: 6 }}>Note</p>
          <p style={{ fontFamily: FONT, fontSize: 13, color: INK, lineHeight: 1.55, background: OATMILK, borderRadius: 8, padding: '10px 12px', margin: 0 }}>{customer.note}</p>
        </div>
      )}

      {/* Klaviyo timeline */}
      {customer.email && (
        <>
          <div style={{ height: 1, background: MUSHROOM, margin: '20px 0' }} />
          <KlaviyoTimeline email={customer.email} />
        </>
      )}
    </div>
  )
}

type SortKey = 'total_spent' | 'orders_count' | 'created_at'

export default function ContactsPage() {
  const [customers, setCustomers] = useState<ShopifyCustomer[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [selected, setSelected] = useState<ShopifyCustomer | null>(null)
  const [sortBy, setSortBy] = useState<SortKey>('total_spent')
  const [shopifyConnected, setShopifyConnected] = useState<boolean | null>(null)

  const load = useCallback(async () => {
    const [shopRes, custRes] = await Promise.allSettled([
      fetch('/api/shopify/connect').then(r => r.json()),
      fetch('/api/shopify/customers').then(r => r.json()),
    ])
    if (shopRes.status === 'fulfilled') setShopifyConnected((shopRes.value as { connected: boolean }).connected)
    const loaded: ShopifyCustomer[] = custRes.status === 'fulfilled' && Array.isArray(custRes.value) ? custRes.value : []
    setCustomers(loaded)
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
    await fetch('/api/shopify/sync', { method: 'POST' }).catch(() => {})
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

  const totalRevenue = customers.reduce((s, c) => s + c.total_spent, 0)
  const totalOrders  = customers.reduce((s, c) => s + c.orders_count, 0)
  const repeatBuyers = customers.filter(c => c.orders_count > 1).length

  return (
    <div style={{ padding: 'clamp(20px,4vw,40px)', fontFamily: FONT }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: INK_LIGHT, marginBottom: 4 }}>Shopify</p>
          <h1 style={{ fontFamily: SERIF, fontSize: 44, fontWeight: 700, color: INK, margin: 0, lineHeight: 1 }}>Contacts</h1>
        </div>
        {shopifyConnected && (
          <button
            onClick={sync}
            disabled={syncing}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 16px', borderRadius: 8, border: 'none',
              background: INK, color: '#fff', fontFamily: FONT,
              fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: syncing ? 0.5 : 1,
            }}
          >
            <RefreshCw style={{ width: 14, height: 14, ...(syncing ? { animation: 'spin 1s linear infinite' } : {}) }} />
            {syncing ? 'Syncing…' : 'Sync Customers'}
          </button>
        )}
      </div>

      {loading ? (
        <p style={{ color: INK_LIGHT, fontSize: 14 }}>Loading…</p>
      ) : !shopifyConnected ? (
        <div style={{ background: '#fff', border: BORDER, borderRadius: 12, padding: '48px', textAlign: 'center' }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: INK, marginBottom: 6 }}>Shopify not connected</p>
          <p style={{ fontSize: 13, color: INK_LIGHT }}>Connect your Shopify store in <a href="/settings" style={{ color: '#C27A54' }}>Settings → Integrations</a> to sync customer data here.</p>
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Total Customers', value: String(customers.length) },
              { label: 'Total Orders', value: String(totalOrders) },
              { label: 'Total Revenue', value: fmt$(totalRevenue) },
              { label: 'Repeat Buyers', value: `${repeatBuyers} (${customers.length > 0 ? Math.round(repeatBuyers / customers.length * 100) : 0}%)` },
            ].map(k => (
              <div key={k.label} style={{ background: '#fff', border: BORDER, borderRadius: 10, padding: '16px 18px' }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: INK_LIGHT, margin: '0 0 5px' }}>{k.label}</p>
                <p style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600, color: INK, margin: 0 }}>{k.value}</p>
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
                placeholder="Search by name, email, or tag…"
                style={{
                  width: '100%', paddingLeft: 36, paddingRight: 14, paddingTop: 10, paddingBottom: 10,
                  fontFamily: FONT, fontSize: 13.5, color: INK, background: '#fff',
                  border: BORDER, borderRadius: 8, outline: 'none', boxSizing: 'border-box' as const,
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {(['total_spent', 'orders_count', 'created_at'] as SortKey[]).map(k => (
                <button
                  key={k}
                  onClick={() => setSortBy(k)}
                  style={{
                    fontFamily: FONT, fontSize: 12, fontWeight: 600, padding: '8px 12px', borderRadius: 7,
                    border: BORDER, cursor: 'pointer',
                    background: sortBy === k ? INK : '#fff',
                    color: sortBy === k ? '#fff' : INK_LIGHT,
                  }}
                >
                  {k === 'total_spent' ? 'Top Spenders' : k === 'orders_count' ? 'Most Orders' : 'Newest'}
                </button>
              ))}
            </div>
          </div>

          <p style={{ fontSize: 12, color: INK_LIGHT, marginBottom: 12 }}>{filtered.length} customer{filtered.length !== 1 ? 's' : ''}</p>

          {/* List + detail panel */}
          <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 340px' : '1fr', gap: 16, alignItems: 'start' }}>
            {/* Customer list */}
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

            {/* Detail panel */}
            {selected && (
              <CustomerDetail customer={selected} onClose={() => setSelected(null)} />
            )}
          </div>
        </>
      )}
    </div>
  )
}
