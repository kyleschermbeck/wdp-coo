import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  const { id } = await params
  const items = (await db.execute({sql: 'SELECT * FROM subtask_items WHERE subtask_id = ? ORDER BY sort_order ASC, id ASC', args: [Number(id)]})).rows
  return NextResponse.json(items)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  const { id } = await params
  const { title } = await req.json()
  if (!title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 })

  const maxOrder = ((await db.execute({sql: 'SELECT COALESCE(MAX(sort_order), -1) as m FROM subtask_items WHERE subtask_id = ?', args: [Number(id)]})).rows[0] as unknown as { m: number }).m

  const result = await db.execute({sql: 'INSERT INTO subtask_items (subtask_id, title, sort_order) VALUES (?, ?, ?)', args: [Number(id), title.trim(), maxOrder + 1]})

  const item = (await db.execute({sql: 'SELECT * FROM subtask_items WHERE id = ?', args: [Number(result.lastInsertRowid)]})).rows[0]
  return NextResponse.json(item, { status: 201 })
}
