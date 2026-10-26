import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface LabelInventoryRow {
  units_on_hand: number
}

interface JarSupply {
  id: number
  containers_on_hand: number
}

interface LabeledJarsRow {
  qty: number
}

export async function POST(req: NextRequest) {
  const { shopify_id, qty } = await req.json()
  if (!shopify_id || qty === undefined || qty === null || qty === 0) {
    return NextResponse.json({ error: 'shopify_id and non-zero qty required' }, { status: 400 })
  }

  const db = getDb()

  // Find label supply for this product
  const labelSupply = db.prepare(
    `SELECT id FROM supplies WHERE name = 'Jar Label - 100/roll' AND active = 1 LIMIT 1`
  ).get() as { id: number } | undefined

  // Adjust labels in product_label_inventory (deduct when adding, restore when removing)
  let newLabelQty: number | null = null
  if (labelSupply) {
    const existing = db.prepare(
      `SELECT units_on_hand FROM product_label_inventory WHERE shopify_product_id = ? AND supply_id = ?`
    ).get(shopify_id, labelSupply.id) as LabelInventoryRow | undefined
    const current = existing?.units_on_hand ?? 0
    newLabelQty = Math.max(0, current - qty)
    db.prepare(`
      INSERT INTO product_label_inventory (shopify_product_id, supply_id, units_on_hand)
      VALUES (?, ?, ?)
      ON CONFLICT(shopify_product_id, supply_id) DO UPDATE SET units_on_hand = excluded.units_on_hand
    `).run(shopify_id, labelSupply.id, newLabelQty)
  }

  // Adjust jars in supplies.containers_on_hand (deduct when adding, restore when removing)
  const jarSupply = db.prepare(
    `SELECT id, containers_on_hand FROM supplies WHERE name = '8 oz. Jar' AND active = 1 LIMIT 1`
  ).get() as JarSupply | undefined

  let newJarQty: number | null = null
  if (jarSupply) {
    newJarQty = Math.max(0, (jarSupply.containers_on_hand ?? 0) - qty)
    db.prepare(`UPDATE supplies SET containers_on_hand = ? WHERE id = ?`)
      .run(newJarQty, jarSupply.id)
  }

  // Update labeled_jars (floor at 0 — can't have negative labeled count)
  const existing = db.prepare(
    `SELECT qty FROM labeled_jars WHERE shopify_product_id = ?`
  ).get(shopify_id) as LabeledJarsRow | undefined
  const currentLabeled = existing?.qty ?? 0
  const newLabeled = Math.max(0, currentLabeled + qty)
  db.prepare(`
    INSERT INTO labeled_jars (shopify_product_id, qty)
    VALUES (?, ?)
    ON CONFLICT(shopify_product_id) DO UPDATE SET qty = excluded.qty
  `).run(shopify_id, newLabeled)

  return NextResponse.json({ ok: true, labeled_qty: newLabeled, newLabelQty, newJarQty })
}
