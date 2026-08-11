import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()

  const order = db.prepare(`
    SELECT o.*,
           c.first_name, c.last_name, c.phone,
           c.orders_count as customer_orders_count,
           c.total_spent  as customer_total_spent
    FROM shopify_orders o
    LEFT JOIN shopify_customers c ON c.email = o.email
    WHERE o.shopify_id = ?
  `).get(id) as Record<string, unknown> | undefined

  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(order)
}
