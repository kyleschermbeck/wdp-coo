import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getKlaviyoConfig, createKlaviyoCampaign } from '@/lib/klaviyo'

export async function GET() {
  const db = await getDb()
  const campaigns = (await db.execute({sql: `SELECT * FROM klaviyo_campaigns ORDER BY send_time DESC NULLS LAST`, args: []})).rows
  return NextResponse.json(campaigns)
}

export async function POST(req: NextRequest) {
  const db = await getDb()
  const config = await getKlaviyoConfig(db)
  if (!config?.api_key) return NextResponse.json({ error: 'Klaviyo not connected' }, { status: 400 })
  const body = await req.json() as { name: string; channel: 'email' | 'sms'; list_id: string; subject?: string; from_name?: string; from_email?: string; body?: string }
  if (!body.name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  if (!body.list_id) return NextResponse.json({ error: 'Audience list required' }, { status: 400 })
  try {
    const result = await createKlaviyoCampaign(config.api_key, body)
    // Save to local cache
    await db.execute({sql: `INSERT OR IGNORE INTO klaviyo_campaigns (klaviyo_id, name, status, subject, from_email) VALUES (?, ?, 'draft', ?, ?)`, args: [result.campaign_id, body.name, body.subject ?? null, body.from_email ?? null]})
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
