import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb()
    const { id } = await params
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(project)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb()
    const { id } = await params
    const body = await req.json()
    const { name, description, status, color, due_date } = body

    db.prepare(`
      UPDATE projects
      SET name = ?, description = ?, status = ?, color = ?, due_date = ?
      WHERE id = ?
    `).run(
      name?.trim(),
      description?.trim() || null,
      status,
      color,
      due_date || null,
      id
    )

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
    return NextResponse.json(project)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb()
    const { id } = await params
    db.prepare('DELETE FROM projects WHERE id = ?').run(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
