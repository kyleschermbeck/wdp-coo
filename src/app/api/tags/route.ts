import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const db = await getDb()
    const tags = (await db.execute({sql: 'SELECT * FROM tags ORDER BY name ASC', args: []})).rows
    return NextResponse.json(tags)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = await getDb()
    const { name, color } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

    const result = await db.execute({sql: 'INSERT INTO tags (name, color) VALUES (?, ?)', args: [name.trim(), color || 'sage']})

    const tag = (await db.execute({sql: 'SELECT * FROM tags WHERE id = ?', args: [Number(result.lastInsertRowid)]})).rows[0]
    return NextResponse.json(tag, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
