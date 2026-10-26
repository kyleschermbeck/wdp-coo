import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// POST /api/meta-ads/sync — fetch campaign insights from Facebook Graph API and cache locally
export async function POST() {
  const db = getDb()

  const config = db.prepare('SELECT * FROM meta_ads_config LIMIT 1').get() as
    | { access_token: string; ad_account_id: string; account_name: string } | undefined

  if (!config?.access_token || !config?.ad_account_id) {
    return NextResponse.json({ error: 'Meta Ads not configured' }, { status: 400 })
  }

  const { access_token, ad_account_id } = config

  try {
    // Fetch campaigns with insights (last 30 days)
    const dateStop  = new Date().toISOString().slice(0, 10)
    const dateStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const campaignsUrl = `https://graph.facebook.com/v19.0/${ad_account_id}/campaigns` +
      `?fields=id,name,status,effective_status,configured_status,objective,stop_time,start_time,insights.date_preset(last_30d){spend,impressions,clicks,reach,cpc,cpm,ctr}` +
      `&filtering=${encodeURIComponent(JSON.stringify([{ field: 'effective_status', operator: 'NOT_IN', value: ['DELETED'] }]))}` +
      `&access_token=${access_token}&limit=100`

    const res = await fetch(campaignsUrl, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: `Facebook API error: ${err}` }, { status: 502 })
    }

    const json = await res.json() as {
      data: Array<{
        id: string; name: string; status: string; effective_status?: string; configured_status?: string
        objective?: string; stop_time?: string; start_time?: string
        insights?: { data: Array<{ spend: string; impressions: string; clicks: string; reach: string; cpc?: string; cpm?: string; ctr?: string }> }
      }>
    }

    // Add new columns if they don't exist yet
    for (const col of ['effective_status TEXT', 'stop_time TEXT']) {
      try { db.prepare(`ALTER TABLE meta_ads_campaigns ADD COLUMN ${col}`).run() } catch { /* exists */ }
    }

    const upsert = db.prepare(`
      INSERT INTO meta_ads_campaigns (id, name, status, effective_status, objective, spend, impressions, clicks, reach, cpc, cpm, ctr, date_start, date_stop, stop_time, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, status=excluded.status, effective_status=excluded.effective_status,
        objective=excluded.objective,
        spend=excluded.spend, impressions=excluded.impressions, clicks=excluded.clicks,
        reach=excluded.reach, cpc=excluded.cpc, cpm=excluded.cpm, ctr=excluded.ctr,
        date_start=excluded.date_start, date_stop=excluded.date_stop,
        stop_time=excluded.stop_time, synced_at=excluded.synced_at
    `)

    const now = Date.now()
    let synced = 0
    db.transaction(() => {
      for (const c of json.data ?? []) {
        const ins = c.insights?.data?.[0]

        // Facebook API bug: campaigns with a stop_time in the past still show ACTIVE.
        // Override to COMPLETED when the scheduled end date has passed.
        let resolvedStatus = c.effective_status ?? c.status
        if (c.stop_time && new Date(c.stop_time).getTime() < now && resolvedStatus === 'ACTIVE') {
          resolvedStatus = 'COMPLETED'
        }

        upsert.run(
          c.id, c.name, c.status, resolvedStatus, c.objective ?? null,
          ins ? parseFloat(ins.spend) : 0,
          ins ? parseInt(ins.impressions) : 0,
          ins ? parseInt(ins.clicks) : 0,
          ins ? parseInt(ins.reach) : 0,
          ins?.cpc ? parseFloat(ins.cpc) : null,
          ins?.cpm ? parseFloat(ins.cpm) : null,
          ins?.ctr ? parseFloat(ins.ctr) : null,
          dateStart, dateStop,
          c.stop_time ?? null,
        )
        synced++
      }
    })()

    return NextResponse.json({ synced, date_start: dateStart, date_stop: dateStop })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// GET /api/meta-ads/sync — return cached campaigns
export async function GET() {
  const db = getDb()

  const config = db.prepare('SELECT account_name, ad_account_id, connected_at FROM meta_ads_config LIMIT 1').get() as
    | { account_name: string; ad_account_id: string; connected_at: string } | undefined

  const campaigns = db.prepare(`
    SELECT id, name, status, objective, spend, impressions, clicks, reach, cpc, cpm, ctr, date_start, date_stop, synced_at
    FROM meta_ads_campaigns ORDER BY spend DESC
  `).all()

  const totalSpend   = (campaigns as Array<{ spend: number }>).reduce((s, c) => s + (c.spend ?? 0), 0)
  const totalClicks  = (campaigns as Array<{ clicks: number }>).reduce((s, c) => s + (c.clicks ?? 0), 0)
  const activeCount  = (campaigns as Array<{ status: string }>).filter(c => c.status === 'ACTIVE').length

  return NextResponse.json({
    connected: !!config,
    account_name: config?.account_name ?? null,
    campaigns,
    summary: { totalSpend, totalClicks, activeCount, campaignCount: campaigns.length },
  })
}
