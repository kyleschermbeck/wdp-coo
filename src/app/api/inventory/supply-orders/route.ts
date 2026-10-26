import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function DELETE(req: NextRequest) {
  const db = await getDb()
  const { id }: { id: number } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  // Only allow deleting manual orders (no gmail_id) or orders with no items
  const order = (await db.execute({sql: `SELECT gmail_id FROM supply_orders WHERE id = ?`, args: [id]})).rows[0] as unknown as { gmail_id: string | null } | undefined
  if (!order) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (order.gmail_id) return NextResponse.json({ error: 'cannot delete email-synced orders' }, { status: 403 })
  await db.execute({sql: `DELETE FROM supply_orders WHERE id = ?`, args: [id]})
  return NextResponse.json({ ok: true })
}

export async function GET() {
  const db = await getDb()

  const orders = (await db.execute({sql: `
    SELECT id, gmail_id, vendor, order_number, order_date, estimated_delivery,
           tracking_number, status, subject, created_at
    FROM supply_orders
    WHERE status != 'skipped' AND gmail_id IS NULL
    ORDER BY order_date DESC, created_at DESC
  `, args: []})).rows as unknown as {
    id: number; gmail_id: string; vendor: string; order_number: string | null
    order_date: string | null; estimated_delivery: string | null
    tracking_number: string | null; status: string; subject: string | null; created_at: string
  }[]

  const items = (await db.execute({sql: `
    SELECT soi.id, soi.supply_order_id, soi.supply_id, soi.shopify_product_id, soi.description,
           soi.qty, soi.unit, soi.delivered, soi.delivered_at, soi.delivered_qty,
           s.name as supply_name
    FROM supply_order_items soi
    LEFT JOIN supplies s ON s.id = soi.supply_id
    ORDER BY soi.id
  `, args: []})).rows as unknown as {
    id: number; supply_order_id: number; supply_id: number | null; shopify_product_id: string | null
    description: string; qty: number; unit: string | null; delivered: number
    delivered_at: string | null; delivered_qty: number | null; supply_name: string | null
  }[]

  const itemsByOrder: Record<number, typeof items> = {}
  for (const item of items) {
    if (!itemsByOrder[item.supply_order_id]) itemsByOrder[item.supply_order_id] = []
    itemsByOrder[item.supply_order_id].push(item)
  }

  return NextResponse.json(orders.map(o => ({ ...o, items: itemsByOrder[o.id] ?? [] })))
}
