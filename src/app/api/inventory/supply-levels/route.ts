import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface SupplyRow {
  id: number
  name: string
  vendor: string | null
  order_url: string | null
  package_weight: number | null
  package_extra_oz: number | null
  oz_per_tbsp: number | null
  package_cost: number | null
  containers_on_hand: number
  category: string
  active: number
  updated_at: string | null
}

interface IngredientRow {
  supply_id: number
  shopify_product_id: string
  tbsp: number
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


export async function GET() {
  const db = getDb()

  const supplies = db.prepare(
    `SELECT id, name, vendor, order_url, package_weight, package_extra_oz,
            oz_per_tbsp, package_cost, containers_on_hand, category, active, updated_at
     FROM supplies WHERE category = 'product' AND active = 1
     ORDER BY name`
  ).all() as SupplyRow[]

  // Aggregate jars needed per product from unfulfilled orders
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

  // Get current inventory quantities to compute jars still to pack
  const products = db.prepare(
    `SELECT shopify_id, inventory_quantity FROM shopify_products WHERE status != 'archived'`
  ).all() as ProductStock[]

  const stockMap: Record<string, number> = {}
  for (const p of products) stockMap[p.shopify_id] = p.inventory_quantity

  // jars still to pack = max(0, needed - on_hand); labeled jars are in-progress, not done
  const jarsToPack: Record<string, number> = {}
  for (const [pid, needed] of Object.entries(jarsNeeded)) {
    const inventoryQty = stockMap[pid] ?? 0
    const onHand = Math.max(0, needed + inventoryQty)
    jarsToPack[pid] = Math.max(0, needed - onHand)
  }

  // Labeled jars beyond order need are backstock — they'll still be filled, so count their supplies
  const labeledJarsRows = db.prepare(`SELECT shopify_product_id, qty FROM labeled_jars`).all() as { shopify_product_id: string; qty: number }[]
  for (const r of labeledJarsRows) {
    if (r.qty > (jarsToPack[r.shopify_product_id] ?? 0)) {
      jarsToPack[r.shopify_product_id] = r.qty
    }
  }

  // All ingredients for all products
  const ingredients = db.prepare(
    `SELECT pi.supply_id, pi.shopify_product_id, pi.tbsp
     FROM product_ingredients pi`
  ).all() as IngredientRow[]

  // Compute tbsp still needed per supply (based on jars still to pack)
  const tbspNeeded: Record<number, number> = {}
  for (const ing of ingredients) {
    const jars = jarsToPack[ing.shopify_product_id] ?? 0
    if (!jars) continue
    tbspNeeded[ing.supply_id] = (tbspNeeded[ing.supply_id] ?? 0) + jars * ing.tbsp
  }

  const result = supplies.map(s => {
    const totalOz = (s.package_weight ?? 0) * 16 + (s.package_extra_oz ?? 0)
    const tbspPerContainer = (totalOz > 0 && s.oz_per_tbsp) ? totalOz / s.oz_per_tbsp : null
    const tbspOnHand = tbspPerContainer != null ? (s.containers_on_hand ?? 0) * tbspPerContainer : null
    const needed = tbspNeeded[s.id] ?? 0
    const missingData = tbspPerContainer == null

    return {
      id: s.id,
      name: s.name,
      vendor: s.vendor,
      order_url: s.order_url,
      package_cost: s.package_cost,
      containers_on_hand: s.containers_on_hand ?? 0,
      tbsp_per_container: tbspPerContainer,
      tbsp_on_hand: tbspOnHand,
      tbsp_needed: needed,
      missing_data: missingData,
      updated_at: s.updated_at ?? null,
    }
  })

  return NextResponse.json(result)
}
