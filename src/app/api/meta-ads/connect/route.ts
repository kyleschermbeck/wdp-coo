import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function POST(request: Request) {
  const { access_token, ad_account_id } = await request.json() as {
    access_token?: string; ad_account_id?: string
  }
  if (!access_token || !ad_account_id) {
    return NextResponse.json({ error: 'access_token and ad_account_id are required' }, { status: 400 })
  }

  // Normalise account ID — accept both "123456" and "act_123456"
  const accountId = ad_account_id.startsWith('act_') ? ad_account_id : `act_${ad_account_id}`

  // Verify by fetching basic account info
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${accountId}?fields=name,currency,account_status&access_token=${access_token}`
  )
  if (!res.ok) {
    const err = await res.json() as { error?: { message?: string } }
    return NextResponse.json({ error: err.error?.message ?? 'Invalid credentials or account ID' }, { status: 400 })
  }
  const account = await res.json() as { name?: string; currency?: string; account_status?: number }

  if (account.account_status === 2) {
    return NextResponse.json({ error: 'Ad account is disabled' }, { status: 400 })
  }

  const db = getDb()
  db.prepare(`
    INSERT INTO meta_ads_config (id, access_token, ad_account_id, account_name, connected_at)
    VALUES (1, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      access_token = excluded.access_token,
      ad_account_id = excluded.ad_account_id,
      account_name = excluded.account_name,
      connected_at = excluded.connected_at
  `).run(access_token, accountId, account.name ?? null)

  return NextResponse.json({ ok: true, account_name: account.name, currency: account.currency })
}
