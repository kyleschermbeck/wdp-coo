import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function GET(_: NextRequest, { params }: Params) {
  const { id } = await params
  const db = getDb()
  const rows = db.prepare(
    'SELECT * FROM task_attachments WHERE task_id = ? ORDER BY created_at DESC'
  ).all(id)
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const { title, content_type, content } = await req.json()
  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: 'title and content required' }, { status: 400 })
  }
  const db = getDb()
  const result = db.prepare(
    'INSERT INTO task_attachments (task_id, title, content_type, content) VALUES (?, ?, ?, ?)'
  ).run(id, title.trim(), content_type || 'text', content)
  const row = db.prepare('SELECT * FROM task_attachments WHERE id = ?').get(result.lastInsertRowid)
  return NextResponse.json(row, { status: 201 })
}
