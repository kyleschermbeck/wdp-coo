import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb()
  const { id } = await params
  const items = db.prepare(
    'SELECT * FROM subtask_items WHERE subtask_id = ? ORDER BY sort_order ASC, id ASC'
  ).all(Number(id))
  return NextResponse.json(items)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb()
  const { id } = await params
  const { title } = await req.json()
  if (!title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 })

  const maxOrder = (db.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) as m FROM subtask_items WHERE subtask_id = ?'
  ).get(Number(id)) as { m: number }).m

  const result = db.prepare(
    'INSERT INTO subtask_items (subtask_id, title, sort_order) VALUES (?, ?, ?)'
  ).run(Number(id), title.trim(), maxOrder + 1)

  const item = db.prepare('SELECT * FROM subtask_items WHERE id = ?').get(result.lastInsertRowid)
  return NextResponse.json(item, { status: 201 })
}
