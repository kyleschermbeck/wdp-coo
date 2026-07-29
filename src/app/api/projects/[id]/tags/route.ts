import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb()
    const { id } = await params
    const tags = db.prepare(`
      SELECT t.* FROM tags t
      JOIN project_tags pt ON pt.tag_id = t.id
      WHERE pt.project_id = ?
      ORDER BY t.name ASC
    `).all(id)
    return NextResponse.json(tags)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb()
    const { id } = await params
    const { tag_id } = await req.json()
    db.prepare('INSERT OR IGNORE INTO project_tags (project_id, tag_id) VALUES (?, ?)').run(id, tag_id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb()
    const { id } = await params
    const { tag_id } = await req.json()
    db.prepare('DELETE FROM project_tags WHERE project_id = ? AND tag_id = ?').run(id, tag_id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
