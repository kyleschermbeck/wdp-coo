import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const db = getDb()
    const tags = db.prepare('SELECT * FROM tags ORDER BY name ASC').all()
    return NextResponse.json(tags)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb()
    const { name, color } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

    const result = db.prepare(
      'INSERT INTO tags (name, color) VALUES (?, ?)'
    ).run(name.trim(), color || 'sage')

    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid)
    return NextResponse.json(tag, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
