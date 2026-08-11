import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface LineItem {
  title: string
  quantity: number
  price: string
  product_id?: number | null
  variant_id?: number | null
  variant_title?: string | null
}

interface ProductRevenuRow {
  title: string
  product_id: string | null
  units: number
  revenue: number
  orders: number
  avg_price: number
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const days = parseInt(searchParams.get('days') ?? '90', 10)

  const db = getDb()

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  const orders = db.prepare(`
    SELECT line_items, created_at FROM shopify_orders
    WHERE created_at >= ? AND financial_status != 'refunded'
    ORDER BY created_at DESC
  `).all(cutoff.toISOString()) as { line_items: string; created_at: string }[]

  // Aggregate by product title
  const productMap = new Map<string, ProductRevenuRow>()

  for (const order of orders) {
    let items: LineItem[]
    try { items = JSON.parse(order.line_items) as LineItem[] } catch { continue }

    // Track unique order per product (using a Set per product title would be complex;
    // instead count order contributions per title)
    const seenInOrder = new Set<string>()

    for (const item of items) {
      const title = item.title ?? 'Unknown'
      const qty = item.quantity ?? 1
      const price = parseFloat(item.price ?? '0')
      const lineRevenue = price * qty
      const pid = item.product_id ? String(item.product_id) : null

      const existing = productMap.get(title)
      if (existing) {
        existing.units   += qty
        existing.revenue += lineRevenue
        if (!seenInOrder.has(title)) {
          existing.orders += 1
          seenInOrder.add(title)
        }
      } else {
        productMap.set(title, {
          title,
          product_id: pid,
          units: qty,
          revenue: lineRevenue,
          orders: 1,
          avg_price: price,
        })
        seenInOrder.add(title)
      }
    }
  }

  // Compute avg_price and sort by revenue desc
  const products = Array.from(productMap.values())
    .map(p => ({ ...p, avg_price: p.units > 0 ? p.revenue / p.units : 0 }))
    .sort((a, b) => b.revenue - a.revenue)

  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0)
  const totalUnits   = products.reduce((s, p) => s + p.units, 0)

  return NextResponse.json({ products, total_revenue: totalRevenue, total_units: totalUnits, days })
}
