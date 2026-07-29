import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = getDb()
  const rows = db.prepare('SELECT section, content FROM marketing_strategy').all() as { section: string; content: string }[]
  const result: Record<string, string> = {}
  for (const row of rows) {
    result[row.section] = row.content
  }
  return NextResponse.json(result)
}

export async function PUT(request: Request) {
  const db = getDb()
  const { section, content } = await request.json()
  db.prepare(`
    INSERT INTO marketing_strategy (section, content, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(section) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
  `).run(section, content)
  return NextResponse.json({ ok: true })
}
