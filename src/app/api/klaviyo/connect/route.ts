import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { testKlaviyoConnection, getKlaviyoConfig } from '@/lib/klaviyo'

export async function GET() {
  const db = await getDb()
  const config = await getKlaviyoConfig(db)
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
    const db = await getDb()
    await db.execute({sql: `
      INSERT INTO klaviyo_config (id, api_key, account_name)
      VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET api_key = excluded.api_key, account_name = excluded.account_name
    `, args: [api_key.trim(), account.name]})
    return NextResponse.json({ ok: true, account_name: account.name })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}

export async function DELETE() {
  const db = await getDb()
  await db.execute({sql: `DELETE FROM klaviyo_config WHERE id = 1`, args: []})
  return NextResponse.json({ ok: true })
}
