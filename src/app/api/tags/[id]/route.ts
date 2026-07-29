import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb()
    const { id } = await params
    const { name, color } = await req.json()
    db.prepare('UPDATE tags SET name = ?, color = ? WHERE id = ?').run(name?.trim(), color, id)
    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(id)
    return NextResponse.json(tag)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb()
    const { id } = await params
    db.prepare('DELETE FROM tags WHERE id = ?').run(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
