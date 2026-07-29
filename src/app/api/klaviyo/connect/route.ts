import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { testKlaviyoConnection, getKlaviyoConfig } from '@/lib/klaviyo'

export async function GET() {
  const db = getDb()
  const config = getKlaviyoConfig(db)
  if (!config?.api_key) return NextResponse.json({ connected: false })
  return NextResponse.json({
    connected: true,
    account_name: config.account_name,
    last_synced_at: config.last_synced_at,
  })
}

export async function POST(req: NextRequest) {
  const { api_key } = await req.json() as { api_key: string }
  if (!api_key?.trim()) return NextResponse.json({ error: 'API key required' }, { status: 400 })

  try {
    const account = await testKlaviyoConnection(api_key.trim())
    const db = getDb()
    db.prepare(`
      INSERT INTO klaviyo_config (id, api_key, account_name)
      VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET api_key = excluded.api_key, account_name = excluded.account_name
    `).run(api_key.trim(), account.name)
    return NextResponse.json({ ok: true, account_name: account.name })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}

export async function DELETE() {
  const db = getDb()
  db.prepare(`DELETE FROM klaviyo_config WHERE id = 1`).run()
  return NextResponse.json({ ok: true })
}
