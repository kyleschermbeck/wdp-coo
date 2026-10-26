import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function POST(req: NextRequest) {
  const db = await getDb()
  const {
    supply_id,
    shopify_product_id,
    vendor,
    description,
    qty,
    unit,
    expected_delivery,
    force,
  }: {
    supply_id?: number | null
    shopify_product_id?: string | null
    vendor: string
    description: string
    qty: number
    unit?: string | null
    expected_delivery?: string | null
    force?: boolean
  } = await req.json()

  if (!vendor || !description || !qty) {
    return NextResponse.json({ error: 'vendor, description, and qty required' }, { status: 400 })
  }

  // Check for existing pending orders for this supply or product label
  if (!force) {
    let existing: { id: number; vendor: string; order_date: string | null; status: string }[] = []
    if (shopify_product_id) {
      existing = (await db.execute({sql: `
        SELECT so.id, so.vendor, so.order_date, so.status
        FROM supply_orders so
        JOIN supply_order_items soi ON soi.supply_order_id = so.id
        WHERE soi.shopify_product_id = ? AND so.status IN ('pending', 'partial', 'shipped')
          AND so.gmail_id IS NULL
      `, args: [shopify_product_id]})).rows as unknown as typeof existing
    } else if (supply_id) {
      existing = (await db.execute({sql: `
        SELECT so.id, so.vendor, so.order_date, so.status
        FROM supply_orders so
        JOIN supply_order_items soi ON soi.supply_order_id = so.id
        WHERE soi.supply_id = ? AND so.status IN ('pending', 'partial', 'shipped')
          AND so.gmail_id IS NULL
      `, args: [supply_id]})).rows as unknown as typeof existing
    }
    if (existing.length > 0) {
      return NextResponse.json({ duplicate: true, orders: existing })
    }
  }

  const result = await db.execute({sql: `
    INSERT INTO supply_orders (vendor, order_number, order_date, estimated_delivery, status, subject)
    VALUES (?, null, date('now'), ?, 'pending', ?)
  `, args: [vendor, expected_delivery ?? null, `Manual entry: ${description}`]}) as { lastInsertRowid: number | bigint }

  const orderId = Number(result.lastInsertRowid)

  await db.execute({sql: `
    INSERT INTO supply_order_items (supply_order_id, supply_id, shopify_product_id, description, qty, unit)
    VALUES (?, ?, ?, ?, ?, ?)
  `, args: [orderId, supply_id ?? null, shopify_product_id ?? null, description, qty, unit ?? null]})

  return NextResponse.json({ ok: true, order_id: orderId })
}
