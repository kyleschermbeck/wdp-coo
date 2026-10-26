import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface PackagingSupplyRow {
  id: number
  name: string
  vendor: string | null
  order_url: string | null
  package_cost: number | null
  total_servings: number | null
  containers_on_hand: number
}

interface OrderRow {
  line_items: string
}

interface LineItem {
  product_id: number
  fulfillable_quantity: number
  quantity: number
}

interface ProductStock {
  shopify_id: string
  inventory_quantity: number
}

interface PackagingLink {
  supply_id: number
  shopify_product_id: string
}

interface LabeledJarsRow {
  shopify_product_id: string
  qty: number
}

export async function GET() {
  const db = getDb()

  const supplies = db.prepare(
    `SELECT id, name, vendor, order_url, package_cost, total_servings, containers_on_hand
     FROM supplies WHERE category = 'packaging' AND active = 1 AND name NOT LIKE '%Label%' ORDER BY name`
  ).all() as PackagingSupplyRow[]

  // Compute jars still to pack per product (same logic as supply-levels)
  const orders = db.prepare(`
    SELECT line_items FROM shopify_orders
    WHERE fulfillment_status IS NULL OR fulfillment_status IN ('unfulfilled', 'partial')
  `).all() as OrderRow[]

  const jarsNeeded: Record<string, number> = {}
  for (const order of orders) {
    let items: LineItem[] = []
    try { items = JSON.parse(order.line_items) } catch { continue }
    for (const item of items) {
      const qty = item.fulfillable_quantity ?? item.quantity ?? 0
      if (!qty) continue
      const pid = String(item.product_id)
      jarsNeeded[pid] = (jarsNeeded[pid] ?? 0) + qty
    }
  }

  const products = db.prepare(
    `SELECT shopify_id, inventory_quantity FROM shopify_products WHERE status != 'archived'`
  ).all() as ProductStock[]

  const stockMap: Record<string, number> = {}
  for (const p of products) stockMap[p.shopify_id] = p.inventory_quantity

  const labeledJarsRows = db.prepare(`SELECT shopify_product_id, qty FROM labeled_jars`).all() as LabeledJarsRow[]
  const labeledJarsMap: Record<string, number> = {}
  for (const r of labeledJarsRows) labeledJarsMap[r.shopify_product_id] = r.qty

  const jarsToPack: Record<string, number> = {}
  for (const [pid, needed] of Object.entries(jarsNeeded)) {
    const inventoryQty = stockMap[pid] ?? 0
    const onHand = Math.max(0, needed + inventoryQty)
    const labeled = labeledJarsMap[pid] ?? 0
    jarsToPack[pid] = Math.max(0, needed - onHand - labeled)
  }

  // Units needed per packaging supply = sum of jars_to_pack for products using it
  const links = db.prepare(
    `SELECT supply_id, shopify_product_id FROM product_packaging`
  ).all() as PackagingLink[]

  const unitsNeeded: Record<number, number> = {}
  for (const link of links) {
    const jars = jarsToPack[link.shopify_product_id] ?? 0
    if (!jars) continue
    unitsNeeded[link.supply_id] = (unitsNeeded[link.supply_id] ?? 0) + jars
  }

  const result = supplies.map(s => ({
    id: s.id,
    name: s.name,
    vendor: s.vendor,
    order_url: s.order_url,
    package_cost: s.package_cost,
    units_per_package: s.total_servings,
    units_on_hand: s.containers_on_hand ?? 0,
    units_needed: unitsNeeded[s.id] ?? 0,
  }))

  return NextResponse.json(result)
}
