import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = await getDb()
  const rows = (await db.execute({sql: 'SELECT section, content FROM marketing_strategy', args: []})).rows as unknown as { section: string; content: string }[]
  const result: Record<string, string> = {}
  for (const row of rows) {
    result[row.section] = row.content
  }
  return NextResponse.json(result)
}

export async function PUT(request: Request) {
  const db = await getDb()
  const { section, content } = await request.json()
  await db.execute({sql: `
    INSERT INTO marketing_strategy (section, content, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(section) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
  `, args: [section, content]})
  return NextResponse.json({ ok: true })
}
