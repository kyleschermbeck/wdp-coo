import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = getDb()
  const docs = db.prepare(`
    SELECT id, title, category, created_at, updated_at,
           substr(body, 1, 120) as excerpt
    FROM planning_docs
    ORDER BY updated_at DESC
  `).all()
  return NextResponse.json({ docs })
}

export async function POST(req: NextRequest) {
  const db = getDb()
  const { title, body, category } = await req.json() as {
    title?: string; body?: string; category?: string
  }
  const result = db.prepare(`
    INSERT INTO planning_docs (title, body, category, created_at, updated_at)
    VALUES (?, ?, ?, datetime('now'), datetime('now'))
  `).run(title ?? 'Untitled', body ?? '', category ?? 'planning')
  const doc = db.prepare('SELECT * FROM planning_docs WHERE id = ?').get(result.lastInsertRowid)
  return NextResponse.json({ doc })
}
