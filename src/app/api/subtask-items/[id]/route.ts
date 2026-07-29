import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb()
  const { id } = await params
  const body = await req.json()

  const item = db.prepare('SELECT * FROM subtask_items WHERE id = ?').get(Number(id))
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const fields: string[] = []
  const values: unknown[] = []

  if ('title' in body) { fields.push('title = ?'); values.push(body.title) }
  if ('completed' in body) { fields.push('completed = ?'); values.push(body.completed ? 1 : 0) }
  if ('sort_order' in body) { fields.push('sort_order = ?'); values.push(body.sort_order) }

  if (fields.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  values.push(Number(id))
  db.prepare(`UPDATE subtask_items SET ${fields.join(', ')} WHERE id = ?`).run(...values)

  const updated = db.prepare('SELECT * FROM subtask_items WHERE id = ?').get(Number(id))
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb()
  const { id } = await params
  db.prepare('DELETE FROM subtask_items WHERE id = ?').run(Number(id))
  return NextResponse.json({ ok: true })
}
