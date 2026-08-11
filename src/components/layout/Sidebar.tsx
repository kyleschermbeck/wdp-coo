'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  LayoutGrid,
  Package,
  Calendar,
  Mail,
  DollarSign,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  BarChart2,
  FlaskConical,
  BookOpen,
  Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { GlobalSearch } from './GlobalSearch'

// ─── Nav definition ──────────────────────────────────────────────────────────

const nav = [
  { label: 'Dashboard',     href: '/dashboard',   icon: LayoutDashboard, dotColor: 'bg-terracotta',  activeColor: 'bg-terracotta-light', accentHex: '#C27A54', badgeKey: null          as 'inventory' | 'tasks' | null },
  { label: 'Work Tracking', href: '/projects',    icon: LayoutGrid,      dotColor: 'bg-sage',         activeColor: 'bg-sage-light',       accentHex: '#9BAE9A', badgeKey: 'tasks'       as 'inventory' | 'tasks' | null },
  { label: 'Recipe Lab',    href: '/recipes',     icon: FlaskConical,    dotColor: 'bg-terracotta',   activeColor: 'bg-terracotta-light', accentHex: '#C27A54', badgeKey: null          as 'inventory' | 'tasks' | null },
  { label: 'Knowledge Base',href: '/knowledge',   icon: BookOpen,        dotColor: 'bg-blueberry',    activeColor: 'bg-blueberry-light',  accentHex: '#78B7C5', badgeKey: null          as 'inventory' | 'tasks' | null },
  { label: 'Financials',    href: '/financials',  icon: DollarSign,      dotColor: 'bg-thyme',        activeColor: 'bg-thyme-light',      accentHex: '#A0C66D', badgeKey: null          as 'inventory' | 'tasks' | null },
  { label: 'Inventory',     href: '/inventory',   icon: Package,         dotColor: 'bg-terracotta',   activeColor: 'bg-terracotta-light', accentHex: '#C27A54', badgeKey: 'inventory'   as 'inventory' | 'tasks' | null },
  { label: 'Marketing',     href: '/marketing',   icon: Calendar,        dotColor: 'bg-butter',       activeColor: 'bg-butter-light',     accentHex: '#F0D77A', badgeKey: null          as 'inventory' | 'tasks' | null },
  { label: 'Competitive',   href: '/competitive', icon: BarChart2,       dotColor: 'bg-blueberry',    activeColor: 'bg-blueberry-light',  accentHex: '#78B7C5', badgeKey: null          as 'inventory' | 'tasks' | null },
  { label: 'Email',         href: '/email',       icon: Mail,            dotColor: 'bg-blueberry',    activeColor: 'bg-blueberry-light',  accentHex: '#78B7C5', badgeKey: null          as 'inventory' | 'tasks' | null },
  { label: 'Contacts',      href: '/contacts',    icon: Users,           dotColor: 'bg-candy',        activeColor: 'bg-candy-light',      accentHex: '#F8AFA8', badgeKey: null          as 'inventory' | 'tasks' | null },
]

interface BadgeCounts {
  inventory: number
  tasks: number
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [badges, setBadges] = useState<BadgeCounts>({ inventory: 0, tasks: 0 })
  const [searchOpen, setSearchOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Restore persisted collapse state (after mount to avoid hydration mismatch)
  useEffect(() => {
    setMounted(true)
    try {
      const saved = localStorage.getItem('wdp_sidebar_collapsed')
      if (saved === 'true') setCollapsed(true)
    } catch { /* localStorage unavailable */ }
  }, [])

  function toggle() {
    setCollapsed(v => {
      const next = !v
      try { localStorage.setItem('wdp_sidebar_collapsed', String(next)) } catch { /* */ }
      return next
    })
  }

  // Fetch live badge counts on mount
  useEffect(() => {
    fetch('/api/inventory')
      .then(r => r.json())
      .then((rows: { status: string; is_bundle: number; shopify_qty: number; reorder_threshold: number }[]) => {
        const active = rows.filter(r => r.status === 'active' && !r.is_bundle)
        const critical = active.filter(r => r.shopify_qty <= Math.floor(r.reorder_threshold * 0.5))
        setBadges(prev => ({ ...prev, inventory: critical.length }))
      })
      .catch(() => {})

    fetch('/api/tasks')
      .then(r => r.json())
      .then((tasks: { status: string; due_date: string | null }[]) => {
        const today = new Date(); today.setHours(0, 0, 0, 0)
        const overdue = tasks.filter(t =>
          t.status !== 'done' && t.due_date && new Date(t.due_date) < today
        )
        setBadges(prev => ({ ...prev, tasks: overdue.length }))
      })
      .catch(() => {})
  }, [])

  // Before mount, render expanded to avoid hydration mismatch
  const isCollapsed = mounted && collapsed

  return (
    <aside
      style={{
        width: isCollapsed ? 60 : 240,
        transition: mounted ? 'width 0.22s cubic-bezier(0.4,0,0.2,1)' : 'none',
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#FBF0E3',
        borderRight: '1px solid #D8D2C6',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* ── Logo / Branding ─────────────────────────────────── */}
      <div
        style={{
          padding: isCollapsed ? '18px 0' : '20px 20px 16px',
          borderBottom: '1px solid #D8D2C6',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'flex-start',
          gap: 10,
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        {isCollapsed ? (
          /* Monogram pill */
          <div
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: '#2C2C2C', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 13, fontWeight: 700,
              color: '#FAF9F6', letterSpacing: '0.02em', flexShrink: 0,
            }}
          >
            W
          </div>
        ) : (
          <div style={{ overflow: 'hidden', minWidth: 0 }}>
            <p style={{
              fontFamily: "'Jost', system-ui, sans-serif",
              fontSize: 10, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase',
              color: 'rgba(116,116,116,0.7)', margin: '0 0 10px',
              whiteSpace: 'nowrap',
            }}>
              Command Center
            </p>
            <Image
              src="/WDPLogo.png"
              alt="Weeknight"
              width={500}
              height={166}
              style={{ width: '55%', height: 'auto' }}
              priority
            />
          </div>
        )}
      </div>

      {/* ── Search ──────────────────────────────────────────── */}
      <div
        style={{
          padding: isCollapsed ? '8px 0' : '8px 10px',
          borderBottom: '1px solid #D8D2C6',
          flexShrink: 0,
          display: 'flex',
          justifyContent: isCollapsed ? 'center' : 'stretch',
        }}
      >
        {isCollapsed ? (
          <button
            onClick={() => setSearchOpen(true)}
            title="Search"
            style={{
              width: 36, height: 36, borderRadius: 8, border: 'none',
              background: 'rgba(44,44,44,0.06)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(44,44,44,0.5)', transition: 'background 0.12s ease',
            }}
          >
            <Search size={15} strokeWidth={1.75} />
          </button>
        ) : (
          <GlobalSearch />
        )}
      </div>

      {/* ── Navigation ──────────────────────────────────────── */}
      <nav
        style={{
          flex: 1,
          padding: isCollapsed ? '10px 6px' : '10px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {nav.map((item) => {
          const isActive = pathname.startsWith(item.href)
          const Icon = item.icon
          const count = item.badgeKey ? badges[item.badgeKey] : 0
          const showBadge = count > 0
          const badgeColor = item.badgeKey === 'inventory' ? '#C94040' : '#B87816'

          return (
            <Link
              key={item.href}
              href={item.href}
              title={isCollapsed ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: isCollapsed ? 0 : 10,
                padding: isCollapsed ? '9px 0' : '8px 10px',
                borderRadius: 9,
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                textDecoration: 'none',
                position: 'relative',
                background: isActive
                  ? (isCollapsed ? 'rgba(44,44,44,0.07)' : undefined)
                  : 'transparent',
                transition: 'background 0.12s ease',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
              className={cn(
                !isCollapsed && isActive && item.activeColor,
                !isCollapsed && !isActive && 'hover:bg-cream',
                isCollapsed && !isActive && 'hover:bg-cream/60',
              )}
            >
              {/* Active accent bar (collapsed) */}
              {isCollapsed && isActive && (
                <span
                  style={{
                    position: 'absolute', left: 0, top: '20%', bottom: '20%',
                    width: 2.5, borderRadius: 2,
                    background: item.accentHex,
                  }}
                />
              )}

              {/* Icon + badge wrapper */}
              <span style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon
                  size={17}
                  strokeWidth={isActive ? 2 : 1.65}
                  style={{ color: isActive ? '#2C2C2C' : 'rgba(44,44,44,0.55)', flexShrink: 0 }}
                />
                {/* Collapsed badge — superscript dot/count */}
                {isCollapsed && showBadge && (
                  <span
                    style={{
                      position: 'absolute', top: -5, right: -7,
                      minWidth: 15, height: 15, borderRadius: 8,
                      background: badgeColor, color: '#fff',
                      fontSize: 9, fontWeight: 700,
                      fontFamily: "'Jost', system-ui, sans-serif",
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0 3px', lineHeight: 1,
                    }}
                  >
                    {count}
                  </span>
                )}
              </span>

              {/* Label + expanded badge — hidden when collapsed */}
              {!isCollapsed && (
                <>
                  {/* Dot indicator */}
                  <span
                    style={{
                      width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                      background: isActive ? item.accentHex : 'rgba(216,210,198,0.8)',
                      transition: 'background 0.15s',
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "'Jost', system-ui, sans-serif",
                      fontSize: 13.5,
                      fontWeight: isActive ? 600 : 450,
                      color: isActive ? '#2C2C2C' : 'rgba(44,44,44,0.65)',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      letterSpacing: isActive ? '0.005em' : '0',
                    }}
                  >
                    {item.label}
                  </span>
                  {/* Expanded badge */}
                  {showBadge && (
                    <span
                      style={{
                        minWidth: 18, height: 18, borderRadius: 9,
                        background: badgeColor, color: '#fff',
                        fontSize: 10, fontWeight: 700,
                        fontFamily: "'Jost', system-ui, sans-serif",
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '0 4px', lineHeight: 1, flexShrink: 0,
                      }}
                    >
                      {count}
                    </span>
                  )}
                </>
              )}
            </Link>
          )
        })}
      </nav>

      {/* ── Bottom: Settings + Collapse toggle ─────────────── */}
      <div
        style={{
          borderTop: '1px solid #D8D2C6',
          padding: isCollapsed ? '8px 6px' : '8px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          flexShrink: 0,
        }}
      >
        {/* Settings */}
        <Link
          href="/settings"
          title={isCollapsed ? 'Settings' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: isCollapsed ? 0 : 10,
            padding: isCollapsed ? '9px 0' : '8px 10px',
            borderRadius: 9,
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            textDecoration: 'none',
            transition: 'background 0.12s ease',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
          className={cn(
            pathname.startsWith('/settings')
              ? (isCollapsed ? 'bg-[rgba(44,44,44,0.07)]' : 'bg-terracotta-light text-ink-dark')
              : 'hover:bg-cream/60 text-ink'
          )}
        >
          <Settings
            size={17}
            strokeWidth={1.65}
            style={{ color: 'rgba(44,44,44,0.55)', flexShrink: 0 }}
          />
          {!isCollapsed && (
            <>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(216,210,198,0.8)', flexShrink: 0 }} />
              <span style={{ fontFamily: "'Jost', system-ui, sans-serif", fontSize: 13.5, fontWeight: 450, color: 'rgba(44,44,44,0.65)' }}>
                Settings
              </span>
            </>
          )}
        </Link>

        {/* Collapse / expand toggle */}
        <button
          onClick={toggle}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            gap: 10,
            padding: isCollapsed ? '9px 0' : '8px 10px',
            width: '100%',
            background: 'transparent',
            border: 'none',
            borderRadius: 9,
            cursor: 'pointer',
            color: 'rgba(44,44,44,0.35)',
            transition: 'background 0.12s ease, color 0.12s ease',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(44,44,44,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(44,44,44,0.6)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(44,44,44,0.35)' }}
        >
          {isCollapsed
            ? <ChevronRight size={14} strokeWidth={2} />
            : (
              <>
                <ChevronLeft size={14} strokeWidth={2} />
                <span style={{ fontFamily: "'Jost', system-ui, sans-serif", fontSize: 11, fontWeight: 500, letterSpacing: '0.04em' }}>
                  Collapse
                </span>
              </>
            )
          }
        </button>
      </div>

      {/* Hidden GlobalSearch portal — shown when collapsed + search icon clicked */}
      {isCollapsed && searchOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(44,44,44,0.15)', backdropFilter: 'blur(2px)',
          }}
          onClick={() => setSearchOpen(false)}
        >
          <div
            style={{
              position: 'absolute', top: 60, left: 70, width: 280,
              background: '#FAF9F6', borderRadius: 12, border: '1px solid #D8D2C6',
              boxShadow: '0 8px 32px rgba(44,44,44,0.14)',
              padding: 8,
            }}
            onClick={e => e.stopPropagation()}
          >
            <GlobalSearch />
          </div>
        </div>
      )}
    </aside>
  )
}
