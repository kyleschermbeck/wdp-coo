import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = await getDb()
  const rows = (await db.execute({sql: 'SELECT key, value FROM settings_kv', args: []})).rows as unknown as { key: string; value: string }[]
  const settings: Record<string, string> = {}
  for (const row of rows) settings[row.key] = row.value
  return NextResponse.json(settings)
}

export async function PUT(req: NextRequest) {
  const db = await getDb()
  const body = await req.json() as Record<string, string>
  const sql = `INSERT INTO settings_kv (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  for (const [k, v] of Object.entries(body)) {
    await db.execute({ sql, args: [k, v] })
  }
  return NextResponse.json({ ok: true })
}
