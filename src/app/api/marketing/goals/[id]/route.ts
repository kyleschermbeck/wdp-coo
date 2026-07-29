import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = getDb()
  const { title, description, category, target_value, current_value, unit, due_date, status } = await request.json()
  db.prepare(`
    UPDATE marketing_goals
    SET title = ?, description = ?, category = ?, target_value = ?, current_value = ?, unit = ?, due_date = ?, status = ?
    WHERE id = ?
  `).run(
    title,
    description ?? null,
    category ?? 'growth',
    target_value ?? null,
    current_value ?? 0,
    unit ?? '',
    due_date ?? null,
    status ?? 'active',
    id
  )
  const goal = db.prepare('SELECT * FROM marketing_goals WHERE id = ?').get(id)
  return NextResponse.json(goal)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = getDb()
  db.prepare('DELETE FROM marketing_goals WHERE id = ?').run(id)
  return NextResponse.json({ ok: true })
}
