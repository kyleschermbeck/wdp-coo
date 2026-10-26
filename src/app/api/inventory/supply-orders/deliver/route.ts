import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface ItemBody {
  id: number
  delivered: boolean
  delivered_qty?: number
}

export async function PATCH(req: NextRequest) {
  const db = await getDb()
  const { order_id, items }: { order_id: number; items: ItemBody[] } = await req.json()

  if (!order_id || !Array.isArray(items)) {
    return NextResponse.json({ error: 'order_id and items required' }, { status: 400 })
  }

  for (const item of items) {
    const existing = (await db.execute({sql: `SELECT id, supply_id, shopify_product_id, qty, delivered FROM supply_order_items WHERE id = ?`, args: [item.id]})).rows[0] as unknown as { id: number; supply_id: number | null; shopify_product_id: string | null; qty: number; delivered: number } | undefined

    if (!existing) continue

    const wasDelivered = existing.delivered === 1
    const nowDelivered = item.delivered
    const deliveredQty = item.delivered_qty ?? existing.qty

    await db.execute({sql: `
      UPDATE supply_order_items
      SET delivered = ?, delivered_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END,
          delivered_qty = ?
      WHERE id = ?
    `, args: [nowDelivered ? 1 : 0, nowDelivered ? 1 : 0, deliveredQty, item.id]})

    if (!wasDelivered && nowDelivered) {
      // Label item — update product_label_inventory
      if (existing.shopify_product_id) {
        const labelSupply = (await db.execute({sql: `SELECT id FROM supplies WHERE name = 'Jar Label - 100/roll' AND active = 1 LIMIT 1`, args: []})).rows[0] as unknown as { id: number } | undefined

        if (labelSupply) {
          await db.execute({sql: `
            INSERT INTO product_label_inventory (shopify_product_id, supply_id, units_on_hand)
            VALUES (?, ?, ?)
            ON CONFLICT(shopify_product_id, supply_id) DO UPDATE
              SET units_on_hand = units_on_hand + excluded.units_on_hand
          `, args: [existing.shopify_product_id, labelSupply.id, deliveredQty]})
        }
      } else if (existing.supply_id) {
        // Regular supply item — update containers_on_hand
        await db.execute({sql: `UPDATE supplies SET containers_on_hand = containers_on_hand + ? WHERE id = ?`, args: [deliveredQty, existing.supply_id]})
      }
    } else if (wasDelivered && !nowDelivered) {
      // Unchecking — reverse the addition
      if (existing.shopify_product_id) {
        const labelSupply = (await db.execute({sql: `SELECT id FROM supplies WHERE name = 'Jar Label - 100/roll' AND active = 1 LIMIT 1`, args: []})).rows[0] as unknown as { id: number } | undefined

        if (labelSupply) {
          await db.execute({sql: `
            UPDATE product_label_inventory
            SET units_on_hand = MAX(0, units_on_hand - ?)
            WHERE shopify_product_id = ? AND supply_id = ?
          `, args: [deliveredQty, existing.shopify_product_id, labelSupply.id]})
        }
      } else if (existing.supply_id) {
        await db.execute({sql: `UPDATE supplies SET containers_on_hand = MAX(0, containers_on_hand - ?) WHERE id = ?`, args: [deliveredQty, existing.supply_id]})
      }
    }
  }

  // Recompute order status
  const allItems = (await db.execute({sql: `SELECT delivered FROM supply_order_items WHERE supply_order_id = ?`, args: [order_id]})).rows as unknown as { delivered: number }[]

  const totalItems = allItems.length
  const deliveredCount = allItems.filter(i => i.delivered === 1).length
  const status = deliveredCount === 0 ? 'pending' : deliveredCount === totalItems ? 'delivered' : 'partial'

  await db.execute({sql: `UPDATE supply_orders SET status = ? WHERE id = ?`, args: [status, order_id]})

  return NextResponse.json({ ok: true, status })
}
