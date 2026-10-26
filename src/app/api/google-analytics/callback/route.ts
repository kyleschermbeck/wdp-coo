import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

const REDIRECT_URI = 'http://localhost:3000/api/google-analytics/callback'

interface GAConfig {
  client_id: string
  client_secret: string
  property_id: string | null
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code  = searchParams.get('code')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(
      `http://localhost:3000/marketing?ga_error=${encodeURIComponent(error)}`
    )
  }
  if (!code) {
    return NextResponse.redirect('http://localhost:3000/marketing?ga_error=no_code')
  }

  // Load stored credentials
  const db = await getDb()
  const config = (await db.execute({sql: 'SELECT client_id, client_secret, property_id FROM google_analytics_config WHERE id = 1', args: []})).rows[0] as unknown as GAConfig | undefined

  if (!config) {
    return NextResponse.redirect('http://localhost:3000/marketing?ga_error=no_config')
  }

  // Exchange the authorization code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     config.client_id,
      client_secret: config.client_secret,
      redirect_uri:  REDIRECT_URI,
      grant_type:    'authorization_code',
    }),
  })
  const tokens = await tokenRes.json() as TokenResponse

  if (tokens.error || !tokens.access_token) {
    const msg = tokens.error_description ?? tokens.error ?? 'token_exchange_failed'
    return NextResponse.redirect(
      `http://localhost:3000/marketing?ga_error=${encodeURIComponent(msg)}`
    )
  }

  const expiry = tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null

  await db.execute({sql: `UPDATE google_analytics_config
     SET access_token = ?, refresh_token = COALESCE(?, refresh_token), token_expiry = ?
     WHERE id = 1`, args: [tokens.access_token, tokens.refresh_token ?? null, expiry]})

  // Try to fetch the property name for display
  if (config.property_id) {
    try {
      const adminRes = await fetch(
        `https://analyticsadmin.googleapis.com/v1beta/properties/${config.property_id}`,
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      )
      if (adminRes.ok) {
        const prop = await adminRes.json() as { displayName?: string }
        if (prop.displayName) {
          await db.execute({sql: 'UPDATE google_analytics_config SET property_name = ? WHERE id = 1', args: [prop.displayName]})
        }
      }
    } catch { /* non-fatal */ }
  }

  return NextResponse.redirect('http://localhost:3000/marketing?ga_connected=1')
}
