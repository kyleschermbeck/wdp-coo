import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params
  const db = getDb()
  const order = db.prepare(`
    SELECT so.id, so.shopify_id, so.order_number, so.email, so.total_price, so.subtotal_price,
           so.financial_status, so.fulfillment_status, so.line_items,
           so.created_at, so.processed_at, so.total_tax, so.total_discounts, so.total_shipping, so.discount_codes,
           sc.first_name, sc.last_name, sc.phone
    FROM shopify_orders so
    LEFT JOIN shopify_customers sc ON sc.email = so.email
    WHERE so.order_number = ?
  `).get(parseInt(orderNumber)) as Record<string, unknown> | undefined

  if (!order) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(order)
}
