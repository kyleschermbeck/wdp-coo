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

type BreakdownResult = { dimension_values: string[]; value: number }
type InsightBreakdown = {
  data?: Array<{
    name: string
    total_value?: { breakdowns?: Array<{ dimension_keys: string[]; results: BreakdownResult[] }> }
    values?: Array<{ value: number }>
  }>
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mediaId = searchParams.get('id')
  if (!mediaId) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const db = getDb()
  const config = db.prepare('SELECT access_token FROM instagram_config WHERE id = 1').get() as
    | { access_token: string } | undefined
  if (!config) return NextResponse.json({ error: 'Not connected' }, { status: 400 })

  const token = config.access_token

  // 1. Base metrics (always available)
  const media = await igGet<{
    id: string; media_type: string; media_url?: string; thumbnail_url?: string
    caption?: string; timestamp: string; like_count?: number; comments_count?: number
    permalink?: string; is_shared_to_feed?: boolean
  }>(mediaId, {
    fields: 'id,media_type,media_url,thumbnail_url,caption,timestamp,like_count,comments_count,permalink,is_shared_to_feed',
  }, token)

  if (!media) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

  const isReel = media.media_type === 'VIDEO'
  const isCarousel = media.media_type === 'CAROUSEL_ALBUM'

  // 2. Core insights — fetch individually so one deprecated/invalid metric (e.g.
  // impressions in v22+) can't zero out everything. Use 'views' as impressions replacement.
  type SimpleInsight = { data?: Array<{ name: string; values?: Array<{ value: number }> }> }
  const POST_METRICS = isReel
    ? ['reach', 'views', 'saved', 'plays', 'likes', 'comments', 'shares', 'total_interactions', 'follows', 'profile_visits']
    : ['reach', 'views', 'saved', 'likes', 'comments', 'shares', 'total_interactions', 'follows', 'profile_visits']

  const metricResults = await Promise.all(
    POST_METRICS.map(metric => igGet<SimpleInsight>(`${mediaId}/insights`, { metric }, token))
  )

  const metrics: Record<string, number> = {}
  for (let i = 0; i < POST_METRICS.length; i++) {
    const val = metricResults[i]?.data?.[0]?.values?.[0]?.value
    if (val !== undefined) metrics[POST_METRICS[i]] = val
  }

  // insightsAvailable: true only if we got at least reach (edge exists)
  const insightsAvailable = metricResults[0] !== null

  // 3–6. Breakdowns — only fetch if core insights are available
  let followBreakdown: { type: string; value: number }[] = []
  let ageGenderBreakdown: { label: string; value: number }[] = []
  let cityBreakdown: { name: string; value: number }[] = []
  let countryBreakdown: { name: string; value: number }[] = []

  if (insightsAvailable) {
    const [followTypeData, ageGenderData, cityData, countryData] = await Promise.all([
      igGet<InsightBreakdown>(`${mediaId}/insights`, { metric: 'reach', breakdown: 'follow_type', metric_type: 'total_value' }, token),
      igGet<InsightBreakdown>(`${mediaId}/insights`, { metric: 'reach', breakdown: 'age,gender', metric_type: 'total_value' }, token),
      igGet<InsightBreakdown>(`${mediaId}/insights`, { metric: 'reach', breakdown: 'city', metric_type: 'total_value' }, token),
      igGet<InsightBreakdown>(`${mediaId}/insights`, { metric: 'reach', breakdown: 'country', metric_type: 'total_value' }, token),
    ])

    followBreakdown = (followTypeData?.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [])
      .map(r => ({ type: r.dimension_values[0] ?? 'Unknown', value: r.value }))
      .sort((a, b) => b.value - a.value)

    ageGenderBreakdown = (ageGenderData?.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [])
      .map(r => {
        const [age, g] = r.dimension_values
        const gender = g === 'F' ? 'Women' : g === 'M' ? 'Men' : 'Other'
        return { label: `${gender} ${age ?? ''}`.trim(), value: r.value }
      })
      .sort((a, b) => b.value - a.value)

    cityBreakdown = (cityData?.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [])
      .map(r => ({ name: r.dimension_values[0] ?? 'Unknown', value: r.value }))
      .sort((a, b) => b.value - a.value).slice(0, 8)

    countryBreakdown = (countryData?.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [])
      .map(r => ({ name: r.dimension_values[0] ?? 'Unknown', value: r.value }))
      .sort((a, b) => b.value - a.value).slice(0, 8)
  }

  return NextResponse.json({
    media: { ...media, isReel, isCarousel },
    insightsAvailable,
    metrics,
    followBreakdown,
    ageGenderBreakdown,
    cityBreakdown,
    countryBreakdown,
  })
}
