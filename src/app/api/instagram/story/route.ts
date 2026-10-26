import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

const BASE = 'https://graph.facebook.com/v22.0'

async function igGet<T>(path: string, params: Record<string, string>, token: string): Promise<T | null> {
  try {
    const qs = new URLSearchParams({ ...params, access_token: token }).toString()
    const res = await fetch(`${BASE}/${path}?${qs}`)
    const json = await res.json()
    if (!res.ok || json?.error) return null
    return json as T
  } catch { return null }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const storyId = searchParams.get('id')
  if (!storyId) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const db = await getDb()
  const config = (await db.execute({sql: 'SELECT access_token FROM instagram_config WHERE id = 1', args: []})).rows[0] as
    unknown as | { access_token: string } | undefined
  if (!config) return NextResponse.json({ error: 'Not connected' }, { status: 400 })

  const token = config.access_token

  // 1. Story media details
  const media = await igGet<{
    id: string; media_type: string; media_url?: string; timestamp: string
  }>(storyId, {
    fields: 'id,media_type,media_url,timestamp',
  }, token)

  if (!media) return NextResponse.json({ error: 'Story not found' }, { status: 404 })

  // 2. Story insights — fetch each metric individually in parallel (graceful: null on failure).
  // Confirmed working (v22.0): reach, replies, navigation, profile_visits, follows
  // NOT supported for stories: likes, views, total_interactions, impressions
  // follow_type breakdown returns 400 "Incompatible breakdowns" for stories
  type InsightItem = { name: string; values?: Array<{ value: number }> }
  type InsightData = { data?: InsightItem[] }

  // shares is untested for stories — included here; igGet returns null on 400 so it's safe
  const STORY_METRICS = ['reach', 'replies', 'shares', 'navigation', 'profile_visits', 'follows']

  const metricResults = await Promise.all(
    STORY_METRICS.map(metric =>
      igGet<InsightData>(`${storyId}/insights`, { metric }, token)
    )
  )

  const metrics: Record<string, number> = {}
  for (let i = 0; i < STORY_METRICS.length; i++) {
    const name = STORY_METRICS[i]
    const val = metricResults[i]?.data?.[0]?.values?.[0]?.value
    if (val !== undefined) metrics[name] = val
  }

  const insightsAvailable = Object.keys(metrics).length > 0

  // Note: navigation action_type breakdown (forward/back/exit) returns 400 "Incompatible breakdowns"
  // for story media — Meta does not expose the breakdown via API, only the aggregate total.
  // Likes also unsupported for story media type. follow_type breakdown incompatible.
  // Shares confirmed working (200) but may be 0 when no one has shared.

  return NextResponse.json({ media, insightsAvailable, metrics, followBreakdown: [], navBreakdown: [] })
}
