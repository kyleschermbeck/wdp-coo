import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = await getDb()
  const { title, description, category, target_value, current_value, unit, due_date, status } = await request.json()
  await db.execute({sql: `
    UPDATE marketing_goals
    SET title = ?, description = ?, category = ?, target_value = ?, current_value = ?, unit = ?, due_date = ?, status = ?
    WHERE id = ?
  `, args: [title,
    description ?? null,
    category ?? 'growth',
    target_value ?? null,
    current_value ?? 0,
    unit ?? '',
    due_date ?? null,
    status ?? 'active',
    id]})
  const goal = (await db.execute({sql: 'SELECT * FROM marketing_goals WHERE id = ?', args: [id]})).rows[0]
  return NextResponse.json(goal)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = await getDb()
  await db.execute({sql: 'DELETE FROM marketing_goals WHERE id = ?', args: [id]})
  return NextResponse.json({ ok: true })
}
