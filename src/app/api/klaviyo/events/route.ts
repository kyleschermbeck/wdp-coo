import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getKlaviyoConfig } from '@/lib/klaviyo'

const REV = '2024-10-15'

function kHeaders(apiKey: string) {
  return { 'Authorization': `Klaviyo-API-Key ${apiKey}`, 'revision': REV }
}

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email')
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const db = getDb()
  const config = getKlaviyoConfig(db)
  if (!config) return NextResponse.json({ error: 'Klaviyo not configured' }, { status: 400 })

  const headers = kHeaders(config.api_key)

  // Look up the Klaviyo profile ID by email
  const profileRes = await fetch(
    `https://a.klaviyo.com/api/profiles/?filter=equals(email,"${encodeURIComponent(email)}")&fields[profile]=id`,
    { headers }
  )
  if (!profileRes.ok) return NextResponse.json({ events: [] })
  const profileData = await profileRes.json() as { data: Array<{ id: string }> }
  const profileId = profileData.data?.[0]?.id
  if (!profileId) return NextResponse.json({ events: [] })

  // Fetch recent events for this profile
  const eventsRes = await fetch(
    `https://a.klaviyo.com/api/events/?filter=equals(profile_id,"${profileId}")&sort=-datetime&page[size]=30&include=metric&fields[event]=datetime,event_properties&fields[metric]=name`,
    { headers }
  )
  if (!eventsRes.ok) return NextResponse.json({ events: [] })
  const eventsData = await eventsRes.json() as {
    data: Array<{
      id: string
      attributes: { datetime: string; event_properties: Record<string, unknown> }
      relationships: { metric: { data: { id: string } } }
    }>
    included?: Array<{ id: string; attributes: { name: string } }>
  }

  // Build metric id → name lookup
  const metricNames: Record<string, string> = {}
  for (const inc of eventsData.included ?? []) {
    metricNames[inc.id] = inc.attributes.name
  }

  const events = (eventsData.data ?? []).map(e => ({
    id: e.id,
    datetime: e.attributes.datetime,
    metric: metricNames[e.relationships?.metric?.data?.id] ?? 'Event',
    properties: e.attributes.event_properties ?? {},
  }))

  return NextResponse.json({ events })
}
