import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// Temporary debug route — hit GET /api/instagram/debug to see raw API responses
// Optional: add ?post_id={mediaId} to test post-level breakdown endpoints
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const postId = searchParams.get('post_id')

  const db = getDb()
  const config = db.prepare('SELECT access_token, ig_user_id FROM instagram_config WHERE id = 1').get() as
    | { access_token: string; ig_user_id: string } | undefined
  if (!config) return NextResponse.json({ error: 'Not connected' }, { status: 400 })

  const { access_token: token, ig_user_id } = config
  const base = `https://graph.facebook.com/v22.0`
  const since30 = Math.floor((Date.now()-30*86400000)/1000)
  const until = Math.floor(Date.now()/1000)

  // If a post_id is provided, test post-level breakdowns instead
  if (postId) {
    const postTests = [
      { name: 'core_insights_reel', url: `${base}/${postId}/insights?metric=reach,impressions,saved,plays,likes,comments,shares,total_interactions&access_token=${token}` },
      { name: 'breakdown_follow_type', url: `${base}/${postId}/insights?metric=reach&breakdown=follow_type&metric_type=total_value&access_token=${token}` },
      { name: 'breakdown_age_gender', url: `${base}/${postId}/insights?metric=reach&breakdown=age,gender&metric_type=total_value&access_token=${token}` },
      { name: 'breakdown_city', url: `${base}/${postId}/insights?metric=reach&breakdown=city&metric_type=total_value&access_token=${token}` },
      { name: 'breakdown_country', url: `${base}/${postId}/insights?metric=reach&breakdown=country&metric_type=total_value&access_token=${token}` },
    ]
    const postResults: Record<string, unknown> = {}
    for (const t of postTests) {
      try {
        const res = await fetch(t.url)
        postResults[t.name] = { status: res.status, body: await res.json() }
      } catch (e) {
        postResults[t.name] = { error: String(e) }
      }
    }
    return NextResponse.json(postResults)
  }

  // Fetch first story ID to test story insights
  let firstStoryId: string | null = null
  try {
    const storiesRes = await fetch(`${base}/${ig_user_id}/stories?fields=id&access_token=${token}`)
    const storiesJson = await storiesRes.json()
    firstStoryId = storiesJson?.data?.[0]?.id ?? null
  } catch { /* ignore */ }

  const tests: { name: string; url: string }[] = [
    { name: 'token_permissions', url: `${base}/me/permissions?access_token=${token}` },
    { name: 'profile', url: `${base}/${ig_user_id}?fields=username,followers_count,media_count&access_token=${token}` },
    { name: 'reach_30d', url: `${base}/${ig_user_id}/insights?metric=reach&period=day&since=${since30}&until=${until}&access_token=${token}` },
    { name: 'views_30d', url: `${base}/${ig_user_id}/insights?metric=views&period=total_over_range&metric_type=total_value&since=${since30}&until=${until}&access_token=${token}` },
    { name: 'profile_views_30d', url: `${base}/${ig_user_id}/insights?metric=profile_views&period=total_over_range&metric_type=total_value&since=${since30}&until=${until}&access_token=${token}` },
    { name: 'demographics_city', url: `${base}/${ig_user_id}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=city&access_token=${token}` },
    { name: 'demographics_age_gender', url: `${base}/${ig_user_id}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=age,gender&access_token=${token}` },
    { name: 'demographics_country', url: `${base}/${ig_user_id}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=country&access_token=${token}` },
    ...(firstStoryId ? [
      { name: 'story_id', url: `${base}/${firstStoryId}?fields=id,media_type,timestamp&access_token=${token}` },
      { name: 'story_insights_core', url: `${base}/${firstStoryId}/insights?metric=reach,replies,navigation,profile_visits,follows&access_token=${token}` },
      { name: 'story_shares', url: `${base}/${firstStoryId}/insights?metric=shares&access_token=${token}` },
      { name: 'story_nav_action_breakdown', url: `${base}/${firstStoryId}/insights?metric=navigation&breakdown=action_type&metric_type=total_value&access_token=${token}` },
      { name: 'story_insights_likes', url: `${base}/${firstStoryId}/insights?metric=likes&access_token=${token}` },
    ] : [{ name: 'story_id', url: `${base}/${ig_user_id}/stories?fields=id&access_token=${token}` }]),
  ]

  const results: Record<string, unknown> = {}
  for (const t of tests) {
    try {
      const res = await fetch(t.url)
      results[t.name] = { status: res.status, body: await res.json() }
    } catch (e) {
      results[t.name] = { error: String(e) }
    }
  }

  return NextResponse.json(results)
}
