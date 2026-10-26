import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb()
  const { id } = await params
  const doc = db.prepare('SELECT * FROM planning_docs WHERE id = ?').get(Number(id))
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ doc })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb()
  const { id } = await params
  const { title, body, category, project_id } = await req.json() as {
    title?: string; body?: string; category?: string; project_id?: number | null
  }
  const updates: string[] = []
  const values: unknown[] = []
  if (title !== undefined) { updates.push('title = ?'); values.push(title) }
  if (body !== undefined)  { updates.push('body = ?');  values.push(body)  }
  if (category !== undefined) { updates.push('category = ?'); values.push(category) }
  if (project_id !== undefined) { updates.push('project_id = ?'); values.push(project_id ?? null) }
  if (updates.length === 0) return NextResponse.json({ ok: true })
  updates.push("updated_at = datetime('now')")
  values.push(Number(id))
  db.prepare(`UPDATE planning_docs SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  const doc = db.prepare('SELECT * FROM planning_docs WHERE id = ?').get(Number(id))
  return NextResponse.json({ doc })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb()
  const { id } = await params
  db.prepare('DELETE FROM planning_docs WHERE id = ?').run(Number(id))
  return NextResponse.json({ ok: true })
}
