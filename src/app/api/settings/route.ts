import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = getDb()
  const rows = db.prepare('SELECT key, value FROM settings_kv').all() as { key: string; value: string }[]
  const settings: Record<string, string> = {}
  for (const row of rows) settings[row.key] = row.value
  return NextResponse.json(settings)
}

export async function PUT(req: NextRequest) {
  const db = getDb()
  const body = await req.json() as Record<string, string>
  const upsert = db.prepare(`
    INSERT INTO settings_kv (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `)
  const upsertMany = db.transaction((entries: [string, string][]) => {
    for (const [k, v] of entries) upsert.run(k, v)
  })
  upsertMany(Object.entries(body))
  return NextResponse.json({ ok: true })
}
