import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = await getDb()
  const docs = (await db.execute({sql: `
    SELECT id, title, category, created_at, updated_at,
           substr(body, 1, 120) as excerpt
    FROM planning_docs
    ORDER BY updated_at DESC
  `, args: []})).rows
  return NextResponse.json({ docs })
}

export async function POST(req: NextRequest) {
  const db = await getDb()
  const { title, body, category } = await req.json() as {
    title?: string; body?: string; category?: string
  }
  const result = await db.execute({sql: `
    INSERT INTO planning_docs (title, body, category, created_at, updated_at)
    VALUES (?, ?, ?, datetime('now'), datetime('now'))
  `, args: [title ?? 'Untitled', body ?? '', category ?? 'planning']})
  const doc = (await db.execute({sql: 'SELECT * FROM planning_docs WHERE id = ?', args: [Number(result.lastInsertRowid)]})).rows[0]
  return NextResponse.json({ doc })
}
