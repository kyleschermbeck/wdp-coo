import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

const REDIRECT_URI = 'http://localhost:3000/api/google-analytics/callback'
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'

// POST — store credentials and return the OAuth authorization URL
export async function POST(request: Request) {
  const { client_id, client_secret, property_id, measurement_id } = await request.json() as {
    client_id: string; client_secret: string
    property_id?: string; measurement_id?: string
  }

  if (!client_id || !client_secret) {
    return NextResponse.json({ error: 'client_id and client_secret are required' }, { status: 400 })
  }

  // Persist the credentials (no tokens yet — those arrive via callback)
  const db = getDb()
  db.prepare('DELETE FROM google_analytics_config WHERE id = 1').run()
  db.prepare(
    `INSERT INTO google_analytics_config (id, client_id, client_secret, property_id, measurement_id)
     VALUES (1, ?, ?, ?, ?)`
  ).run(client_id.trim(), client_secret.trim(), property_id?.trim() ?? null, measurement_id?.trim() ?? null)

  // Build the Google OAuth2 authorization URL
  const params = new URLSearchParams({
    client_id:     client_id.trim(),
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    scope:         SCOPE,
    access_type:   'offline',   // request a refresh_token
    prompt:        'consent',   // force consent screen so refresh_token is always issued
  })
  const auth_url = `https://accounts.google.com/o/oauth2/auth?${params}`

  return NextResponse.json({ auth_url })
}

// DELETE — disconnect
export async function DELETE() {
  const db = getDb()
  db.prepare('DELETE FROM google_analytics_config WHERE id = 1').run()
  return NextResponse.json({ success: true })
}
