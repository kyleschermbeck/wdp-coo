import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = getDb()
  const row = db.prepare(
    'SELECT property_id, measurement_id, property_name, refresh_token FROM google_analytics_config WHERE id = 1'
  ).get() as {
    property_id: string | null
    measurement_id: string | null
    property_name: string | null
    refresh_token: string | null
  } | undefined

  if (!row) return NextResponse.json({ connected: false })

  // Connected = we have a refresh token (access_token alone can expire)
  return NextResponse.json({
    connected: !!row.refresh_token,
    property_id: row.property_id,
    measurement_id: row.measurement_id,
    property_name: row.property_name,
    // has_credentials = true when client creds are stored but OAuth not yet completed
    has_credentials: true,
  })
}
