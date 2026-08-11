'use client'

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Package, ExternalLink } from 'lucide-react'
import { marked } from 'marked'
import { TaskDetailDrawer } from '@/components/projects/TaskDetailDrawer'
import { SubtaskDetailDrawer } from '@/components/projects/SubtaskDetailDrawer'
import type { Task as LibTask, Subtask as LibSubtask } from '@/lib/types'
import { StatusRail } from '@/components/ui/StatusRail'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Task {
  id: number
  title: string
  status: string
  priority: string
  due_date: string | null
  project_name: string
  project_color: string
}

interface DueSubtask {
  id: number
  title: string
  completed: number
  due_date: string | null
  task_id: number
  task_title: string
  project_id: number | null
  project_name: string | null
  project_color: string | null
}

interface Agent {
  id: number
  name: string
  description: string | null
  active: number
}

interface InventoryRow {
  id: number
  title: string
  shopify_qty: number
  reorder_threshold: number
  accent_color: string
}

interface MarketingEvent {
  id: number
  title: string
  date: string
  platform: string
  published: boolean
}

interface ShopifyOrder {
  id: number
  created_at: string
  total_price: string
  financial_status: string
  line_items: string  // JSON array with product_id and quantity
}

interface BundleComponent {
  bundle_shopify_id: string
  component_shopify_id: string
  quantity: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function greeting(): string {
  const now = new Date()
  const h = now.getHours()
  const day = now.getDay()
  const MORNING = [
    'Good morning, Kyle.',
    'Rise and spice, Kyle.',
    'Time to get blending, Kyle.',
    'Morning, Kyle — the flavors await.',
  ]
  const AFTERNOON = [
    'Good afternoon, Kyle.',
    'Midday check-in, Kyle.',
    'The kitchen\'s heating up, Kyle.',
    'Afternoon, Kyle — still simmering.',
  ]
  const EVENING = [
    'Good evening, Kyle.',
    'Let\'s see what\'s cooking, Kyle.',
    'Dinner hour, Kyle.',
    'Spice up your evening, Kyle.',
  ]
  const bank = h < 12 ? MORNING : h < 17 ? AFTERNOON : EVENING
  return bank[day % bank.length]
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function fmt$(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${n.toFixed(0)}`
}

function fmtNum(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(Math.round(n))
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }
const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  high: { bg: '#FDE8E8', text: '#C14B3A' },
  medium: { bg: '#FBF0E3', text: '#C27A54' },
  low: { bg: '#F0F4EF', text: '#6B8F6A' },
}

function weekLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Build 5 weekly revenue buckets from orders
function buildWeeklyRevenue(
  orders: ShopifyOrder[],
  bundleJarsMap: Map<string, number>,
): { label: string; revenue: number; units: number }[] {
  const now = new Date()
  const weeks: { label: string; revenue: number; units: number }[] = []
  for (let i = 4; i >= 0; i--) {
    const end = new Date(now)
    end.setDate(end.getDate() - i * 7)
    const start = new Date(end)
    start.setDate(start.getDate() - 7)
    const label = i === 0 ? weekLabel(start) + '*' : weekLabel(start)
    const weekOrders = orders.filter((o) => {
      const d = new Date(o.created_at)
      return d >= start && d < end && o.financial_status !== 'voided' && o.financial_status !== 'refunded'
    })
    const revenue = weekOrders.reduce((s, o) => s + parseFloat(o.total_price), 0)
    let units = 0
    for (const o of weekOrders) {
      try {
        const items = JSON.parse(o.line_items) as Array<{ product_id?: number | string; quantity: number }>
        for (const item of items) {
          const pid = item.product_id != null ? String(item.product_id) : null
          const jars = pid ? (bundleJarsMap.get(pid) ?? 1) : 1
          units += jars * item.quantity
        }
      } catch { /* skip malformed */ }
    }
    weeks.push({ label, revenue, units })
  }
  return weeks
}

// ─── Revenue Chart ────────────────────────────────────────────────────────────

function RevenueChart({ weeks }: { weeks: { label: string; revenue: number; units: number }[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const W = 700
  const H = 100
  const PAD = { l: 10, r: 10, t: 14, b: 6 }

  const maxRev = Math.max(...weeks.map((w) => w.revenue), 1)
  const pts = weeks.map((w, i) => {
    const x = PAD.l + (i / (weeks.length - 1)) * (W - PAD.l - PAD.r)
    const y = PAD.t + (1 - w.revenue / maxRev) * (H - PAD.t - PAD.b)
    return { x, y, ...w }
  })

  const linePoints = pts.map((p) => `${p.x},${p.y}`).join(' ')
  const areaPoints = [
    `${pts[0].x},${H - PAD.b}`,
    ...pts.map((p) => `${p.x},${p.y}`),
    `${pts[pts.length - 1].x},${H - PAD.b}`,
  ].join(' ')

  return (
    <div style={{ position: 'relative' }}>
      <svg
        ref={svgRef}
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', overflow: 'visible' }}
      >
        <polygon points={areaPoints} fill="rgba(155,174,154,0.16)" stroke="none" />
        <polyline
          points={linePoints}
          fill="none"
          stroke="#9BAE9A"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {pts.map((p, i) => (
          <g key={i} onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)} style={{ cursor: 'pointer' }}>
            <circle cx={p.x} cy={p.y} r={14} fill="transparent" />
            {hoveredIdx === i && <circle cx={p.x} cy={p.y} r={8} fill="rgba(155,174,154,0.35)" />}
            <circle cx={p.x} cy={p.y} r={3.5} fill="#9BAE9A" stroke="#fff" strokeWidth={1.5} />
          </g>
        ))}
      </svg>

      {hoveredIdx !== null && (() => {
        const p = pts[hoveredIdx]
        const pct = (p.x / W) * 100
        return (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: `${pct}%`,
              transform: 'translate(-50%, -108%)',
              background: '#2C2C2C',
              borderRadius: 10,
              padding: '12px 14px',
              minWidth: 160,
              boxShadow: '0 8px 24px rgba(60,48,36,0.2)',
              pointerEvents: 'none',
              zIndex: 5,
            }}
          >
            <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(250,249,246,0.6)', margin: '0 0 4px' }}>{p.label}</p>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#FAF9F6', margin: '0 0 2px' }}>
              {p.revenue === 0 ? '—' : fmt$(p.revenue)}
            </p>
            <p style={{ fontSize: 11.5, color: 'rgba(250,249,246,0.7)', margin: 0 }}>
              {p.revenue === 0 ? 'No orders yet' : `${p.units} units sold`}
            </p>
          </div>
        )
      })()}

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weeks.length},1fr)`, marginTop: 4 }}>
        {weeks.map((w, i) => (
          <p key={i} style={{ fontSize: 10.5, color: '#747474', margin: 0, textAlign: 'center' }}>{w.label}</p>
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()

  const [tasks, setTasks] = useState<Task[]>([])
  const [dueSubtasks, setDueSubtasks] = useState<DueSubtask[]>([])
  const [inventory, setInventory] = useState<InventoryRow[]>([])
  const [events, setEvents] = useState<MarketingEvent[]>([])
  const [orders, setOrders] = useState<ShopifyOrder[]>([])
  const [bundleComponents, setBundleComponents] = useState<BundleComponent[]>([])
  const [projects, setProjects] = useState<{ id: number; status: string }[]>([])
  const [checkedTaskIds, setCheckedTaskIds] = useState<Set<number>>(new Set())
  const [checkedSubtaskIds, setCheckedSubtaskIds] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [igFollowers, setIgFollowers] = useState<number | null>(null)
  const [igEngRate, setIgEngRate] = useState<number | null>(null)
  const [emailSubs, setEmailSubs] = useState<number | null>(null)
  const [brief, setBrief] = useState<string | null>(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const [briefGeneratedAt, setBriefGeneratedAt] = useState<string | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [drawerTask, setDrawerTask] = useState<LibTask | null>(null)
  const [drawerSubtask, setDrawerSubtask] = useState<LibSubtask | null>(null)
  const [igStoryReach, setIgStoryReach] = useState<number | null>(null)
  const [contentIdeas, setContentIdeas] = useState<Array<{ id: string; format: string; title: string; hook: string; caption_concept: string; why: string }>>([])
  const kpiColRef = useRef<HTMLDivElement>(null)
  const briefCardRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const sync = () => {
      const kpi = kpiColRef.current
      const brief = briefCardRef.current
      if (kpi && brief) brief.style.height = kpi.offsetHeight + 'px'
    }
    sync()
    const ro = new ResizeObserver(sync)
    if (kpiColRef.current) ro.observe(kpiColRef.current)
    return () => ro.disconnect()
  })

  useEffect(() => {
    async function load() {
      try {
        const now = new Date()
        const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
        const nextMonthStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`

        const [tasksRes, subtasksRes, invRes, eventsRes, eventsNextRes, ordersRes, bundleCompRes, projRes, igRes, klaviyoRes, agentsRes] = await Promise.allSettled([
          fetch('/api/tasks').then((r) => r.json()),
          fetch('/api/subtasks').then((r) => r.json()),
          fetch('/api/inventory').then((r) => r.json()),
          fetch(`/api/marketing/events?month=${thisMonth}`).then((r) => r.json()),
          fetch(`/api/marketing/events?month=${nextMonthStr}`).then((r) => r.json()),
          fetch('/api/shopify/orders?limit=250').then((r) => r.json()),
          fetch('/api/inventory/bundle-components').then((r) => r.json()),
          fetch('/api/projects').then((r) => r.json()),
          fetch('/api/instagram/analytics').then((r) => r.json()),
          fetch('/api/klaviyo/data').then((r) => r.json()),
          fetch('/api/agents').then((r) => r.json()),
        ])

        if (tasksRes.status === 'fulfilled' && Array.isArray(tasksRes.value)) setTasks(tasksRes.value)
        if (subtasksRes.status === 'fulfilled' && Array.isArray(subtasksRes.value)) {
          const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + 7); cutoff.setHours(23, 59, 59, 999)
          const due = (subtasksRes.value as DueSubtask[]).filter(s => {
            if (s.completed || !s.due_date) return false
            return new Date(s.due_date + 'T00:00:00') <= cutoff
          })
          setDueSubtasks(due)
        }
        if (invRes.status === 'fulfilled' && invRes.value?.rows) setInventory(invRes.value.rows)
        const allEvents: MarketingEvent[] = []
        if (eventsRes.status === 'fulfilled' && Array.isArray(eventsRes.value)) allEvents.push(...eventsRes.value)
        if (eventsNextRes.status === 'fulfilled' && Array.isArray(eventsNextRes.value)) allEvents.push(...eventsNextRes.value)
        setEvents(allEvents)
        if (ordersRes.status === 'fulfilled' && Array.isArray(ordersRes.value)) setOrders(ordersRes.value)
        if (bundleCompRes.status === 'fulfilled' && Array.isArray(bundleCompRes.value)) setBundleComponents(bundleCompRes.value)
        if (projRes.status === 'fulfilled' && Array.isArray(projRes.value)) setProjects(projRes.value)

        // Audience metrics
        if (igRes.status === 'fulfilled') {
          const ig = igRes.value as {
            profile?: { followers_count?: number }
            media?: { like_count?: number; comments_count?: number; insights?: { reach?: number } }[]
            stories?: { insights?: { reach?: number } }[]
          }
          setIgFollowers(ig.profile?.followers_count ?? null)
          const posts = ig.media ?? []
          if (posts.length > 0) {
            const postsWithReach = posts.filter(p => (p.insights?.reach ?? 0) > 1)
            if (postsWithReach.length > 0) {
              const avg = postsWithReach.reduce((s, p) => {
                const r = p.insights!.reach!
                return s + ((p.like_count ?? 0) + (p.comments_count ?? 0)) / r * 100
              }, 0) / postsWithReach.length
              if (avg <= 100) setIgEngRate(Math.round(avg * 10) / 10)
            }
          }
          const storyReach = (ig.stories ?? []).reduce((s, st) => s + (st.insights?.reach ?? 0), 0)
          if (storyReach > 0) setIgStoryReach(storyReach)
        }
        if (klaviyoRes.status === 'fulfilled') {
          const kd = klaviyoRes.value as { lists?: { profile_count?: number }[] }
          const total = (kd.lists ?? []).reduce((s, l) => s + (l.profile_count ?? 0), 0)
          if (total > 0) setEmailSubs(total)
        }
        if (agentsRes.status === 'fulfilled' && Array.isArray(agentsRes.value)) {
          setAgents((agentsRes.value as Agent[]).filter(a => a.active))
        }

        // Content ideas for strategy preview
        try {
          const ideasRes = await fetch('/api/marketing/content-ideas')
          if (ideasRes.ok) {
            const data = await ideasRes.json() as { ideas?: typeof contentIdeas }
            if (Array.isArray(data.ideas) && data.ideas.length > 0) setContentIdeas(data.ideas.slice(0, 2))
          }
        } catch { /* non-fatal */ }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function openTaskInDrawer(id: number) {
    try {
      const res = await fetch(`/api/tasks/${id}`)
      if (res.ok) setDrawerTask(await res.json() as LibTask)
    } catch { /* ignore */ }
  }

  async function openSubtaskInDrawer(id: number) {
    try {
      const res = await fetch(`/api/subtasks/${id}`)
      if (res.ok) setDrawerSubtask(await res.json() as LibSubtask)
    } catch { /* ignore */ }
  }

  // Morning brief — fetch cached; auto-generate if stale
  useEffect(() => {
    async function loadBrief() {
      try {
        const res = await fetch('/api/morning-brief')
        if (!res.ok) return
        const data = await res.json() as { brief: string | null; stale?: boolean; generatedAt?: string }
        if (data.brief && !data.stale) {
          setBrief(data.brief)
          if (data.generatedAt) setBriefGeneratedAt(data.generatedAt)
        } else {
          setBriefLoading(true)
          const gen = await fetch('/api/morning-brief', { method: 'POST' })
          if (gen.ok) {
            const gd = await gen.json() as { brief: string }
            setBrief(gd.brief)
            setBriefGeneratedAt(new Date().toISOString())
          }
          setBriefLoading(false)
        }
      } catch { setBriefLoading(false) }
    }
    loadBrief()
  }, [])

  const toggleTask = useCallback((id: number) => {
    setCheckedTaskIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // ── Derived data ──────────────────────────────────────────────────────────

  const _7dCutoff = new Date(); _7dCutoff.setDate(_7dCutoff.getDate() + 7); _7dCutoff.setHours(23, 59, 59, 999)

  const dailyTasks = tasks
    .filter((t) => {
      if (t.status === 'done') return false
      if (!t.due_date) return false
      return new Date(t.due_date + 'T00:00:00') <= _7dCutoff
    })
    .sort((a, b) => {
      const da = new Date(a.due_date! + 'T00:00:00').getTime()
      const db2 = new Date(b.due_date! + 'T00:00:00').getTime()
      if (da !== db2) return da - db2
      return (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)
    })

  const lowStockItems = inventory
    .filter((r) => r.shopify_qty <= r.reorder_threshold)
    .slice(0, 5)

  const criticalStockItems = inventory.filter((r) => r.shopify_qty < 2)

  const activeProjectCount = projects.filter((p) => p.status !== 'completed' && p.status !== 'archived').length

  const revenue30d = orders.reduce((s, o) => {
    const d = new Date(o.created_at)
    const ago30 = new Date()
    ago30.setDate(ago30.getDate() - 30)
    return d >= ago30 ? s + parseFloat(o.total_price) : s
  }, 0)

  const orders30d = orders.filter((o) => {
    const d = new Date(o.created_at)
    const ago30 = new Date()
    ago30.setDate(ago30.getDate() - 30)
    return d >= ago30
  }).length

  const bundleJarsMap = new Map<string, number>()
  for (const c of bundleComponents) {
    bundleJarsMap.set(c.bundle_shopify_id, (bundleJarsMap.get(c.bundle_shopify_id) ?? 0) + (c.quantity || 1))
  }
  const weeklyRevenue = buildWeeklyRevenue(orders, bundleJarsMap)

  const today = new Date().toISOString().slice(0, 10)
  const upcomingEvents = events
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4)

  const audienceTotal = (igFollowers ?? 0) + (emailSubs ?? 0)
  const audienceValue = audienceTotal > 0 ? fmtNum(audienceTotal) : (igFollowers !== null || emailSubs !== null ? fmtNum(audienceTotal) : '—')
  const audienceSub = igEngRate !== null
    ? `${igEngRate}% IG eng · ${emailSubs !== null ? fmtNum(emailSubs) + ' email' : 'no email data'}`
    : igFollowers !== null ? `${fmtNum(igFollowers ?? 0)} followers` : 'Connect Instagram'

  const kpis = [
    {
      label: 'Audience',
      value: audienceValue,
      sub: audienceSub,
      subColor: audienceTotal > 0 ? '#C27A54' : '#A0A09A',
    },
    {
      label: 'Revenue 30d',
      value: revenue30d === 0 && orders.length === 0 ? '—' : fmt$(revenue30d),
      sub: orders.length === 0 ? 'Sync Shopify to track' : `${orders30d} orders`,
      subColor: orders.length === 0 ? '#A0A09A' : '#9BAE9A',
    },
    {
      label: 'Orders 30d',
      value: orders.length === 0 ? '—' : String(orders30d),
      sub: orders.length === 0 ? 'No data yet' : 'paid orders',
      subColor: orders.length === 0 ? '#A0A09A' : '#9BAE9A',
    },
    {
      label: 'Active Projects',
      value: String(activeProjectCount),
      sub: `of ${projects.length} total`,
      subColor: '#9BAE9A',
    },
    {
      label: 'Low Stock Alerts',
      value: String(lowStockItems.length),
      sub: lowStockItems.length > 0 ? 'need reorder' : 'all stocked',
      subColor: lowStockItems.length > 0 ? '#C14B3A' : '#9BAE9A',
    },
    {
      label: 'Open Tasks',
      value: String(tasks.filter(t => t.status !== 'done').length),
      sub: `of ${tasks.length} total`,
      subColor: '#C27A54',
    },
  ]

  const marketingFocus = [
    { color: '#9BAE9A', text: 'Post consistently — aim for 5 reels this week across both Instagram accounts.' },
    { color: '#F0D77A', text: 'Email list hasn\'t had a campaign in 30+ days — consider a recipe or promo send.' },
    { color: '#C27A54', text: 'Reorder inventory before it hits 0 — 26 products are below threshold.' },
  ]

  const socialStats = [
    {
      label: 'IG Followers',
      value: igFollowers !== null ? fmtNum(igFollowers) : '—',
      sub: igFollowers !== null ? (igEngRate !== null ? `${igEngRate}% eng rate` : 'Instagram') : 'Connect Instagram',
      color: igFollowers !== null ? '#9BAE9A' : '#A0A09A',
    },
    {
      label: 'Story Reach',
      value: igStoryReach !== null ? fmtNum(igStoryReach) : '—',
      sub: 'last 7 days',
      color: igStoryReach !== null ? '#9BAE9A' : '#A0A09A',
    },
    { label: 'Posts This Mo.', value: String(events.filter((e) => e.published).length), sub: 'marked posted', color: '#9BAE9A' },
    { label: 'Upcoming Posts', value: String(upcomingEvents.length), sub: 'on calendar', color: '#C27A54' },
  ]


  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-ink text-sm" style={{ fontFamily: "'Jost', sans-serif" }}>
        Loading dashboard…
      </div>
    )
  }

  return (
    <div
      style={{
        padding: 'clamp(18px,4vw,40px) clamp(16px,4vw,44px) 90px',
        maxWidth: 1160,
        fontFamily: "'Jost', system-ui, sans-serif",
      }}
    >
      {/* ── Header ── */}
      <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#747474', margin: '0 0 6px' }}>
        {formatDate()}
      </p>
      <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700, fontSize: 44, margin: '0 0 6px', color: '#2C2C2C', lineHeight: 1.05 }}>
        {greeting()}
      </h1>
      <p style={{ fontSize: 15, color: '#747474', margin: '0 0 24px', maxWidth: 560 }}>
        Everything running the business tonight — inventory, revenue, the projects moving, and what your agents caught while you weren&apos;t looking.
      </p>

      {/* ── Exception Rails ── */}
      {criticalStockItems.length > 0 && (
        <StatusRail
          severity="critical"
          message={`${criticalStockItems.length} product${criticalStockItems.length > 1 ? 's' : ''} out of stock`}
          items={criticalStockItems.map(r => ({ label: r.title }))}
          onViewAll={() => router.push('/inventory')}
        />
      )}

      {/* ── Morning Brief + KPI Row ── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 28, alignItems: 'flex-start' }}>

        {/* Morning Brief — 3/5 */}
        {(brief || briefLoading) && (
          <div ref={briefCardRef} style={{ flex: 3, minWidth: 0, overflow: 'hidden', background: 'rgba(155,174,154,0.28)', borderRadius: 12, padding: 22, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(44,44,44,0.55)', margin: 0 }}>
                  Rose Mary · Morning Brief
                </p>
                {briefGeneratedAt && !briefLoading && (
                  <p style={{ fontSize: 10, color: 'rgba(44,44,44,0.42)', margin: 0 }}>
                    Generated {new Date((briefGeneratedAt.includes('T') ? briefGeneratedAt : briefGeneratedAt.replace(' ', 'T') + 'Z')).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                  </p>
                )}
              </div>
              {!briefLoading && (
                <button
                  onClick={async () => {
                    setBriefLoading(true)
                    try {
                      const r = await fetch('/api/morning-brief', { method: 'POST' })
                      if (r.ok) { const d = await r.json() as { brief: string }; setBrief(d.brief); setBriefGeneratedAt(new Date().toISOString()) }
                    } finally { setBriefLoading(false) }
                  }}
                  style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(44,44,44,0.45)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Refresh ↺
                </button>
              )}
            </div>
            {briefLoading ? (
              <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 13.5, color: 'rgba(44,44,44,0.55)', margin: 0 }}>Rose Mary is reviewing the business…</p>
            ) : (
              <div
                className="chat-prose"
                style={{ fontSize: 13.5, overflowY: 'auto', flex: 1, minHeight: 0 }}
                dangerouslySetInnerHTML={{ __html: marked.parse(brief ?? '') as string }}
              />
            )}
          </div>
        )}

        {/* KPI Cards — 2/5 when brief showing, full width otherwise */}
        <div ref={kpiColRef} style={{ flex: (brief || briefLoading) ? 2 : 1, minWidth: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignContent: 'start' }}>
          {kpis.map((k) => {
            const isCriticalKpi = k.label === 'Low Stock Alerts' && lowStockItems.length > 0
            return (
              <div
                key={k.label}
                style={{
                  background: '#fff',
                  border: `1px solid ${isCriticalKpi ? '#C94040' : 'rgba(216,210,198,0.6)'}`,
                  borderLeft: isCriticalKpi ? '3px solid #C94040' : '1px solid rgba(216,210,198,0.6)',
                  borderRadius: 12,
                  padding: '16px 16px 14px',
                }}
              >
                <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.7)', margin: '0 0 6px' }}>
                  {k.label}
                </p>
                <p style={{ fontFamily: "'Jost', sans-serif", fontSize: 22, fontWeight: 600, color: isCriticalKpi ? '#C94040' : '#2C2C2C', margin: '0 0 4px' }}>
                  {k.value}
                </p>
                <p style={{ fontSize: 12, color: k.subColor, margin: 0, fontWeight: 600 }}>{k.sub}</p>
              </div>
            )
          })}
        </div>

      </div>

      {/* ── Business Performance ── */}
      <div style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 12, padding: '20px 22px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontFamily: "'Jost', sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#2C2C2C', margin: 0 }}>
            How the Business Is Doing
          </h3>
          <button onClick={() => router.push('/financials')} style={{ border: 'none', background: 'transparent', color: '#747474', fontSize: 12, fontFamily: "'Jost', sans-serif", cursor: 'pointer' }}>
            Full financials →
          </button>
        </div>
        <p style={{ fontSize: 13.5, color: '#2C2C2C', lineHeight: 1.6, margin: '0 0 16px', maxWidth: 760 }}>
          {orders.length === 0
            ? 'Shopify order data isn\'t syncing yet — connect your store to see real revenue, order volume, and per-product trends here.'
            : `${orders30d} orders and ${fmt$(revenue30d)} in revenue over the last 30 days. ${lowStockItems.length} products are below reorder threshold.`}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#747474' }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: '#9BAE9A', display: 'inline-block' }} />
            Revenue
          </span>
          <span style={{ fontSize: 12, color: '#747474' }}>
            {orders.length === 0 ? 'No orders to display' : `${orders.length} total orders this period`}
          </span>
        </div>
        <RevenueChart weeks={weeklyRevenue} />
        <p style={{ fontSize: 10.5, color: 'rgba(116,116,116,0.55)', margin: '8px 0 0' }}>
          Revenue by week · *week-to-date · hover a point for details
        </p>
      </div>

      {/* ── Marketing & Social Insights ── */}
      <div style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 12, padding: '20px 22px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontFamily: "'Jost', sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#2C2C2C', margin: 0 }}>
            Marketing &amp; Social Insights
          </h3>
          <button onClick={() => router.push('/marketing')} style={{ border: 'none', background: 'transparent', color: '#747474', fontSize: 12, fontFamily: "'Jost', sans-serif", cursor: 'pointer' }}>
            Full marketing →
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 14, marginBottom: 14 }}>
          {socialStats.map((ss) => (
            <div key={ss.label}>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.65)', margin: '0 0 5px' }}>
                {ss.label}
              </p>
              <p style={{ fontSize: 19, fontWeight: 600, color: '#2C2C2C', margin: '0 0 3px' }}>{ss.value}</p>
              <p style={{ fontSize: 11, fontWeight: 600, color: ss.color, margin: 0 }}>{ss.sub}</p>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid rgba(216,210,198,0.4)', paddingTop: 12 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 8px' }}>
            Where to focus
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {marketingFocus.map((mf, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, flexShrink: 0, background: mf.color, display: 'inline-block' }} />
                <p style={{ fontSize: 12.5, color: '#2C2C2C', margin: 0, flex: 1 }}>{mf.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Two-column grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 16, alignItems: 'start' }}>

        {/* ── Left column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Daily Tasks */}
          <div style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 12, padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ fontFamily: "'Jost', sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#2C2C2C', margin: 0 }}>
                  Daily Tasks
                </h3>
                <span style={{ fontSize: 11, color: 'rgba(116,116,116,0.6)' }}>Today&apos;s focus</span>
              </div>
              {(() => {
                const allDailyItems = [
                  ...dailyTasks.map(t => ({ kind: 'task' as const, id: t.id, title: t.title, due_date: t.due_date!, priority: t.priority, project_name: t.project_name ?? '', status: t.status })),
                  ...dueSubtasks.map(s => ({ kind: 'subtask' as const, id: s.id, title: s.title, due_date: s.due_date!, task_id: s.task_id, task_title: s.task_title, project_name: s.project_name ?? null, completed: s.completed })),
                ].sort((a, b) => new Date(a.due_date + 'T00:00:00').getTime() - new Date(b.due_date + 'T00:00:00').getTime())
                return (
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#747474' }}>
                    {checkedTaskIds.size + checkedSubtaskIds.size} of {allDailyItems.length} done
                  </span>
                )
              })()}
            </div>
            <p style={{ fontSize: 12, color: 'rgba(116,116,116,0.7)', margin: '0 0 14px' }}>
              Tasks and subtasks due in the next 7 days.
            </p>
            {(() => {
              const allDailyItems = [
                ...dailyTasks.map(t => ({ kind: 'task' as const, id: t.id, title: t.title, due_date: t.due_date!, priority: t.priority, project_name: t.project_name ?? '', status: t.status })),
                ...dueSubtasks.map(s => ({ kind: 'subtask' as const, id: s.id, title: s.title, due_date: s.due_date!, task_id: s.task_id, task_title: s.task_title, project_name: s.project_name ?? null, completed: s.completed })),
              ].sort((a, b) => new Date(a.due_date + 'T00:00:00').getTime() - new Date(b.due_date + 'T00:00:00').getTime())
              return (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {allDailyItems.length === 0 && (
                    <p style={{ fontSize: 13, color: '#747474', padding: '12px 0' }}>All tasks are done. Nice work.</p>
                  )}
                  {allDailyItems.map((item, i) => {
                    if (item.kind === 'task') {
                      const done = checkedTaskIds.has(item.id)
                      const pc = PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS.low
                      return (
                        <div
                          key={`task-${item.id}`}
                          style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 0', borderTop: i === 0 ? 'none' : '1px solid rgba(216,210,198,0.4)', cursor: 'pointer' }}
                          onClick={() => openTaskInDrawer(item.id)}
                        >
                          <button
                            onClick={e => { e.stopPropagation(); toggleTask(item.id) }}
                            style={{
                              width: 18, height: 18, borderRadius: 5, border: done ? 'none' : '1.5px solid #D8D2C6',
                              background: done ? '#9BAE9A' : 'transparent', flexShrink: 0, marginTop: 2,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                            }}
                          >
                            {done && (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 6L9 17l-5-5" />
                              </svg>
                            )}
                          </button>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13.5, fontWeight: 500, color: done ? '#A0A09A' : '#2C2C2C', margin: 0, textDecoration: done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.title}
                            </p>
                            <p style={{ fontSize: 11.5, color: '#747474', margin: '2px 0 0' }}>
                              {item.project_name}
                              {item.due_date && (
                                <span> · due {new Date(item.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                              )}
                            </p>
                          </div>
                          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 999, background: pc.bg, color: pc.text, flexShrink: 0, marginTop: 1 }}>
                            {item.priority}
                          </span>
                        </div>
                      )
                    } else {
                      const done = checkedSubtaskIds.has(item.id)
                      return (
                        <div
                          key={`sub-${item.id}`}
                          style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 0', borderTop: i === 0 ? 'none' : '1px solid rgba(216,210,198,0.4)', cursor: 'pointer' }}
                          onClick={() => openSubtaskInDrawer(item.id)}
                        >
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              setCheckedSubtaskIds(prev => {
                                const next = new Set(prev)
                                if (next.has(item.id)) next.delete(item.id); else next.add(item.id)
                                return next
                              })
                            }}
                            style={{
                              width: 18, height: 18, borderRadius: 5, border: done ? 'none' : '1.5px solid #D8D2C6',
                              background: done ? '#9BAE9A' : 'transparent', flexShrink: 0, marginTop: 2,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                            }}
                          >
                            {done && (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 6L9 17l-5-5" />
                              </svg>
                            )}
                          </button>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13.5, fontWeight: 500, color: done ? '#A0A09A' : '#2C2C2C', margin: 0, textDecoration: done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <span style={{ color: '#C8C2B8', marginRight: 4, fontWeight: 400 }}>↳</span>{item.title}
                            </p>
                            <p style={{ fontSize: 11.5, color: '#747474', margin: '2px 0 0' }}>
                              {item.task_title}{item.project_name ? ` · ${item.project_name}` : ''}
                              {item.due_date && (
                                <span> · due {new Date(item.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                              )}
                            </p>
                          </div>
                        </div>
                      )
                    }
                  })}
                </div>
              )
            })()}
            <button
              onClick={() => router.push('/projects')}
              style={{ marginTop: 12, width: '100%', padding: 9, borderRadius: 8, border: '1px solid #D8D2C6', background: 'transparent', color: '#2C2C2C', fontSize: 12.5, fontWeight: 600, fontFamily: "'Jost', sans-serif", cursor: 'pointer' }}
            >
              View all tasks →
            </button>
          </div>

          {/* Needs Attention */}
          <div style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 12, padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <h3 style={{ fontFamily: "'Jost', sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#2C2C2C', margin: 0 }}>
                Needs Attention
              </h3>
              <span style={{ fontSize: 11, color: 'rgba(116,116,116,0.6)' }}>{lowStockItems.length} items</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {lowStockItems.length === 0 && (
                <p style={{ fontSize: 13, color: '#747474', padding: '12px 0' }}>Nothing flagged right now.</p>
              )}
              {lowStockItems.map((item, i) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: i === 0 ? 'none' : '1px solid rgba(216,210,198,0.4)' }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, flexShrink: 0, background: '#C14B3A', display: 'inline-block' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13.5, fontWeight: 500, color: '#2C2C2C', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.title}
                    </p>
                    <p style={{ fontSize: 11.5, color: '#747474', margin: '2px 0 0' }}>
                      {item.shopify_qty} in stock · threshold {item.reorder_threshold}
                    </p>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 999, background: 'rgba(193,75,58,0.1)', color: '#C14B3A', flexShrink: 0 }}>
                    Low
                  </span>
                  <button
                    onClick={() => router.push('/inventory')}
                    style={{ fontSize: 11.5, fontWeight: 600, fontFamily: "'Jost', sans-serif", color: '#2C2C2C', background: 'transparent', border: '1px solid #D8D2C6', borderRadius: 7, padding: '5px 11px', cursor: 'pointer', flexShrink: 0 }}
                  >
                    Reorder
                  </button>
                </div>
              ))}
            </div>
            {lowStockItems.length < inventory.filter(r => r.shopify_qty <= r.reorder_threshold).length && (
              <button
                onClick={() => router.push('/inventory')}
                style={{ marginTop: 12, width: '100%', padding: 9, borderRadius: 8, border: '1px solid #D8D2C6', background: 'transparent', color: '#2C2C2C', fontSize: 12.5, fontWeight: 600, fontFamily: "'Jost', sans-serif", cursor: 'pointer' }}
              >
                View all low-stock items →
              </button>
            )}
          </div>
        </div>

        {/* ── Right column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Content Strategy Preview */}
          <div style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 12, padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ fontFamily: "'Jost', sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#2C2C2C', margin: 0 }}>
                Content Ideas
              </h3>
              <button
                onClick={() => router.push('/marketing')}
                style={{ border: 'none', background: 'transparent', color: '#747474', fontSize: 12, fontFamily: "'Jost', sans-serif", cursor: 'pointer' }}
              >
                See all →
              </button>
            </div>
            {contentIdeas.length === 0 ? (
              <p style={{ fontSize: 13, color: '#747474', padding: '4px 0 8px' }}>No ideas generated yet — go to Marketing to create some.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {contentIdeas.map((idea) => {
                  const FORMAT_COLORS: Record<string, string> = { Reel: '#78B7C5', Carousel: '#C27A54', Post: '#9BAE9A', Story: '#DFC97B' }
                  const fmtColor = FORMAT_COLORS[idea.format] ?? '#9BAE9A'
                  return (
                    <div
                      key={idea.id}
                      style={{ borderRadius: 10, border: '1px solid rgba(216,210,198,0.6)', overflow: 'hidden', background: '#FAFAF7' }}
                    >
                      <div style={{ padding: '12px 14px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 999, background: `${fmtColor}22`, color: fmtColor }}>
                            {idea.format}
                          </span>
                        </div>
                        <p style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 16, fontWeight: 600, color: '#2C2C2C', margin: '0 0 5px', lineHeight: 1.25 }}>
                          {idea.title}
                        </p>
                        <p style={{ fontSize: 11.5, color: '#747474', margin: 0, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {idea.hook}
                        </p>
                      </div>
                      <div style={{ padding: '7px 14px 8px', backgroundColor: 'rgba(122,158,126,0.1)', borderTop: '0.5px solid rgba(90,130,90,0.25)' }}>
                        <p style={{ fontSize: 11, color: '#4a6e49', margin: 0, lineHeight: 1.35 }}>{idea.why}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Tonight's take */}
          <div style={{ background: '#2C2C2C', borderRadius: 12, padding: 22 }}>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(250,249,246,0.5)', margin: '0 0 8px' }}>
              Tonight&apos;s take
            </p>
            <p style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 600, fontSize: 22, color: '#FAF9F6', margin: 0, lineHeight: 1.3 }}>
              Dinner doesn&apos;t need to be complicated to be good — neither does running the business behind it.
            </p>
          </div>

          {/* Agents & Automations */}
          <div style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 12, padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ fontFamily: "'Jost', sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#2C2C2C', margin: 0 }}>
                  Agents &amp; Automations
                </h3>
                <span style={{ fontSize: 11, color: 'rgba(116,116,116,0.6)' }}>{agents.length} active</span>
              </div>
              <button
                onClick={() => router.push('/settings')}
                style={{ border: 'none', background: 'transparent', color: '#747474', fontSize: 12, fontFamily: "'Jost', sans-serif", cursor: 'pointer' }}
              >
                Manage →
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {agents.map((ag, i) => (
                <div
                  key={ag.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderRadius: 9,
                    background: i === 0 ? 'rgba(194,122,84,0.07)' : '#FAFAF7',
                    border: i === 0 ? '1px solid rgba(194,122,84,0.22)' : '1px solid rgba(216,210,198,0.5)',
                  }}
                >
                  <div style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                    background: i === 0 ? 'rgba(194,122,84,0.18)' : '#F2EDE5',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {i === 0 ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C27A54" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    ) : (
                      <div style={{ width: 6, height: 6, borderRadius: 999, background: '#A0C66D' }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13.5, fontWeight: i === 0 ? 700 : 600, color: '#2C2C2C', margin: 0 }}>{ag.name}</p>
                    {ag.description && (
                      <p style={{ fontSize: 11.5, color: i === 0 ? '#a35a37' : '#747474', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ag.description}
                      </p>
                    )}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '3px 9px', borderRadius: 999, background: '#E8F3E8', color: '#3A7A3A', flexShrink: 0 }}>
                    Active
                  </span>
                </div>
              ))}
              {agents.length === 0 && (
                <p style={{ fontSize: 13, color: '#747474', padding: '8px 0' }}>No agents configured yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <TaskDetailDrawer
        task={drawerTask}
        onClose={() => setDrawerTask(null)}
        onUpdate={(updated) => setDrawerTask(updated)}
        onDelete={async (id) => {
          await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
          setTasks(prev => prev.filter(t => t.id !== id))
          setDrawerTask(null)
        }}
        onOpenSubtask={(s) => { setDrawerTask(null); setDrawerSubtask(s) }}
      />

      <SubtaskDetailDrawer
        subtask={drawerSubtask}
        onClose={() => setDrawerSubtask(null)}
        onUpdate={(updated) => setDrawerSubtask(updated)}
        onDelete={async (id) => {
          await fetch(`/api/subtasks/${id}`, { method: 'DELETE' })
          setDueSubtasks(prev => prev.filter(s => s.id !== id))
          setDrawerSubtask(null)
        }}
        onOpenParentTask={(taskId) => { setDrawerSubtask(null); openTaskInDrawer(taskId) }}
      />
    </div>
  )
}
