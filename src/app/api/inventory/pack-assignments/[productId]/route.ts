import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface AssignmentRow {
  order_number: number
  qty: number
}

// GET: all current assignments for a product
export async function GET(_: NextRequest, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params
  const db = await getDb()

  const assignments = (await db.execute({sql: `
    SELECT order_number, SUM(qty) as qty
    FROM pack_assignments
    WHERE shopify_product_id = ?
    GROUP BY order_number
    ORDER BY order_number
  `, args: [productId]})).rows as unknown as AssignmentRow[]

  const totalAssigned = assignments.reduce((s, r) => s + r.qty, 0)

  return NextResponse.json({ assignments, totalAssigned })
}

// PUT: atomically replace all assignments for a product
// Body: { assignments: [{ orderNumber: number, qty: number }] }
export async function PUT(req: NextRequest, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params
  const { assignments }: { assignments: { orderNumber: number; qty: number }[] } = await req.json()

  if (!Array.isArray(assignments)) {
    return NextResponse.json({ error: 'assignments array required' }, { status: 400 })
  }

  const db = await getDb()

  await db.execute({ sql: `DELETE FROM pack_assignments WHERE shopify_product_id = ?`, args: [productId] })
  for (const a of assignments) {
    if (a.qty > 0) await db.execute({ sql: `INSERT INTO pack_assignments (shopify_product_id, order_number, qty) VALUES (?, ?, ?)`, args: [productId, a.orderNumber, a.qty] })
  }

  return NextResponse.json({ ok: true })
}
