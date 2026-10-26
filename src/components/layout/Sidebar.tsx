'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  Package,
  Mail,
  Settings,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  Search,
  MessageCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { GlobalSearch } from './GlobalSearch'

// ─── Nav definition ───────────────────────────────────────────────────────────
const nav = [
  { label: 'Chat',        href: '/chat',      icon: MessageCircle, badgeKey: null as 'inventory' | 'tasks' | 'email' | null },
  { label: 'Recipe Lab',  href: '/recipes',   icon: FlaskConical,  badgeKey: null },
  { label: 'Inventory',   href: '/inventory', icon: Package,       badgeKey: 'inventory' as 'inventory' | 'tasks' | 'email' | null },
  { label: 'Email',       href: '/email',     icon: Mail,          badgeKey: 'email' as 'inventory' | 'tasks' | 'email' | null },
]

interface BadgeCounts { inventory: number; tasks: number; email: number }

const FONT = "'Jost', system-ui, sans-serif"
const SERIF = "'Cormorant Garamond', Georgia, serif"

// ─── Sidebar ──────────────────────────────────────────────────────────────────
export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(true)
  const [badges, setBadges] = useState<BadgeCounts>({ inventory: 0, tasks: 0, email: 0 })
  const [searchOpen, setSearchOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      const saved = localStorage.getItem('wdp_sidebar_collapsed')
      if (saved === 'false') setCollapsed(false)
    } catch { /* */ }
  }, [])

  function toggle() {
    setCollapsed(v => {
      const next = !v
      try { localStorage.setItem('wdp_sidebar_collapsed', String(next)) } catch { /* */ }
      return next
    })
  }

  // Live badge counts
  useEffect(() => {
    fetch('/api/inventory')
      .then(r => r.json())
      .then((rows: { status: string; is_bundle: number; shopify_qty: number; reorder_threshold: number }[]) => {
        const critical = rows.filter(r => r.status === 'active' && !r.is_bundle && r.shopify_qty <= Math.floor(r.reorder_threshold * 0.5))
        setBadges(prev => ({ ...prev, inventory: critical.length }))
      })
      .catch(() => {})

    fetch('/api/tasks')
      .then(r => r.json())
      .then((tasks: { status: string; due_date: string | null }[]) => {
        const today = new Date(); today.setHours(0, 0, 0, 0)
        const overdue = tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < today)
        setBadges(prev => ({ ...prev, tasks: overdue.length }))
      })
      .catch(() => {})

    fetch('/api/email/unread-count')
      .then(r => r.json())
      .then((d: { count: number }) => setBadges(prev => ({ ...prev, email: d.count ?? 0 })))
      .catch(() => {})
  }, [])

  const isCollapsed = mounted && collapsed

  // ── Shared layout values ─────────────────────────────────────────────────
  const W = isCollapsed ? 48 : 220

  return (
    <aside
      style={{
        width: W,
        transition: mounted ? 'width 0.2s cubic-bezier(0.4,0,0.2,1)' : 'none',
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--wdp-ground, #FFFFFF)',
        borderRight: '1px solid var(--wdp-border, rgba(0,0,0,0.08))',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* ── Logo ──────────────────────────────────────────────────────────── */}
      <div style={{
        height: 52,
        display: 'flex',
        alignItems: 'center',
        justifyContent: isCollapsed ? 'center' : 'flex-start',
        padding: isCollapsed ? 0 : '0 14px',
        borderBottom: '1px solid var(--wdp-border, rgba(0,0,0,0.08))',
        flexShrink: 0,
        gap: 10,
      }}>
        <Link href="/chat" title="Command Center" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Neon W — same as chat page */}
          <div style={{
            width: 28, height: 28,
            background: 'var(--wdp-neon, #D7FF10)',
            borderRadius: 7,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: SERIF,
            fontSize: 13, fontWeight: 700, color: '#000',
            letterSpacing: '-0.5px',
            flexShrink: 0,
          }}>W</div>

          {!isCollapsed && (
            <div>
              <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: 'var(--wdp-ink)', letterSpacing: '-0.2px', lineHeight: 1.1 }}>
                WDP
              </div>
              <div style={{ fontFamily: FONT, fontSize: 9.5, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)', lineHeight: 1 }}>
                Command Center
              </div>
            </div>
          )}
        </Link>
      </div>

      {/* ── Search ────────────────────────────────────────────────────────── */}
      <div style={{
        padding: isCollapsed ? '6px 6px' : '6px 8px',
        borderBottom: '1px solid var(--wdp-border, rgba(0,0,0,0.08))',
        flexShrink: 0,
        display: 'flex',
        justifyContent: isCollapsed ? 'center' : 'stretch',
      }}>
        {isCollapsed ? (
          <button
            onClick={() => setSearchOpen(true)}
            title="Search"
            style={{
              width: 36, height: 32, borderRadius: 8, border: 'none',
              background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--wdp-ink-mid)',
            }}
          >
            <Search size={15} strokeWidth={1.75} />
          </button>
        ) : (
          <GlobalSearch />
        )}
      </div>

      {/* ── Nav items ─────────────────────────────────────────────────────── */}
      <nav style={{
        flex: 1,
        padding: isCollapsed ? '8px 6px' : '8px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>
        {nav.map(item => {
          const isActive = pathname === item.href || (item.href !== '/chat' && pathname.startsWith(item.href))
          const Icon = item.icon
          const count = item.badgeKey ? badges[item.badgeKey] : 0
          const showBadge = count > 0

          return (
            <Link
              key={item.href}
              href={item.href}
              title={isCollapsed ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: isCollapsed ? 0 : 9,
                padding: isCollapsed ? '8px 0' : '7px 10px',
                borderRadius: 8,
                justifyContent: isCollapsed ? 'center' : 'flex-start',
                textDecoration: 'none',
                position: 'relative',
                background: isActive && isCollapsed ? 'var(--wdp-neon, #D7FF10)' : 'transparent',
                transition: 'background 0.12s ease',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
              className={cn(
                isActive && !isCollapsed && 'bg-[var(--wdp-neon,#D7FF10)]',
                !isActive && 'hover:bg-black/[0.04]',
              )}
            >
              {/* Icon + badge */}
              <span style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon
                  size={16}
                  strokeWidth={isActive ? 2.2 : 1.7}
                  style={{
                    color: isActive
                      ? '#000'
                      : 'var(--wdp-rail-icon, rgba(44,44,44,0.42))',
                    flexShrink: 0,
                  }}
                />
                {isCollapsed && showBadge && (
                  <span style={{
                    position: 'absolute', top: -4, right: -6,
                    minWidth: 14, height: 14, borderRadius: 7,
                    background: '#C14B3A', color: '#fff',
                    fontSize: 8.5, fontWeight: 700, fontFamily: FONT,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 2px', lineHeight: 1,
                  }}>
                    {count}
                  </span>
                )}
              </span>

              {/* Label (expanded only) */}
              {!isCollapsed && (
                <>
                  <span style={{
                    fontFamily: FONT,
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 450,
                    color: isActive ? '#000' : 'var(--wdp-ink-mid, rgba(44,44,44,0.6))',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {item.label}
                  </span>
                  {showBadge && (
                    <span style={{
                      minWidth: 17, height: 17, borderRadius: 8,
                      background: '#C14B3A', color: '#fff',
                      fontSize: 9.5, fontWeight: 700, fontFamily: FONT,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0 3px', lineHeight: 1, flexShrink: 0,
                    }}>
                      {count}
                    </span>
                  )}
                </>
              )}
            </Link>
          )
        })}
      </nav>

      {/* ── Bottom: Settings + collapse ───────────────────────────────────── */}
      <div style={{
        borderTop: '1px solid var(--wdp-border, rgba(0,0,0,0.08))',
        padding: isCollapsed ? '6px 6px' : '6px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        flexShrink: 0,
      }}>
        <Link
          href="/settings"
          title={isCollapsed ? 'Settings' : undefined}
          style={{
            display: 'flex', alignItems: 'center', gap: isCollapsed ? 0 : 9,
            padding: isCollapsed ? '8px 0' : '7px 10px',
            borderRadius: 8,
            justifyContent: isCollapsed ? 'center' : 'flex-start',
            textDecoration: 'none',
            background: pathname.startsWith('/settings') && isCollapsed ? 'var(--wdp-neon)' : 'transparent',
          }}
          className={cn(
            pathname.startsWith('/settings') && !isCollapsed && 'bg-[var(--wdp-neon,#D7FF10)]',
            !pathname.startsWith('/settings') && 'hover:bg-black/[0.04]',
          )}
        >
          <Settings
            size={16} strokeWidth={1.7}
            style={{ color: pathname.startsWith('/settings') ? '#000' : 'var(--wdp-rail-icon, rgba(44,44,44,0.42))', flexShrink: 0 }}
          />
          {!isCollapsed && (
            <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 450, color: pathname.startsWith('/settings') ? '#000' : 'var(--wdp-ink-mid)' }}>
              Settings
            </span>
          )}
        </Link>

        <button
          onClick={toggle}
          title={isCollapsed ? 'Expand' : 'Collapse'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: isCollapsed ? 'center' : 'flex-start',
            gap: 8, padding: isCollapsed ? '8px 0' : '7px 10px',
            width: '100%', background: 'transparent', border: 'none', borderRadius: 8,
            cursor: 'pointer', color: 'var(--wdp-ink-mid)',
          }}
          className="hover:bg-black/[0.04]"
        >
          {isCollapsed
            ? <ChevronRight size={14} strokeWidth={2} />
            : <>
                <ChevronLeft size={14} strokeWidth={2} />
                <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 500 }}>Collapse</span>
              </>
          }
        </button>
      </div>

      {/* Collapsed search modal */}
      {isCollapsed && searchOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.08)' }}
          onClick={() => setSearchOpen(false)}
        >
          <div
            style={{
              position: 'absolute', top: 56, left: 58, width: 280,
              background: 'var(--wdp-ground)', borderRadius: 12,
              border: '1px solid var(--wdp-border)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.1)', padding: 8,
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
