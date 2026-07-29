'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  LayoutGrid,
  Package,
  Calendar,
  Mail,
  DollarSign,
  Users,
  Settings,
  ChevronRight,
  BarChart2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const nav = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    color: 'terracotta',
    activeColor: 'bg-terracotta-light text-ink-dark',
    dotColor: 'bg-terracotta',
  },
  {
    label: 'Work Tracking',
    href: '/projects',
    icon: LayoutGrid,
    color: 'sage',
    activeColor: 'bg-sage-light text-ink-dark',
    dotColor: 'bg-sage',
  },
  {
    label: 'Financials',
    href: '/financials',
    icon: DollarSign,
    color: 'thyme',
    activeColor: 'bg-thyme-light text-ink-dark',
    dotColor: 'bg-thyme',
  },
  {
    label: 'Inventory',
    href: '/inventory',
    icon: Package,
    color: 'terracotta',
    activeColor: 'bg-terracotta-light text-ink-dark',
    dotColor: 'bg-terracotta',
  },
  {
    label: 'Marketing',
    href: '/marketing',
    icon: Calendar,
    color: 'butter',
    activeColor: 'bg-butter-light text-ink-dark',
    dotColor: 'bg-butter',
  },
  {
    label: 'Competitive',
    href: '/competitive',
    icon: BarChart2,
    color: 'blueberry',
    activeColor: 'bg-blueberry-light text-ink-dark',
    dotColor: 'bg-blueberry',
  },
  {
    label: 'Email',
    href: '/email',
    icon: Mail,
    color: 'blueberry',
    activeColor: 'bg-blueberry-light text-ink-dark',
    dotColor: 'bg-blueberry',
  },
  {
    label: 'Contacts',
    href: '/contacts',
    icon: Users,
    color: 'candy',
    activeColor: 'bg-candy-light text-ink-dark',
    dotColor: 'bg-candy',
  },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-60 h-full flex flex-col bg-oatmilk border-r border-mushroom shrink-0">
      {/* Logo */}
      <div className="px-5 pt-6 pb-5 border-b border-mushroom">
        <p className="text-[10px] uppercase tracking-[0.2em] text-ink font-body font-semibold mb-3">
          Command Center
        </p>
        <Image
          src="/WDPLogo.png"
          alt="Weeknight"
          width={500}
          height={166}
          className="w-1/2 h-auto"
          priority
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map((item) => {
          const isActive = pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150',
                isActive
                  ? item.activeColor
                  : 'text-ink hover:bg-cream hover:text-ink-dark'
              )}
            >
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0 transition-all',
                  isActive ? item.dotColor : 'bg-mushroom group-hover:' + item.dotColor
                )}
              />
              <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
              <span
                className="text-sm flex-1"
                style={{ fontFamily: "'Jost', system-ui, sans-serif", fontWeight: isActive ? 600 : 500 }}
              >
                {item.label}
              </span>
              {isActive && <ChevronRight className="w-3 h-3 opacity-40" />}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-4 border-t border-mushroom pt-3">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-ink hover:bg-cream hover:text-ink-dark transition-all group"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-mushroom shrink-0" />
          <Settings className="w-4 h-4 shrink-0" strokeWidth={1.75} />
          <span className="text-sm font-body font-medium">Settings</span>
        </Link>
      </div>
    </aside>
  )
}
