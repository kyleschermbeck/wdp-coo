import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

const BASE = 'https://graph.facebook.com/v19.0'

interface MetaConfig {
  access_token: string
  ad_account_id: string
  account_name: string | null
  connected_at: string
  last_validated_at: string | null
  app_id: string | null
  app_secret: string | null
}

/**
 * Try to exchange the current token for a fresh long-lived one (60 days).
 * Falls back to META_APP_ID / META_APP_SECRET env vars if DB values are null —
 * same pattern as instagram/status so both channels stay connected identically.
 */
async function refreshToken(token: string, appId: string | null, appSecret: string | null): Promise<string | null> {
  const id     = appId     ?? process.env.META_APP_ID     ?? null
  const secret = appSecret ?? process.env.META_APP_SECRET ?? null
  if (!id || !secret) return null
  try {
    const url = `${BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${id}&client_secret=${secret}&fb_exchange_token=${token}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json() as { access_token?: string; expires_in?: number }
    if (!data.access_token) return null
    return data.access_token
  } catch { return null }
}

export async function GET() {
  const db = getDb()

  // Ensure last_validated_at column exists (idempotent — same pattern as instagram_config)
  try { db.exec(`ALTER TABLE meta_ads_config ADD COLUMN last_validated_at TEXT`) } catch {}

  const config = db.prepare(
    'SELECT access_token, ad_account_id, account_name, connected_at, last_validated_at, app_id, app_secret FROM meta_ads_config WHERE id = 1'
  ).get() as MetaConfig | undefined

  if (!config) return NextResponse.json({ connected: false })

  // Only validate against the API once every 12 hours to avoid latency on every page load
  const now = Date.now()
  const lastValidated = config.last_validated_at ? new Date(config.last_validated_at + ' UTC').getTime() : 0
  const hoursSinceValidation = (now - lastValidated) / (1000 * 60 * 60)

  if (hoursSinceValidation > 12) {
    try {
      const res = await fetch(`${BASE}/me?fields=id&access_token=${config.access_token}`)

      if (!res.ok) {
        // Token appears expired — try to refresh before giving up
        const recovered = await refreshToken(config.access_token, config.app_id, config.app_secret)
        if (recovered) {
          const expiry = Date.now() + 60 * 24 * 3600_000 // ~60 days
          db.prepare(
            "UPDATE meta_ads_config SET access_token = ?, token_expiry = ?, connected_at = datetime('now'), last_validated_at = datetime('now') WHERE id = 1"
          ).run(recovered, expiry)
          return NextResponse.json({ connected: true, account_name: config.account_name, ad_account_id: config.ad_account_id })
        }
        // Could not refresh — mark as disconnected
        db.prepare("UPDATE meta_ads_config SET last_validated_at = datetime('now') WHERE id = 1").run()
        return NextResponse.json({ connected: false, reason: 'token_expired', account_name: config.account_name })
      }

      // Token valid — refresh proactively if connected more than 7 days ago so it never expires
      const connectedAt = new Date(config.connected_at + ' UTC')
      const daysSinceConnect = (now - connectedAt.getTime()) / (1000 * 60 * 60 * 24)

      if (daysSinceConnect > 7) {
        const newToken = await refreshToken(config.access_token, config.app_id, config.app_secret)
        if (newToken) {
          const expiry = Date.now() + 60 * 24 * 3600_000
          db.prepare(
            "UPDATE meta_ads_config SET access_token = ?, token_expiry = ?, connected_at = datetime('now'), last_validated_at = datetime('now') WHERE id = 1"
          ).run(newToken, expiry)
        } else {
          db.prepare("UPDATE meta_ads_config SET last_validated_at = datetime('now') WHERE id = 1").run()
        }
      } else {
        db.prepare("UPDATE meta_ads_config SET last_validated_at = datetime('now') WHERE id = 1").run()
      }

      return NextResponse.json({
        connected: true,
        account_name: config.account_name,
        ad_account_id: config.ad_account_id,
        connected_at: config.connected_at,
      })
    } catch {
      // Network error during validation — assume still connected, retry next time
    }
  }

  return NextResponse.json({
    connected: true,
    account_name: config.account_name,
    ad_account_id: config.ad_account_id,
    connected_at: config.connected_at,
  })
}

export async function DELETE() {
  const db = getDb()
  db.prepare('DELETE FROM meta_ads_config WHERE id = 1').run()
  return NextResponse.json({ ok: true })
}
