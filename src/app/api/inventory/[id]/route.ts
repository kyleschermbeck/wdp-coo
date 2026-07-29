import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const db = getDb()
  const { id } = await params
  const inventoryId = parseInt(id, 10)

  if (isNaN(inventoryId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const body = await request.json() as { quantity_on_hand?: number; reorder_threshold?: number }

  const updates: string[] = []
  const values: (number | string)[] = []

  if (body.quantity_on_hand !== undefined) {
    updates.push('quantity_on_hand = ?')
    values.push(body.quantity_on_hand)
  }
  if (body.reorder_threshold !== undefined) {
    updates.push('reorder_threshold = ?')
    values.push(body.reorder_threshold)
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  updates.push("last_updated = datetime('now')")
  values.push(inventoryId)

  db.prepare(`UPDATE inventory SET ${updates.join(', ')} WHERE id = ?`).run(...values)

  const row = db.prepare('SELECT * FROM inventory WHERE id = ?').get(inventoryId)
  return NextResponse.json(row)
}
