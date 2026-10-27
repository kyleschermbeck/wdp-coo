import type { Metadata } from 'next'
import { Cormorant_Garamond, Jost } from 'next/font/google'
import './globals.css'
import { ConditionalShell } from '@/components/layout/ConditionalShell'

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
  viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full ${cormorant.variable} ${jost.variable}`} suppressHydrationWarning>
      <head>
        {/* Apply saved appearance settings before first paint — avoids theme flash */}
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var el = document.documentElement;
            var zoomMap = { sm:'0.88', md:'1', lg:'1.12' };
            var sz = localStorage.getItem('wdp_font_size');
            if (sz && zoomMap[sz]) el.style.zoom = zoomMap[sz];
            var theme = localStorage.getItem('wdp_theme');
            if (theme) el.setAttribute('data-theme', theme);
            var accent = localStorage.getItem('wdp_accent');
            if (accent) el.setAttribute('data-accent', accent);
          } catch(e) {}
        `}} />
      </head>
      <body className="h-full flex" style={{ fontFamily: 'var(--font-body), system-ui, sans-serif', background: 'var(--wdp-ground, #FAF9F6)', color: 'var(--wdp-ink, #2C2C2C)' }}>
        <ConditionalShell>{children}</ConditionalShell>
      </body>
    </html>
  )
}
