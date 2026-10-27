'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  MessageCircle, Package, CheckSquare, LayoutDashboard, MoreHorizontal,
  Mail, TrendingUp, Users, FileText, BookOpen, Megaphone, Briefcase,
  ChefHat, Settings, Globe, X,
} from 'lucide-react'
import { useEffect, useState } from 'react'

const FONT = "'Jost', system-ui, sans-serif"

const PRIMARY_TABS = [
  { label: 'Chat',      href: '/chat',      icon: MessageCircle },
  { label: 'Tasks',     href: '/tasks',     icon: CheckSquare },
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Inventory', href: '/inventory', icon: Package, badgeKey: 'inventory' as const },
  { label: 'More',      href: null,         icon: MoreHorizontal },
]

const ALL_SECTIONS = [
  { label: 'Chat',        href: '/chat',        icon: MessageCircle,  desc: 'AI assistant' },
  { label: 'Dashboard',   href: '/dashboard',   icon: LayoutDashboard, desc: 'Overview & KPIs' },
  { label: 'Tasks',       href: '/tasks',       icon: CheckSquare,    desc: 'To-dos & projects' },
  { label: 'Inventory',   href: '/inventory',   icon: Package,        desc: 'Stock & products', badgeKey: 'inventory' as const },
  { label: 'Email',       href: '/email',       icon: Mail,           desc: 'Inbox', badgeKey: 'email' as const },
  { label: 'Recipes',     href: '/recipes',     icon: ChefHat,        desc: 'Recipe lab' },
  { label: 'Marketing',   href: '/marketing',   icon: Megaphone,      desc: 'Campaigns & social' },
  { label: 'Financials',  href: '/financials',  icon: TrendingUp,     desc: 'Revenue & P&L' },
  { label: 'Contacts',    href: '/contacts',    icon: Users,          desc: 'Customers & retailers' },
  { label: 'Projects',    href: '/projects',    icon: Briefcase,      desc: 'Initiatives' },
  { label: 'Competitive', href: '/competitive', icon: Globe,          desc: 'Market intel' },
  { label: 'Knowledge',   href: '/knowledge',   icon: BookOpen,       desc: 'Docs & playbooks' },
  { label: 'Docs',        href: '/docs',        icon: FileText,       desc: 'Files & documents' },
  { label: 'Settings',    href: '/settings',    icon: Settings,       desc: 'Preferences' },
]

type BadgeKey = 'inventory' | 'email'

export function BottomNav() {
  const pathname = usePathname()
  const [badges, setBadges] = useState<Record<BadgeKey, number>>({ inventory: 0, email: 0 })
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    fetch('/api/inventory')
      .then(r => r.json())
      .then((rows: { status: string; is_bundle: number; shopify_qty: number; reorder_threshold: number }[]) => {
        const critical = rows.filter(r => r.status === 'active' && !r.is_bundle && r.shopify_qty <= Math.floor(r.reorder_threshold * 0.5))
        setBadges(prev => ({ ...prev, inventory: critical.length }))
      })
      .catch(() => {})

    fetch('/api/email/unread-count')
      .then(r => r.json())
      .then((d: { count: number }) => setBadges(prev => ({ ...prev, email: d.count ?? 0 })))
      .catch(() => {})
  }, [])

  // Close drawer on navigation
  useEffect(() => { setDrawerOpen(false) }, [pathname])

  const isMoreActive = drawerOpen || ALL_SECTIONS.some(s =>
    s.href && pathname !== '/chat' && pathname !== '/dashboard' && pathname !== '/tasks' && pathname !== '/inventory' && pathname.startsWith(s.href)
  )

  return (
    <>
      {/* Drawer backdrop */}
      {drawerOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 98,
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(2px)',
          }}
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* All-sections drawer */}
      <div
        style={{
          position: 'fixed',
          bottom: drawerOpen ? 0 : '-100vh',
          left: 0, right: 0,
          zIndex: 99,
          background: 'var(--wdp-ground, #FAF9F6)',
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -4px 32px rgba(0,0,0,0.18)',
          transition: 'bottom 0.28s cubic-bezier(0.32,0.72,0,1)',
          paddingBottom: 'calc(72px + env(safe-area-inset-bottom))',
          maxHeight: '88vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Drawer header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 12px', borderBottom: '1px solid var(--wdp-border, rgba(0,0,0,0.08))' }}>
          <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid, #747474)' }}>
            All Sections
          </span>
          <button
            onClick={() => setDrawerOpen(false)}
            style={{ background: 'none', border: 'none', padding: 6, cursor: 'pointer', color: 'var(--wdp-ink-mid, #747474)', display: 'flex' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Section grid */}
        <div style={{ overflowY: 'auto', padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {ALL_SECTIONS.map(section => {
            const Icon = section.icon
            const isActive = section.href === pathname || (section.href !== '/chat' && pathname.startsWith(section.href))
            const count = section.badgeKey ? badges[section.badgeKey] : 0
            return (
              <Link
                key={section.href}
                href={section.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: isActive ? 'var(--wdp-neon-dim, rgba(215,255,16,0.13))' : 'var(--wdp-surface, #FFFFFF)',
                  border: `1px solid ${isActive ? 'var(--wdp-neon, #D7FF10)' : 'var(--wdp-border, rgba(0,0,0,0.08))'}`,
                  textDecoration: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  position: 'relative',
                }}
              >
                <Icon size={20} strokeWidth={isActive ? 2.2 : 1.6} style={{ color: isActive ? 'var(--wdp-ink, #1A1A1A)' : 'var(--wdp-ink-mid, #747474)', flexShrink: 0 }} />
                <div>
                  <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: isActive ? 600 : 500, color: 'var(--wdp-ink, #2C2C2C)', lineHeight: 1.2 }}>
                    {section.label}
                    {count > 0 && (
                      <span style={{ marginLeft: 5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 16, height: 16, borderRadius: 8, background: '#C14B3A', color: '#fff', fontSize: 9, fontWeight: 700, padding: '0 3px' }}>
                        {count}
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 11, color: 'var(--wdp-ink-mid, #747474)', marginTop: 1 }}>{section.desc}</div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {/* Tab bar */}
      <nav
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 'calc(56px + env(safe-area-inset-bottom))',
          paddingBottom: 'env(safe-area-inset-bottom)',
          background: 'var(--wdp-ground, #FAF9F6)',
          borderTop: '1px solid var(--wdp-border, rgba(0,0,0,0.08))',
          display: 'flex',
          alignItems: 'stretch',
          zIndex: 100,
        }}
        className="md:hidden"
      >
        {PRIMARY_TABS.map(tab => {
          const isActive = tab.href
            ? (tab.href === pathname || (tab.href !== '/chat' && pathname.startsWith(tab.href)))
            : isMoreActive
          const Icon = tab.icon
          const count = 'badgeKey' in tab && tab.badgeKey ? badges[tab.badgeKey as BadgeKey] : 0

          const content = (
            <>
              {isActive && (
                <span style={{
                  position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                  width: 28, height: 2, borderRadius: '0 0 2px 2px',
                  background: 'var(--wdp-neon, #D7FF10)',
                }} />
              )}
              <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={20} strokeWidth={isActive ? 2.2 : 1.6} style={{ color: isActive ? 'var(--wdp-ink, #1A1A1A)' : 'rgba(44,44,44,0.38)' }} />
                {count > 0 && (
                  <span style={{
                    position: 'absolute', top: -4, right: -7,
                    minWidth: 15, height: 15, borderRadius: 8,
                    background: '#C14B3A', color: '#fff',
                    fontSize: 8.5, fontWeight: 700, fontFamily: FONT,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 2px', lineHeight: 1,
                  }}>
                    {count}
                  </span>
                )}
              </span>
              <span style={{
                fontFamily: FONT, fontSize: 9.5,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--wdp-ink, #1A1A1A)' : 'rgba(44,44,44,0.38)',
                letterSpacing: '0.01em',
              }}>
                {tab.label}
              </span>
            </>
          )

          const sharedStyle: React.CSSProperties = {
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 3, textDecoration: 'none', position: 'relative',
            WebkitTapHighlightColor: 'transparent',
            background: 'none', border: 'none', cursor: 'pointer',
          }

          if (tab.href === null) {
            return (
              <button key="more" style={sharedStyle} onClick={() => setDrawerOpen(o => !o)}>
                {content}
              </button>
            )
          }

          return (
            <Link key={tab.href} href={tab.href} style={sharedStyle}>
              {content}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
