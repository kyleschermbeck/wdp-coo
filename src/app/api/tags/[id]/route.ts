import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb()
    const { id } = await params
    const { name, color } = await req.json()
    await db.execute({sql: 'UPDATE tags SET name = ?, color = ? WHERE id = ?', args: [name?.trim(), color, id]})
    const tag = (await db.execute({sql: 'SELECT * FROM tags WHERE id = ?', args: [id]})).rows[0]
    return NextResponse.json(tag)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb()
    const { id } = await params
    await db.execute({sql: 'DELETE FROM tags WHERE id = ?', args: [id]})
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
