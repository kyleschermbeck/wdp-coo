import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb()
    const { id } = await params
    const { tag_id } = await req.json()
    db.prepare('INSERT OR IGNORE INTO subtask_tags (subtask_id, tag_id) VALUES (?, ?)').run(id, tag_id)
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
    db.prepare('DELETE FROM subtask_tags WHERE subtask_id = ? AND tag_id = ?').run(id, tag_id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
