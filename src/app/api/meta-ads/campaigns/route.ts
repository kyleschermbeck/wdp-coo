import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// GET /api/meta-ads/campaigns — return cached Meta Ads campaign data
export async function GET() {
  const db = await getDb()

  const config = (await db.execute({sql: 'SELECT account_name, ad_account_id FROM meta_ads_config LIMIT 1', args: []})).rows[0] as
    unknown as | { account_name: string; ad_account_id: string } | undefined

  const campaigns = (await db.execute({sql: `
    SELECT id, name, status, effective_status, objective, spend, impressions, clicks, reach, cpc, cpm, ctr, date_start, date_stop, stop_time, synced_at
    FROM meta_ads_campaigns ORDER BY spend DESC
  `, args: []})).rows as unknown as Array<{
    id: string; name: string; status: string; effective_status: string | null; objective: string | null
    spend: number; impressions: number; clicks: number; reach: number
    cpc: number | null; cpm: number | null; ctr: number | null
    date_start: string; date_stop: string; stop_time: string | null; synced_at: string
  }>

  // Apply the same stop_time resolution as the sync/analytics routes:
  // if a campaign has a past stop_time but still shows ACTIVE in the DB cache, resolve it to COMPLETED.
  const now = Date.now()
  const resolved = campaigns.map(c => {
    let effectiveStatus = c.effective_status ?? c.status
    if (c.stop_time && new Date(c.stop_time).getTime() < now && effectiveStatus === 'ACTIVE') {
      effectiveStatus = 'COMPLETED'
    }
    return { ...c, effective_status: effectiveStatus }
  })

  const totalSpend  = resolved.reduce((s, c) => s + (c.spend ?? 0), 0)
  const totalClicks = resolved.reduce((s, c) => s + (c.clicks ?? 0), 0)
  const activeCount = resolved.filter(c => c.effective_status === 'ACTIVE').length
  const syncedAt    = resolved[0]?.synced_at ?? null

  return NextResponse.json({
    connected: !!config,
    account_name: config?.account_name ?? null,
    campaigns: resolved,
    summary: { totalSpend, totalClicks, activeCount, campaignCount: resolved.length },
    synced_at: syncedAt,
  })
}
