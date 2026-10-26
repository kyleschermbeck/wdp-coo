'use client'

import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { ChatWidget } from '@/components/chat/ChatWidget'

export function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isChat = pathname === '/chat'

  if (isChat) {
    // Full-viewport chat — no sidebar, no floating widget
    return (
      <main className="flex-1 h-full overflow-hidden">
        {children}
      </main>
    )
  }

  return (
    <>
      <Sidebar />
      <main className="flex-1 overflow-auto" style={{ background: 'var(--wdp-ground, #FAF9F6)' }}>
        {children}
      </main>
      <ChatWidget />
    </>
  )
}
