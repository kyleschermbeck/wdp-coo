import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import type { Client } from '@libsql/client'

interface LineItem {
  product_id?: string | number
  title?: string
  quantity: number
  price: string
}

interface BundleComponent {
  component_shopify_id: string
  quantity: number
}

// Build a cost map: shopify_id → cost per unit.
// Uses product_local.cost_per_unit (set by the inventory page) as the source of truth.
// For bundles, sums component costs. Returns null for products with no cost data.
async function buildCostMap(db: Client): Promise<Map<string, number>> {
  const products = (await db.execute({sql: `
    SELECT sp.shopify_id, sp.title, sp.is_bundle, pl.cost_per_unit
    FROM shopify_products sp
    LEFT JOIN product_local pl ON pl.shopify_product_id = sp.shopify_id
    WHERE sp.status != 'archived'
  `, args: []})).rows as unknown as Array<{ shopify_id: string; title: string; is_bundle: number | null; cost_per_unit: number | null }>

  const map = new Map<string, number>()

  // First pass: individual (non-bundle) products with stored cost
  for (const p of products) {
    if (p.is_bundle) continue
    if (p.cost_per_unit != null && p.cost_per_unit > 0) {
      map.set(p.shopify_id, p.cost_per_unit)
    }
  }

  // Second pass: bundle costs from stored component costs
  for (const p of products) {
    if (!p.is_bundle) continue

    // If the bundle itself has a stored cost, use it directly
    if (p.cost_per_unit != null && p.cost_per_unit > 0) {
      map.set(p.shopify_id, p.cost_per_unit)
      continue
    }

    // Otherwise derive from components
    const components = (await db.execute({sql: `
      SELECT component_shopify_id, quantity
      FROM product_bundle_components
      WHERE bundle_shopify_id = ?
    `, args: [p.shopify_id]})).rows as unknown as BundleComponent[]

    if (components.length === 0) continue

    let bundleCost = 0
    let allCosted = true
    for (const c of components) {
      const cc = map.get(c.component_shopify_id)
      if (cc == null) { allCosted = false; break }
      bundleCost += cc * (c.quantity || 1)
    }
    if (allCosted && bundleCost > 0) {
      map.set(p.shopify_id, bundleCost)
    }
  }

  return map
}

// Build a jar-count map: bundle_id → total jars it contains (components × quantity).
// Non-bundle products are always 1 jar.
async function buildJarsMap(db: Client): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  const components = (await db.execute({sql: `
    SELECT bundle_shopify_id, SUM(quantity) as total_jars
    FROM product_bundle_components
    GROUP BY bundle_shopify_id
  `, args: []})).rows as unknown as Array<{ bundle_shopify_id: string; total_jars: number }>
  for (const row of components) {
    map.set(row.bundle_shopify_id, row.total_jars)
  }
  return map
}

export async function GET(req: NextRequest) {
  const db = await getDb()
  const days = parseInt(req.nextUrl.searchParams.get('days') ?? '30', 10)

  const costMap = await buildCostMap(db)
  const jarsMap = await buildJarsMap(db)
  const costedProductCount = costMap.size

  // Query orders in the date range
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  const orders = (await db.execute({sql: `
    SELECT line_items
    FROM shopify_orders
    WHERE created_at >= ?
      AND financial_status NOT IN ('voided', 'refunded')
  `, args: [cutoff.toISOString()]})).rows as unknown as Array<{ line_items: string }>

  // Title lookup
  const titles = (await db.execute({sql: `SELECT shopify_id, title FROM shopify_products`, args: []})).rows as unknown as Array<{ shopify_id: string; title: string }>
  const titleMap = new Map(titles.map(p => [p.shopify_id, p.title]))

  const breakdownMap = new Map<string, {
    title: string
    orders: number
    jars: number
    costPerUnit: number
    totalCogs: number
  }>()

  let totalCogs = 0
  let totalUnitsSold = 0
  let totalUnitsOrdered = 0
  let totalJars = 0

  for (const order of orders) {
    let items: LineItem[] = []
    try { items = JSON.parse(order.line_items) as LineItem[] } catch { continue }

    for (const item of items) {
      totalUnitsOrdered += item.quantity
      const pid = item.product_id != null ? String(item.product_id) : null
      if (!pid) continue

      const jarsPerUnit = jarsMap.get(pid) ?? 1
      totalJars += jarsPerUnit * item.quantity

      const costPerUnit = costMap.get(pid)
      if (costPerUnit == null) continue

      const lineCogs = costPerUnit * item.quantity
      totalCogs += lineCogs
      totalUnitsSold += item.quantity

      const title = titleMap.get(pid) ?? (item.title ?? pid)
      const existing = breakdownMap.get(pid) ?? { title, orders: 0, jars: 0, costPerUnit, totalCogs: 0 }
      breakdownMap.set(pid, {
        ...existing,
        orders: existing.orders + item.quantity,
        jars: existing.jars + jarsPerUnit * item.quantity,
        totalCogs: existing.totalCogs + lineCogs,
      })
    }
  }

  const breakdown = Array.from(breakdownMap.values()).sort((a, b) => b.totalCogs - a.totalCogs)

  return NextResponse.json({
    cogs: totalCogs,
    unitsSold: totalUnitsSold,
    totalUnitsOrdered,
    totalJars,
    costedProductCount,
    breakdown,
  })
}
