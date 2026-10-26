import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getKlaviyoConfig } from '@/lib/klaviyo'

/**
 * GET /api/klaviyo/flows/[id]/engagement
 *
 * Returns { engagement: Record<profileId, { received, opened, clicked, converted }> }
 *
 * Strategy: fetch Received/Opened/Clicked Email events in the last 90 days,
 * then filter client-side by event_properties.$flow matching the flow ID.
 * Flows send continuously, so we use a rolling window rather than a fixed send_time.
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

  const metricRows = (await db.execute({sql: `SELECT metric_name, klaviyo_metric_id FROM klaviyo_metrics WHERE klaviyo_metric_id IS NOT NULL`, args: []})).rows as unknown as { metric_name: string; klaviyo_metric_id: string }[]
  const metricIdMap: Record<string, string> = {}
  for (const r of metricRows) metricIdMap[r.metric_name] = r.klaviyo_metric_id

  // Flows run continuously — look back 90 days
  const now = new Date()
  const startDate = new Date(now.getTime() - 90 * 24 * 3600_000).toISOString().slice(0, 19)
  const endDate   = now.toISOString().slice(0, 19)

  const engagement: Record<string, { received: boolean; opened: boolean; clicked: boolean; converted: boolean }> = {}

  const fetchEvents = async (metricName: string, engKey: 'received' | 'opened' | 'clicked' | 'converted') => {
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
        // Filter client-side: only events where $flow matches this flow's ID
        const flowProp = event.attributes?.event_properties?.['$flow']
        if (flowProp !== id) continue

        const profileId = event.relationships?.profile?.data?.id
        if (!profileId) continue

        if (!engagement[profileId]) {
          engagement[profileId] = { received: false, opened: false, clicked: false, converted: false }
        }
        engagement[profileId][engKey] = true
      }

      const nextLink = data.links?.next
      cursor = nextLink ? new URL(nextLink).searchParams.get('page[cursor]') : null
      page++
    } while (cursor && page < 10)
  }

  await Promise.all([
    fetchEvents('Received Email', 'received'),
    fetchEvents('Opened Email',   'opened'),
    fetchEvents('Clicked Email',  'clicked'),
    fetchEvents('Placed Order',   'converted'),
  ])

  return NextResponse.json({ engagement })
}
