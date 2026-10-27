'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MessageCircle, Package, Mail, CheckSquare, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'

const FONT = "'Jost', system-ui, sans-serif"

const tabs = [
  { label: 'Chat',      href: '/chat',      icon: MessageCircle, badgeKey: null as 'inventory' | 'email' | null },
  { label: 'Inventory', href: '/inventory', icon: Package,       badgeKey: 'inventory' as 'inventory' | 'email' | null },
  { label: 'Email',     href: '/email',     icon: Mail,          badgeKey: 'email' as 'inventory' | 'email' | null },
  { label: 'Tasks',     href: '/tasks',     icon: CheckSquare,   badgeKey: null },
  { label: 'Settings',  href: '/settings',  icon: Settings,      badgeKey: null },
]

export function BottomNav() {
  const pathname = usePathname()
  const [badges, setBadges] = useState({ inventory: 0, email: 0 })

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

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 64,
        background: 'var(--wdp-ground, #FFFFFF)',
        borderTop: '1px solid var(--wdp-border, rgba(0,0,0,0.08))',
        display: 'flex',
        alignItems: 'stretch',
        zIndex: 100,
        // Safe area for iPhone home indicator
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      className="md:hidden"
    >
      {tabs.map(tab => {
        const isActive = pathname === tab.href || (tab.href !== '/chat' && pathname.startsWith(tab.href))
        const Icon = tab.icon
        const count = tab.badgeKey ? badges[tab.badgeKey] : 0

        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              textDecoration: 'none',
              position: 'relative',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {/* Active indicator */}
            {isActive && (
              <span style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 32,
                height: 2,
                borderRadius: '0 0 2px 2px',
                background: 'var(--wdp-neon, #D7FF10)',
              }} />
            )}

            {/* Icon + badge */}
            <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon
                size={20}
                strokeWidth={isActive ? 2.2 : 1.6}
                style={{ color: isActive ? 'var(--wdp-ink, #1A1A1A)' : 'rgba(44,44,44,0.38)' }}
              />
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
              fontFamily: FONT,
              fontSize: 10,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? 'var(--wdp-ink, #1A1A1A)' : 'rgba(44,44,44,0.38)',
              letterSpacing: '0.01em',
            }}>
              {tab.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
