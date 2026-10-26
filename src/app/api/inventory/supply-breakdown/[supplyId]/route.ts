import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface IngredientRow {
  shopify_product_id: string
  title: string
  tbsp: number
}

interface LineItem {
  product_id: number
  fulfillable_quantity: number
  quantity: number
}

interface OrderRow {
  line_items: string
}

interface ProductStock {
  shopify_id: string
  inventory_quantity: number
}

interface LabeledJarsRow {
  shopify_product_id: string
  qty: number
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ supplyId: string }> }) {
  const { supplyId } = await params
  const db = getDb()

  const supply = db.prepare(`SELECT id, name FROM supplies WHERE id = ?`).get(parseInt(supplyId)) as { id: number; name: string } | undefined
  if (!supply) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // All products that use this supply
  const rows = db.prepare(`
    SELECT pi.shopify_product_id, sp.title, pi.tbsp
    FROM product_ingredients pi
    JOIN shopify_products sp ON sp.shopify_id = pi.shopify_product_id
    WHERE pi.supply_id = ?
    ORDER BY sp.title
  `).all(parseInt(supplyId)) as IngredientRow[]

  if (rows.length === 0) return NextResponse.json({ supply: supply.name, items: [] })

  // Compute jars to pack per product (same logic as supply-levels)
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

  const products = db.prepare(`SELECT shopify_id, inventory_quantity FROM shopify_products WHERE status != 'archived'`).all() as ProductStock[]
  const stockMap: Record<string, number> = {}
  for (const p of products) stockMap[p.shopify_id] = p.inventory_quantity

  const jarsToPack: Record<string, number> = {}
  for (const [pid, needed] of Object.entries(jarsNeeded)) {
    const inventoryQty = stockMap[pid] ?? 0
    const onHand = Math.max(0, needed + inventoryQty)
    jarsToPack[pid] = Math.max(0, needed - onHand)
  }

  const labeledJarsRows = db.prepare(`SELECT shopify_product_id, qty FROM labeled_jars`).all() as LabeledJarsRow[]
  for (const r of labeledJarsRows) {
    if (r.qty > (jarsToPack[r.shopify_product_id] ?? 0)) {
      jarsToPack[r.shopify_product_id] = r.qty
    }
  }

  const items = rows
    .map(r => {
      const jars = jarsToPack[r.shopify_product_id] ?? 0
      return {
        blend: r.title,
        jars,
        tbspPerJar: r.tbsp,
        totalTbsp: jars * r.tbsp,
      }
    })
    .filter(r => r.jars > 0)
    .sort((a, b) => b.totalTbsp - a.totalTbsp)

  return NextResponse.json({ supply: supply.name, items })
}
