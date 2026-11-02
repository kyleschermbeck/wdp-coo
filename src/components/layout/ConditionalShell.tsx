'use client'

import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { ChatWidget } from '@/components/chat/ChatWidget'

export function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isChat = pathname === '/chat'

  if (isChat) {
    return (
      <>
        {/* Use 100dvh so iOS keyboard shrinks the layout and keeps compose bar visible */}
        <main className="flex-1 overflow-hidden" style={{ height: '100dvh' }}>
          {children}
        </main>
        {/* Bottom nav still accessible from chat on mobile */}
        <BottomNav />
      </>
    )
  }

  return (
    <>
      {/* Sidebar: desktop only */}
      <div className="hidden md:flex h-full">
        <Sidebar />
      </div>

      {/* Main content — extra bottom padding on mobile for tab bar */}
      <main
        className="flex-1 overflow-auto pb-[72px] md:pb-0"
        style={{ background: 'var(--wdp-ground, #FAF9F6)' }}
      >
        {children}
      </main>

      {/* Bottom nav: mobile only */}
      <BottomNav />

      {/* Floating chat widget: desktop only */}
      <div className="hidden md:block">
        <ChatWidget />
      </div>
    </>
  )
}
