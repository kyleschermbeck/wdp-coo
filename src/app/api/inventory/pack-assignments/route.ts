import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// PUT: reassign packed jars from one order to another
// { shopify_product_id, from_order_number, to_order_number, qty, from_can_fill, to_can_fill }
// from_can_fill / to_can_fill: current canFill for each order+product (from orders analysis).
// We pin both orders explicitly so FIFO-allocated items can also be reassigned.
export async function PUT(req: NextRequest) {
  const { shopify_product_id, from_order_number, to_order_number, qty, from_can_fill, to_can_fill } = await req.json()
  if (!shopify_product_id || !from_order_number || !to_order_number || !qty || qty <= 0) {
    return NextResponse.json({ error: 'shopify_product_id, from_order_number, to_order_number, qty required' }, { status: 400 })
  }
  if (qty > (from_can_fill ?? 0)) {
    return NextResponse.json({ error: `Cannot move ${qty} — only ${from_can_fill ?? 0} available from order #${from_order_number}` }, { status: 400 })
  }

  const db = getDb()

  const newFromQty = Math.max(0, (from_can_fill ?? 0) - qty)
  const newToQty = (to_can_fill ?? 0) + qty

  db.transaction(() => {
    // Pin from-order explicitly with reduced qty
    db.prepare(`DELETE FROM pack_assignments WHERE shopify_product_id = ? AND order_number = ?`)
      .run(shopify_product_id, from_order_number)
    if (newFromQty > 0) {
      db.prepare(`INSERT INTO pack_assignments (shopify_product_id, order_number, qty) VALUES (?, ?, ?)`)
        .run(shopify_product_id, from_order_number, newFromQty)
    }
    // Pin to-order explicitly with increased qty
    db.prepare(`DELETE FROM pack_assignments WHERE shopify_product_id = ? AND order_number = ?`)
      .run(shopify_product_id, to_order_number)
    db.prepare(`INSERT INTO pack_assignments (shopify_product_id, order_number, qty) VALUES (?, ?, ?)`)
      .run(shopify_product_id, to_order_number, newToQty)
  })()

  return NextResponse.json({ ok: true })
}
