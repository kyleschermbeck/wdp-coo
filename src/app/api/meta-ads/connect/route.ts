import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

const BASE = 'https://graph.facebook.com/v19.0'

// Attempt to exchange a short-lived user token for a long-lived one (60 days).
// Requires app_id + app_secret; returns the original token unchanged on failure.
async function exchangeForLongLived(
  token: string,
  appId: string,
  appSecret: string,
): Promise<{ token: string; expiry: number | null }> {
  try {
    const url = `${BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${token}`
    const res = await fetch(url)
    if (!res.ok) return { token, expiry: null }
    const data = await res.json() as { access_token?: string; expires_in?: number; error?: unknown }
    if (!data.access_token) return { token, expiry: null }
    const expiry = data.expires_in ? Date.now() + data.expires_in * 1000 : null
    return { token: data.access_token, expiry }
  } catch {
    return { token, expiry: null }
  }
}

export async function POST(request: Request) {
  const body = await request.json() as {
    access_token?: string
    ad_account_id?: string
    app_id?: string
    app_secret?: string
  }
  const { access_token, ad_account_id, app_id, app_secret } = body

  if (!access_token || !ad_account_id) {
    return NextResponse.json({ error: 'access_token and ad_account_id are required' }, { status: 400 })
  }

  // Normalise account ID — accept both "123456" and "act_123456"
  const accountId = ad_account_id.startsWith('act_') ? ad_account_id : `act_${ad_account_id}`

  // Verify by fetching basic account info
  const res = await fetch(
    `${BASE}/${accountId}?fields=name,currency,account_status&access_token=${access_token}`
  )
  if (!res.ok) {
    const err = await res.json() as { error?: { message?: string } }
    return NextResponse.json({ error: err.error?.message ?? 'Invalid credentials or account ID' }, { status: 400 })
  }
  const account = await res.json() as { name?: string; currency?: string; account_status?: number }

  if (account.account_status === 2) {
    return NextResponse.json({ error: 'Ad account is disabled' }, { status: 400 })
  }

  // Use provided app credentials, or fall back to env vars
  const resolvedAppId     = app_id     || process.env.META_APP_ID     || undefined
  const resolvedAppSecret = app_secret || process.env.META_APP_SECRET || undefined

  // Try to exchange for a long-lived token if app credentials were supplied
  let finalToken = access_token
  let tokenExpiry: number | null = null
  let exchanged = false

  if (resolvedAppId && resolvedAppSecret) {
    const result = await exchangeForLongLived(access_token, resolvedAppId, resolvedAppSecret)
    if (result.token !== access_token) {
      finalToken = result.token
      tokenExpiry = result.expiry
      exchanged = true
    }
  }

  const db = getDb()
  db.prepare(`
    INSERT INTO meta_ads_config (id, access_token, ad_account_id, account_name, app_id, app_secret, token_expiry, connected_at)
    VALUES (1, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      access_token = excluded.access_token,
      ad_account_id = excluded.ad_account_id,
      account_name = excluded.account_name,
      app_id = excluded.app_id,
      app_secret = excluded.app_secret,
      token_expiry = excluded.token_expiry,
      connected_at = excluded.connected_at
  `).run(finalToken, accountId, account.name ?? null, resolvedAppId ?? null, resolvedAppSecret ?? null, tokenExpiry)

  return NextResponse.json({
    ok: true,
    account_name: account.name,
    currency: account.currency,
    token_exchanged: exchanged,
    token_expiry: tokenExpiry,
  })
}
