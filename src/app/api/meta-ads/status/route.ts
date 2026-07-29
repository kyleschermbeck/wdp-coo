import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = getDb()
  const config = db.prepare(
    'SELECT ad_account_id, account_name, connected_at FROM meta_ads_config WHERE id = 1'
  ).get() as { ad_account_id: string; account_name: string | null; connected_at: string } | undefined
  if (!config) return NextResponse.json({ connected: false })
  return NextResponse.json({ connected: true, ...config })
}

export async function DELETE() {
  const db = getDb()
  db.prepare('DELETE FROM meta_ads_config WHERE id = 1').run()
  return NextResponse.json({ ok: true })
}
