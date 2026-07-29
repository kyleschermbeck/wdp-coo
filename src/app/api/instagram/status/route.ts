import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface IgConfig {
  access_token: string
  ig_user_id: string
  username: string | null
  connected_at: string
  last_validated_at: string | null
}

async function refreshToken(token: string): Promise<string | null> {
  // Re-exchange via Facebook OAuth to get a fresh 60-day token.
  // The old graph.instagram.com/refresh_access_token endpoint (Instagram Basic Display API)
  // was removed Sep 2025; fb_exchange_token works on both short-lived and long-lived FB tokens.
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (!appId || !appSecret) return null
  try {
    const res = await fetch(
      `https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${token}`
    )
    if (!res.ok) return null
    const data = await res.json() as { access_token?: string }
    return data.access_token ?? null
  } catch { return null }
}

export async function GET() {
  const db = getDb()

  // Ensure last_validated_at column exists (idempotent)
  try { db.exec(`ALTER TABLE instagram_config ADD COLUMN last_validated_at TEXT`) } catch {}

  const config = db.prepare(
    'SELECT access_token, ig_user_id, username, connected_at, last_validated_at FROM instagram_config WHERE id = 1'
  ).get() as IgConfig | undefined

  if (!config) return NextResponse.json({ connected: false })

  // Only validate against the API once every 12 hours to avoid latency on every page load
  const now = Date.now()
  const lastValidated = config.last_validated_at ? new Date(config.last_validated_at + ' UTC').getTime() : 0
  const hoursSinceValidation = (now - lastValidated) / (1000 * 60 * 60)

  if (hoursSinceValidation > 12) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v22.0/${config.ig_user_id}?fields=id&access_token=${config.access_token}`
      )

      if (!res.ok) {
        // Token appears expired — try to refresh before giving up (fb_exchange_token
        // sometimes works on recently-expired tokens and will always work on valid ones)
        const recovered = await refreshToken(config.access_token)
        if (recovered) {
          db.prepare(
            "UPDATE instagram_config SET access_token = ?, connected_at = datetime('now'), last_validated_at = datetime('now') WHERE id = 1"
          ).run(recovered)
          return NextResponse.json({ connected: true, username: config.username, ig_user_id: config.ig_user_id })
        }
        db.prepare("UPDATE instagram_config SET last_validated_at = datetime('now') WHERE id = 1").run()
        return NextResponse.json({ connected: false, reason: 'token_expired', ig_user_id: config.ig_user_id, username: config.username })
      }

      // Token valid — refresh proactively if older than 7 days so it never gets close to the 60-day expiry
      const connectedAt = new Date(config.connected_at + ' UTC')
      const daysSinceConnect = (now - connectedAt.getTime()) / (1000 * 60 * 60 * 24)

      let currentToken = config.access_token
      if (daysSinceConnect > 7) {
        const newToken = await refreshToken(config.access_token)
        if (newToken) {
          currentToken = newToken
          db.prepare(
            "UPDATE instagram_config SET access_token = ?, connected_at = datetime('now'), last_validated_at = datetime('now') WHERE id = 1"
          ).run(newToken)
        }
      } else {
        db.prepare(
          "UPDATE instagram_config SET last_validated_at = datetime('now') WHERE id = 1"
        ).run()
      }

      return NextResponse.json({
        connected: true,
        username: config.username,
        ig_user_id: config.ig_user_id,
        connected_at: config.connected_at,
        token_preview: currentToken.slice(-6),
      })
    } catch {
      // Network error during validation — assume still connected, retry next time
    }
  }

  return NextResponse.json({
    connected: true,
    username: config.username,
    ig_user_id: config.ig_user_id,
    connected_at: config.connected_at,
  })
}

export async function DELETE() {
  const db = getDb()
  db.prepare('DELETE FROM instagram_config WHERE id = 1').run()
  return NextResponse.json({ ok: true })
}
