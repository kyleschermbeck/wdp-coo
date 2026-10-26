import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface ProductRow {
  shopify_id: string
  title: string
  is_bundle: number
  inventory_quantity: number
  excluded: number
}

interface LabelInventoryRow {
  shopify_product_id: string
  units_on_hand: number
}

interface LabeledJarsRow {
  shopify_product_id: string
  qty: number
}

interface OrderRow {
  line_items: string
}

interface LineItem {
  product_id: number
  fulfillable_quantity: number
  quantity: number
}

// GET: all active, non-bundle products with their label inventory + units needed
export async function GET() {
  const db = getDb()

  // Find label supply
  const labelSupply = db.prepare(
    `SELECT id FROM supplies WHERE name = 'Jar Label - 100/roll' AND active = 1 LIMIT 1`
  ).get() as { id: number } | undefined

  const products = db.prepare(
    `SELECT sp.shopify_id, sp.title, sp.is_bundle, sp.inventory_quantity,
            CASE WHEN lie.shopify_product_id IS NOT NULL THEN 1 ELSE 0 END as excluded
     FROM shopify_products sp
     LEFT JOIN label_inventory_excluded lie ON lie.shopify_product_id = sp.shopify_id
     WHERE sp.status = 'active' AND sp.is_bundle = 0
     ORDER BY sp.title`
  ).all() as ProductRow[]

  // Existing label inventory rows
  const inventoryRows = labelSupply ? (db.prepare(
    `SELECT shopify_product_id, units_on_hand FROM product_label_inventory WHERE supply_id = ?`
  ).all(labelSupply.id) as LabelInventoryRow[]) : []
  const inventoryMap: Record<string, number> = {}
  for (const r of inventoryRows) inventoryMap[r.shopify_product_id] = r.units_on_hand

  // Jars still to pack per product
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
      jarsNeeded[String(item.product_id)] = (jarsNeeded[String(item.product_id)] ?? 0) + qty
    }
  }

  const stockMap: Record<string, number> = {}
  for (const p of products) stockMap[p.shopify_id] = p.inventory_quantity

  const labeledJarsRows = db.prepare(`SELECT shopify_product_id, qty FROM labeled_jars`).all() as LabeledJarsRow[]
  const labeledJarsMap: Record<string, number> = {}
  for (const r of labeledJarsRows) labeledJarsMap[r.shopify_product_id] = r.qty

  const result = products.map(p => {
    const needed = jarsNeeded[p.shopify_id] ?? 0
    const onHand = Math.max(0, needed + (stockMap[p.shopify_id] ?? 0))
    const labeled = labeledJarsMap[p.shopify_id] ?? 0
    const jarsToPack = Math.max(0, needed - onHand - labeled)
    return {
      shopify_id: p.shopify_id,
      title: p.title,
      supply_id: labelSupply?.id ?? null,
      units_on_hand: inventoryMap[p.shopify_id] ?? 0,
      units_needed: jarsToPack,
      labeled_jars: labeled,
      excluded: p.excluded === 1,
    }
  })

  return NextResponse.json(result)
}

// PUT: toggle excluded status for a product
export async function PUT(req: NextRequest) {
  const db = getDb()
  const { shopify_product_id, excluded }: { shopify_product_id: string; excluded: boolean } = await req.json()
  if (!shopify_product_id) return NextResponse.json({ error: 'shopify_product_id required' }, { status: 400 })
  if (excluded) {
    db.prepare(`INSERT OR IGNORE INTO label_inventory_excluded (shopify_product_id) VALUES (?)`).run(shopify_product_id)
  } else {
    db.prepare(`DELETE FROM label_inventory_excluded WHERE shopify_product_id = ?`).run(shopify_product_id)
  }
  return NextResponse.json({ ok: true, excluded })
}

// PATCH: update a single product's label inventory
export async function PATCH(req: NextRequest) {
  const db = getDb()
  const { shopify_product_id, supply_id, units_on_hand } = await req.json()
  if (!shopify_product_id || supply_id == null) {
    return NextResponse.json({ error: 'shopify_product_id and supply_id required' }, { status: 400 })
  }
  const val = Math.max(0, parseInt(units_on_hand) || 0)
  db.prepare(`
    INSERT INTO product_label_inventory (shopify_product_id, supply_id, units_on_hand)
    VALUES (?, ?, ?)
    ON CONFLICT(shopify_product_id, supply_id) DO UPDATE SET units_on_hand = excluded.units_on_hand
  `).run(shopify_product_id, supply_id, val)
  return NextResponse.json({ ok: true, units_on_hand: val })
}
