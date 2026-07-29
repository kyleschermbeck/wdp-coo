import type { Metadata } from 'next'
import { Cormorant_Garamond, Jost } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/layout/Sidebar'
import { ChatWidget } from '@/components/chat/ChatWidget'

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
})

const jost = Jost({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-body',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'WDP — Command Center',
  description: 'Weeknight Dinner Party Agentic COO',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${cormorant.variable} ${jost.variable}`} suppressHydrationWarning>
      <head>
        {/* Apply saved appearance settings before first paint to avoid flash */}
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var zoomMap = { sm: '0.88', md: '1', lg: '1.12' };
            var sz = localStorage.getItem('wdp_font_size');
            if (sz && zoomMap[sz]) document.documentElement.style.zoom = zoomMap[sz];
          } catch(e) {}
        `}} />
      </head>
      <body className="h-full flex bg-cream" style={{ fontFamily: 'var(--font-body), system-ui, sans-serif' }}>
        <Sidebar />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
        <ChatWidget />
      </body>
    </html>
  )
}
