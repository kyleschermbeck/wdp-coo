import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getKlaviyoConfig } from '@/lib/klaviyo'

/**
 * GET /api/klaviyo/campaigns/[id]/engagement
 *
 * Returns { engagement: Record<profileId, { opened, clicked, converted }> }
 *
 * Strategy: fetch Opened/Clicked Email events in a ±7d window around the
 * campaign send_time, then filter client-side by event_properties.$message
 * matching the campaign ID (Klaviyo stores the campaign ID there for campaigns,
 * unlike flows which use a shorter content ID).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = await getDb()
  const config = await getKlaviyoConfig(db)
  if (!config) return NextResponse.json({ error: 'Klaviyo not configured' }, { status: 400 })

  const HEADERS = {
    'Authorization': `Klaviyo-API-Key ${config.api_key}`,
    'revision': '2024-10-15',
  }

  // Look up metric IDs and campaign send_time from DB
  const metricRows = (await db.execute({sql: `SELECT metric_name, klaviyo_metric_id FROM klaviyo_metrics WHERE klaviyo_metric_id IS NOT NULL`, args: []})).rows as unknown as { metric_name: string; klaviyo_metric_id: string }[]
  const metricIdMap: Record<string, string> = {}
  for (const r of metricRows) metricIdMap[r.metric_name] = r.klaviyo_metric_id

  const campaign = (await db.execute({sql: `SELECT send_time FROM klaviyo_campaigns WHERE klaviyo_id = ?`, args: [id]})).rows[0] as unknown as { send_time: string } | undefined

  // Build datetime window: 1 day before send to 7 days after
  let startDate: string
  let endDate: string
  if (campaign?.send_time) {
    const send = new Date(campaign.send_time)
    startDate = new Date(send.getTime() - 1 * 24 * 3600_000).toISOString().slice(0, 19)
    endDate   = new Date(send.getTime() + 7 * 24 * 3600_000).toISOString().slice(0, 19)
  } else {
    // Fallback: last 90 days
    const now = new Date()
    startDate = new Date(now.getTime() - 90 * 24 * 3600_000).toISOString().slice(0, 19)
    endDate   = now.toISOString().slice(0, 19)
  }

  const engagement: Record<string, { opened: boolean; clicked: boolean; converted: boolean }> = {}

  const fetchEngagementEvents = async (metricName: string, engKey: 'opened' | 'clicked' | 'converted') => {
    const metricId = metricIdMap[metricName]
    if (!metricId) return

    let cursor: string | null = null
    let page = 0

    do {
      const url = new URL('https://a.klaviyo.com/api/events/')
      url.searchParams.set(
        'filter',
        `equals(metric_id,"${metricId}"),greater-or-equal(datetime,${startDate}),less-than(datetime,${endDate})`
      )
      url.searchParams.set('fields[event]', 'id,event_properties')
      url.searchParams.set('page[size]', '100')
      if (cursor) url.searchParams.set('page[cursor]', cursor)

      const res = await fetch(url.toString(), { headers: HEADERS })
      if (!res.ok) break

      const data = await res.json() as {
        data: Array<{
          id: string
          attributes?: { event_properties?: Record<string, unknown> }
          relationships?: { profile?: { data?: { id: string } } }
        }>
        links?: { next?: string | null }
      }

      for (const event of data.data ?? []) {
        // Filter client-side: only count events where $message matches campaign ID
        const msgProp = event.attributes?.event_properties?.['$message']
        if (msgProp !== id) continue

        const profileId = event.relationships?.profile?.data?.id
        if (!profileId) continue

        if (!engagement[profileId]) {
          engagement[profileId] = { opened: false, clicked: false, converted: false }
        }
        engagement[profileId][engKey] = true
      }

      const nextLink = data.links?.next
      if (nextLink) {
        cursor = new URL(nextLink).searchParams.get('page[cursor]')
      } else {
        cursor = null
      }
      page++
    } while (cursor && page < 10)
  }

  await Promise.all([
    fetchEngagementEvents('Opened Email',  'opened'),
    fetchEngagementEvents('Clicked Email', 'clicked'),
    fetchEngagementEvents('Placed Order',  'converted'),
  ])

  return NextResponse.json({ engagement })
}
