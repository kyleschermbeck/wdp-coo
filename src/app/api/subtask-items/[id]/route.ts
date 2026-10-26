import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  const { id } = await params
  const body = await req.json()

  const item = ((await db.execute({sql: 'SELECT * FROM subtask_items WHERE id = ?', args: [Number(id)]})).rows[0])
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const fields: string[] = []
  const values: unknown[] = []

  if ('title' in body) { fields.push('title = ?'); values.push(body.title) }
  if ('completed' in body) { fields.push('completed = ?'); values.push(body.completed ? 1 : 0) }
  if ('sort_order' in body) { fields.push('sort_order = ?'); values.push(body.sort_order) }

  if (fields.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  values.push(Number(id))
  await db.execute({sql: `UPDATE subtask_items SET ${fields.join(', ')} WHERE id = ?`, args: values as (string | number | boolean | null | bigint)[]})

  const updated = ((await db.execute({sql: 'SELECT * FROM subtask_items WHERE id = ?', args: [Number(id)]})).rows[0])
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  const { id } = await params
  await db.execute({sql: 'DELETE FROM subtask_items WHERE id = ?', args: [Number(id)]})
  return NextResponse.json({ ok: true })
}
