import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface AssignmentRow {
  order_number: number
  qty: number
}

// GET: all current assignments for a product
export async function GET(_: NextRequest, { params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params
  const db = getDb()

  const assignments = db.prepare(`
    SELECT order_number, SUM(qty) as qty
    FROM pack_assignments
    WHERE shopify_product_id = ?
    GROUP BY order_number
    ORDER BY order_number
  `).all(productId) as AssignmentRow[]

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

  const db = getDb()

  db.transaction(() => {
    db.prepare(`DELETE FROM pack_assignments WHERE shopify_product_id = ?`).run(productId)
    const insert = db.prepare(`INSERT INTO pack_assignments (shopify_product_id, order_number, qty) VALUES (?, ?, ?)`)
    for (const a of assignments) {
      if (a.qty > 0) insert.run(productId, a.orderNumber, a.qty)
    }
  })()

  return NextResponse.json({ ok: true })
}
