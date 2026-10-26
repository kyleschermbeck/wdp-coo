import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface IgConfig { access_token: string; ig_user_id: string; username: string | null }

async function getConfig(): Promise<IgConfig | null> {
  const db = await getDb()
  return (await db.execute({sql: 'SELECT access_token, ig_user_id, username FROM instagram_config WHERE id = 1', args: []})).rows[0] as unknown as IgConfig | null
}

const BASE = `https://graph.facebook.com/v22.0`

async function igGet<T>(path: string, params: Record<string, string>, token: string): Promise<T | null> {
  try {
    const qs = new URLSearchParams({ ...params, access_token: token }).toString()
    const res = await fetch(`${BASE}/${path}?${qs}`)
    const json = await res.json()
    if (!res.ok || json?.error) return null
    return json as T
  } catch { return null }
}

// New-style follower_demographics response
interface DemographicsResponse {
  data?: Array<{
    name: string
    total_value?: {
      breakdowns?: Array<{
        dimension_keys: string[]
        results: Array<{ dimension_values: string[]; value: number }>
      }>
    }
    values?: Array<{ value: Record<string, number> }>
  }>
}

export async function GET() {
  const config = await getConfig()
  if (!config) return NextResponse.json({ error: 'Instagram not connected' }, { status: 400 })

  const { access_token: token, ig_user_id } = config

  // ── 1. Profile ──────────────────────────────────────────────────────────────
  const profile = await igGet<{
    username?: string; name?: string; biography?: string
    followers_count?: number; follows_count?: number; media_count?: number
    profile_picture_url?: string
  }>(ig_user_id, {
    fields: 'username,name,biography,followers_count,follows_count,media_count,profile_picture_url'
  }, token)

  if (!profile) return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 502 })

  // ── 2. Account metrics (last 30 days) ────────────────────────────────────────
  // total_over_range is incompatible with reach, views, profile_views in this API version.
  // Use period=day + sum for all of them.
  const since = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000)
  const until = Math.floor(Date.now() / 1000)

  type DayResponse = { data?: Array<{ name: string; values: Array<{ value: number }> }> }

  // All period-based metrics use period=day + sum; total_over_range is incompatible
  // with reach, views, and profile_views in this API version.
  const multiMetricResp = await igGet<DayResponse>(`${ig_user_id}/insights`, {
    metric: 'reach,views,profile_views,website_clicks',
    period: 'day',
    since: String(since),
    until: String(until),
  }, token)

  function sumMetric(name: string): number {
    return multiMetricResp?.data?.find(d => d.name === name)
      ?.values?.reduce((s, v) => s + (v.value ?? 0), 0) ?? 0
  }

  const accountInsights = {
    reach30d: sumMetric('reach'),
    impressions30d: sumMetric('views'),
    profileViews30d: sumMetric('profile_views'),
    websiteClicks30d: sumMetric('website_clicks'),
  }

  // ── 3. Demographics — new API (follower_demographics + breakdown) ────────────
  // Fetch city, country, and age/gender as separate requests
  const [cityData, countryData, ageGenderData] = await Promise.all([
    igGet<DemographicsResponse>(`${ig_user_id}/insights`, {
      metric: 'follower_demographics',
      period: 'lifetime',
      metric_type: 'total_value',
      breakdown: 'city',
    }, token),
    igGet<DemographicsResponse>(`${ig_user_id}/insights`, {
      metric: 'follower_demographics',
      period: 'lifetime',
      metric_type: 'total_value',
      breakdown: 'country',
    }, token),
    igGet<DemographicsResponse>(`${ig_user_id}/insights`, {
      metric: 'follower_demographics',
      period: 'lifetime',
      metric_type: 'total_value',
      breakdown: 'age,gender',
    }, token),
  ])

  function extractBreakdown(data: DemographicsResponse | null): Array<{ key: string; value: number }> {
    const results = data?.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? []
    return results.map(r => ({ key: r.dimension_values.join(' '), value: r.value }))
  }

  const topCities = extractBreakdown(cityData)
    .sort((a, b) => b.value - a.value).slice(0, 10)
    .map(r => ({ name: r.key, value: r.value }))

  const topCountries = extractBreakdown(countryData)
    .sort((a, b) => b.value - a.value).slice(0, 8)
    .map(r => ({ name: r.key, value: r.value }))

  // age/gender keys come as "18-24 F", "25-34 M" etc with breakdown=age,gender
  const ageGenderRaw = extractBreakdown(ageGenderData)
  const genderAge = ageGenderRaw
    .sort((a, b) => b.value - a.value)
    .map(r => {
      const parts = r.key.split(' ')
      const age = parts[0] ?? 'Unknown'
      const g = parts[1] ?? 'U'
      return {
        gender: g === 'F' ? 'Women' : g === 'M' ? 'Men' : 'Other',
        age,
        value: r.value,
      }
    })

  // ── 4. Online followers by hour (best times to post) ────────────────────────
  // Use a 7-day window — lifetime with no range defaults to only ~2 days
  let bestHours: { hour: number; count: number }[] = []
  const onlineSince = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000)
  const onlineUntil = Math.floor(Date.now() / 1000)
  const onlineData = await igGet<{
    data?: Array<{ name: string; values: Array<{ value: Record<string, number> }> }>
  }>(`${ig_user_id}/insights`, {
    metric: 'online_followers',
    period: 'lifetime',
    since: String(onlineSince),
    until: String(onlineUntil),
  }, token)

  if (onlineData?.data?.[0]?.values) {
    const hourTotals: Record<string, number> = {}
    for (const v of onlineData.data[0].values) {
      if (typeof v.value !== 'object') continue
      for (const [hour, count] of Object.entries(v.value)) {
        hourTotals[hour] = (hourTotals[hour] ?? 0) + count
      }
    }
    bestHours = Object.entries(hourTotals)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([hour, count]) => ({ hour: parseInt(hour), count }))
  }

  // ── 5. Recent media (all posts, paginated up to 200) ────────────────────────
  type MediaItem = {
    id: string; media_type: string; media_url?: string; thumbnail_url?: string
    caption?: string; timestamp: string; like_count?: number; comments_count?: number; permalink?: string
  }
  type MediaPage = { data?: MediaItem[]; paging?: { next?: string } }

  const allMediaItems: MediaItem[] = []
  let mediaUrl: string | null = `${BASE}/${ig_user_id}/media?fields=id,media_type,media_url,thumbnail_url,caption,timestamp,like_count,comments_count,permalink&limit=100&access_token=${token}`

  while (mediaUrl && allMediaItems.length < 200) {
    try {
      const res = await fetch(mediaUrl)
      const page = await res.json() as MediaPage
      if (!res.ok || page?.data == null) break
      allMediaItems.push(...page.data)
      mediaUrl = page.paging?.next ?? null
    } catch { break }
  }

  const rawMedia = allMediaItems.filter(m => m.media_type !== 'STORY')

  const media = await Promise.all(rawMedia.map(async m => {
    // Carousel albums don't return media_url — fetch first child's image instead
    let media_url = m.media_url
    if (m.media_type === 'CAROUSEL_ALBUM') {
      const childData = await igGet<{ data?: Array<{ id: string; media_url?: string; media_type: string }> }>(
        `${m.id}/children`, { fields: 'id,media_url,media_type', limit: '1' }, token
      )
      media_url = childData?.data?.[0]?.media_url ?? undefined
    }

    try {
      const metric = m.media_type === 'VIDEO' ? 'reach,impressions,saved,plays' : 'reach,impressions,saved'
      const iData = await igGet<{ data?: Array<{ name: string; values: Array<{ value: number }> }> }>(
        `${m.id}/insights`, { metric }, token
      )
      const ins: Record<string, number> = {}
      for (const item of iData?.data ?? []) ins[item.name] = item.values?.[0]?.value ?? 0
      return { ...m, media_url, insights: { reach: ins.reach, impressions: ins.impressions, saved: ins.saved, plays: ins.plays } }
    } catch { return { ...m, media_url } }
  }))

  // ── 6. Stories ───────────────────────────────────────────────────────────────
  const storiesData = await igGet<{ data?: Array<{ id: string; media_url?: string; timestamp: string }> }>(
    `${ig_user_id}/stories`, { fields: 'id,media_url,timestamp' }, token
  )

  const stories = await Promise.all((storiesData?.data ?? []).map(async s => {
    try {
      const iData = await igGet<{ data?: Array<{ name: string; values: Array<{ value: number }> }> }>(
        `${s.id}/insights`, { metric: 'reach,impressions,replies' }, token
      )
      const ins: Record<string, number> = {}
      for (const item of iData?.data ?? []) ins[item.name] = item.values?.[0]?.value ?? 0
      return { ...s, insights: { reach: ins.reach, impressions: ins.impressions, replies: ins.replies } }
    } catch { return s }
  }))

  return NextResponse.json({
    profile,
    accountInsights,
    demographics: { genderAge, topCities, topCountries, bestHours },
    media,
    stories,
  })
}
