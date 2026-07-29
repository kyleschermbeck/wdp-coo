import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function POST(request: Request) {
  const { access_token, ig_user_id } = await request.json()
  if (!access_token || !ig_user_id) {
    return NextResponse.json({ error: 'access_token and ig_user_id are required' }, { status: 400 })
  }

  // Verify credentials by fetching the account info
  const res = await fetch(
    `https://graph.facebook.com/v19.0/${ig_user_id}?fields=username,name,followers_count&access_token=${access_token}`
  )
  if (!res.ok) {
    const err = await res.json() as { error?: { message?: string } }
    return NextResponse.json({ error: err.error?.message ?? 'Invalid credentials' }, { status: 400 })
  }
  const account = await res.json() as { username?: string; name?: string }

  // Exchange for a long-lived Facebook User Token (60 days) using the FB Graph API.
  // Note: the old graph.instagram.com/access_token endpoint (Instagram Basic Display API)
  // was deprecated Dec 2024 and removed Sep 2025 — we now use the FB OAuth exchange.
  let finalToken = access_token
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (appId && appSecret) {
    try {
      const exchangeRes = await fetch(
        `https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${access_token}`
      )
      if (exchangeRes.ok) {
        const exchangeData = await exchangeRes.json() as { access_token?: string }
        if (exchangeData.access_token) finalToken = exchangeData.access_token
      }
    } catch { /* fall through with original token */ }
  }

  const db = getDb()
  db.prepare(`
    INSERT INTO instagram_config (id, access_token, ig_user_id, username, connected_at)
    VALUES (1, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      access_token = excluded.access_token,
      ig_user_id = excluded.ig_user_id,
      username = excluded.username,
      connected_at = excluded.connected_at
  `).run(finalToken, ig_user_id, account.username ?? null)

  return NextResponse.json({ ok: true, username: account.username, long_lived: finalToken !== access_token })
}
