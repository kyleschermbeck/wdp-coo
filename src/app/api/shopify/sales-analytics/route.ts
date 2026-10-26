import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface LineItem {
  product_id: number | null
  title: string
  quantity: number
}

interface BundleComponent {
  bundle_shopify_id: string
  component_shopify_id: string
  quantity: number
  component_title: string
}

interface DailyRow { date: string; revenue: number; orders: number }

export async function GET() {
  const db = getDb()

  // ── Daily revenue (last 30 days) ───────────────────────────────────────────
  const dailyRows = db.prepare(`
    SELECT DATE(created_at) as date,
           ROUND(SUM(total_price), 2) as revenue,
           COUNT(*) as orders
    FROM shopify_orders
    WHERE financial_status NOT IN ('voided', 'refunded')
      AND created_at >= datetime('now', '-30 days')
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `).all() as DailyRow[]

  // Fill gaps — produce a continuous 30-day array
  const today = new Date()
  const daily: Array<{ date: string; revenue: number; orders: number }> = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const row = dailyRows.find(r => r.date === key)
    daily.push({ date: key, revenue: row?.revenue ?? 0, orders: row?.orders ?? 0 })
  }

  // ── Bundle components map ──────────────────────────────────────────────────
  const components = db.prepare(`
    SELECT pbc.bundle_shopify_id, pbc.component_shopify_id, pbc.quantity,
           COALESCE(sp.title, pbc.component_shopify_id) as component_title
    FROM product_bundle_components pbc
    LEFT JOIN shopify_products sp ON sp.shopify_id = pbc.component_shopify_id
  `).all() as BundleComponent[]

  // Map: bundle_shopify_id → [{component_shopify_id, quantity, component_title}]
  const bundleMap = new Map<string, Array<{ id: string; qty: number; title: string }>>()
  for (const c of components) {
    if (!bundleMap.has(c.bundle_shopify_id)) bundleMap.set(c.bundle_shopify_id, [])
    bundleMap.get(c.bundle_shopify_id)!.push({
      id: c.component_shopify_id,
      qty: c.quantity,
      title: c.component_title,
    })
  }

  // ── Jars by product (decomposing bundles) ──────────────────────────────────
  const orders = db.prepare(`
    SELECT line_items FROM shopify_orders
    WHERE financial_status NOT IN ('voided', 'refunded')
      AND created_at >= datetime('now', '-30 days')
  `).all() as Array<{ line_items: string }>

  // Count jars per individual product (not bundles)
  const jarCounts = new Map<string, { title: string; jars: number }>()

  function addJars(productId: string, title: string, qty: number) {
    const existing = jarCounts.get(productId)
    if (existing) existing.jars += qty
    else jarCounts.set(productId, { title, jars: qty })
  }

  for (const order of orders) {
    let items: LineItem[] = []
    try { items = JSON.parse(order.line_items) as LineItem[] } catch { continue }

    for (const item of items) {
      const pid = item.product_id?.toString() ?? ''
      const comps = bundleMap.get(pid)
      if (comps && comps.length > 0) {
        // Bundle — explode into components
        for (const comp of comps) {
          addJars(comp.id, comp.title, item.quantity * comp.qty)
        }
      } else {
        // Individual product
        if (pid) addJars(pid, item.title, item.quantity)
      }
    }
  }

  const byProduct = Array.from(jarCounts.values())
    .sort((a, b) => b.jars - a.jars)

  return NextResponse.json({ daily, byProduct })
}
