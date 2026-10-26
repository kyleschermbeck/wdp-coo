import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface MetaConfig {
  access_token: string
  ad_account_id: string
  account_name: string | null
  app_id: string | null
  app_secret: string | null
  token_expiry: number | null
}

const BASE = 'https://graph.facebook.com/v19.0'
const ACCOUNT_METRICS  = 'spend,reach,impressions,clicks,ctr,cpm,cpc,frequency,actions,action_values'
const CAMPAIGN_METRICS = 'spend,reach,impressions,clicks,ctr,frequency,actions,action_values'
const AD_METRICS       = 'ad_id,ad_name,campaign_name,spend,reach,impressions,clicks,ctr,frequency,actions,action_values'

async function getConfig(): Promise<MetaConfig | null> {
  const db = await getDb()
  return (await db.execute({sql: 'SELECT access_token, ad_account_id, account_name, app_id, app_secret, token_expiry FROM meta_ads_config WHERE id = 1', args: []})).rows[0] as unknown as MetaConfig | null
}

// Try to refresh an expired token using app credentials; returns new token or null.
// Falls back to META_APP_ID / META_APP_SECRET env vars if DB values are null.
async function tryRefreshToken(config: MetaConfig): Promise<string | null> {
  const appId     = config.app_id     ?? process.env.META_APP_ID     ?? null
  const appSecret = config.app_secret ?? process.env.META_APP_SECRET ?? null
  if (!appId || !appSecret) return null
  try {
    const url = `${BASE}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${config.access_token}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json() as { access_token?: string; expires_in?: number }
    if (!data.access_token) return null
    const expiry = data.expires_in ? Date.now() + data.expires_in * 1000 : null
    const db = await getDb()
    await db.execute({sql: 'UPDATE meta_ads_config SET access_token = ?, token_expiry = ? WHERE id = 1', args: [data.access_token, expiry]})
    return data.access_token
  } catch {
    return null
  }
}

function since(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function sumActions(actions: Array<{ action_type: string; value: string }> | undefined, type: string): number {
  return actions?.filter(a => a.action_type === type).reduce((s, a) => s + parseFloat(a.value), 0) ?? 0
}

export async function GET(request: Request) {
  const config = await getConfig()
  if (!config) return NextResponse.json({ error: 'Meta Ads not connected' }, { status: 400 })

  // Check token expiry — try to refresh if app credentials exist, otherwise surface error
  let { access_token } = config
  if (config.token_expiry && Date.now() > config.token_expiry - 60_000) {
    const refreshed = await tryRefreshToken(config)
    if (refreshed) {
      access_token = refreshed
    } else {
      return NextResponse.json({
        error: 'Access token expired',
        token_expired: true,
        message: config.app_id
          ? 'Token refresh failed — please reconnect your Meta Ads account.'
          : 'Your Meta Ads token has expired (short-lived tokens last ~2 hours). Reconnect and provide your App ID + App Secret to get a 60-day token.',
      }, { status: 401 })
    }
  }

  const { ad_account_id } = config
  const { searchParams } = new URL(request.url)
  const days = parseInt(searchParams.get('days') ?? '30', 10)

  const timeRange = JSON.stringify({ since: since(days), until: since(0) })
  const params = `access_token=${access_token}&time_range=${encodeURIComponent(timeRange)}`

  // Fire all five requests in parallel
  const [summaryRes, campaignsRes, trendRes, adsRes, creativesRes] = await Promise.all([
    fetch(`${BASE}/${ad_account_id}/insights?fields=${ACCOUNT_METRICS}&${params}`),
    fetch(`${BASE}/${ad_account_id}/campaigns?fields=id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,insights.time_range(${encodeURIComponent(timeRange)}){${CAMPAIGN_METRICS}}&filtering=[{"field":"effective_status","operator":"NOT_IN","value":["DELETED"]}]&limit=100&${params}`),
    fetch(`${BASE}/${ad_account_id}/insights?fields=spend,reach,impressions&time_increment=1&${params}`),
    fetch(`${BASE}/${ad_account_id}/insights?fields=${AD_METRICS}&level=ad&limit=30&${params}`),
    fetch(`${BASE}/${ad_account_id}/ads?fields=id,name,creative{thumbnail_url,image_url}&limit=50&access_token=${access_token}`),
  ])

  // 1. Account-level summary
  if (!summaryRes.ok) {
    const err = await summaryRes.json() as { error?: { message?: string } }
    return NextResponse.json({ error: err.error?.message ?? 'Failed to fetch insights' }, { status: 502 })
  }
  const summaryData = await summaryRes.json() as {
    data?: Array<{
      spend?: string; reach?: string; impressions?: string; clicks?: string
      ctr?: string; cpm?: string; cpc?: string; frequency?: string
      actions?: Array<{ action_type: string; value: string }>
      action_values?: Array<{ action_type: string; value: string }>
    }>
  }
  const s = summaryData.data?.[0]
  const purchases       = sumActions(s?.actions, 'purchase')
  const purchaseValue   = sumActions(s?.action_values, 'purchase')
  const addToCarts      = sumActions(s?.actions, 'add_to_cart')
  const checkouts       = sumActions(s?.actions, 'initiate_checkout')
  const spend           = parseFloat(s?.spend ?? '0')
  const summary = {
    spend,
    reach:          parseInt(s?.reach ?? '0', 10),
    impressions:    parseInt(s?.impressions ?? '0', 10),
    clicks:         parseInt(s?.clicks ?? '0', 10),
    ctr:            parseFloat(s?.ctr ?? '0'),
    cpm:            parseFloat(s?.cpm ?? '0'),
    cpc:            parseFloat(s?.cpc ?? '0'),
    frequency:      parseFloat(s?.frequency ?? '0'),
    purchases,
    purchase_value: purchaseValue,
    add_to_carts:   addToCarts,
    checkouts,
    roas:           spend > 0 ? purchaseValue / spend : 0,
    cost_per_purchase: purchases > 0 ? spend / purchases : 0,
  }

  // 2. Active campaigns with full funnel
  type InsightRow = {
    spend?: string; reach?: string; impressions?: string; clicks?: string
    ctr?: string; frequency?: string
    actions?: Array<{ action_type: string; value: string }>
    action_values?: Array<{ action_type: string; value: string }>
  }
  let campaigns: Array<{
    id: string; name: string; status: string; objective?: string
    daily_budget: number | null; lifetime_budget: number | null
    start_time: string | null; stop_time: string | null
    spend: number; reach: number; impressions: number; clicks: number
    ctr: number; frequency: number; purchases: number; purchase_value: number
    add_to_carts: number; checkouts: number; roas: number; cost_per_purchase: number
  }> = []

  if (campaignsRes.ok) {
    const campaignsData = await campaignsRes.json() as {
      data?: Array<{
        id: string; name: string; status: string; effective_status?: string; objective?: string
        daily_budget?: string; lifetime_budget?: string
        start_time?: string; stop_time?: string
        insights?: { data?: InsightRow[] }
      }>
    }
    const now = Date.now()
    campaigns = (campaignsData.data ?? []).map(c => {
      const i = c.insights?.data?.[0]
      const cSpend         = parseFloat(i?.spend ?? '0')
      const cPurchases     = sumActions(i?.actions, 'purchase')
      const cPurchaseValue = sumActions(i?.action_values, 'purchase')
      // Prefer effective_status (what Facebook actually considers the status) over configured status.
      // Also catch the Facebook API bug where campaigns with a past stop_time still report ACTIVE.
      let resolvedStatus = c.effective_status ?? c.status
      if (c.stop_time && new Date(c.stop_time).getTime() < now && resolvedStatus === 'ACTIVE') {
        resolvedStatus = 'COMPLETED'
      }
      return {
        id: c.id, name: c.name, status: resolvedStatus, objective: c.objective,
        // budgets come back in cents from the API
        daily_budget:      c.daily_budget    ? parseFloat(c.daily_budget) / 100    : null,
        lifetime_budget:   c.lifetime_budget ? parseFloat(c.lifetime_budget) / 100 : null,
        start_time:        c.start_time ?? null,
        stop_time:         c.stop_time ?? null,
        spend:             cSpend,
        reach:             parseInt(i?.reach ?? '0', 10),
        impressions:       parseInt(i?.impressions ?? '0', 10),
        clicks:            parseInt(i?.clicks ?? '0', 10),
        ctr:               parseFloat(i?.ctr ?? '0'),
        frequency:         parseFloat(i?.frequency ?? '0'),
        purchases:         cPurchases,
        purchase_value:    cPurchaseValue,
        add_to_carts:      sumActions(i?.actions, 'add_to_cart'),
        checkouts:         sumActions(i?.actions, 'initiate_checkout'),
        roas:              cSpend > 0 ? cPurchaseValue / cSpend : 0,
        cost_per_purchase: cPurchases > 0 ? cSpend / cPurchases : 0,
      }
    }).sort((a, b) => b.spend - a.spend)
  }

  // 3. Daily spend trend
  let trend: Array<{ date: string; spend: number; reach: number; impressions: number }> = []
  if (trendRes.ok) {
    const trendData = await trendRes.json() as {
      data?: Array<{ date_start: string; spend?: string; reach?: string; impressions?: string }>
    }
    trend = (trendData.data ?? []).map(d => ({
      date: d.date_start,
      spend: parseFloat(d.spend ?? '0'),
      reach: parseInt(d.reach ?? '0', 10),
      impressions: parseInt(d.impressions ?? '0', 10),
    }))
  }

  // 4. Ad-level breakdown
  // Build ad_id -> thumbnail_url map from creatives fetch
  const thumbnailMap: Record<string, string> = {}
  if (creativesRes.ok) {
    const creativesData = await creativesRes.json() as {
      data?: Array<{ id: string; creative?: { thumbnail_url?: string; image_url?: string } }>
    }
    for (const ad of creativesData.data ?? []) {
      const url = ad.creative?.thumbnail_url ?? ad.creative?.image_url
      if (url) thumbnailMap[ad.id] = url
    }
  }

  let ads: Array<{
    ad_id: string; ad_name: string; campaign_name: string; thumbnail_url?: string
    spend: number; reach: number; impressions: number; clicks: number
    ctr: number; frequency: number; purchases: number; purchase_value: number
    add_to_carts: number; checkouts: number; roas: number; cost_per_purchase: number
  }> = []
  if (adsRes.ok) {
    const adsData = await adsRes.json() as {
      data?: Array<InsightRow & {
        ad_id?: string; ad_name?: string; campaign_name?: string
      }>
    }
    ads = (adsData.data ?? []).map(a => {
      const aSpend         = parseFloat(a.spend ?? '0')
      const aPurchases     = sumActions(a.actions, 'purchase')
      const aPurchaseValue = sumActions(a.action_values, 'purchase')
      const adId           = a.ad_id ?? ''
      return {
        ad_id:             adId,
        ad_name:           a.ad_name ?? 'Unknown Ad',
        campaign_name:     a.campaign_name ?? '',
        thumbnail_url:     thumbnailMap[adId],
        spend:             aSpend,
        reach:             parseInt(a.reach ?? '0', 10),
        impressions:       parseInt(a.impressions ?? '0', 10),
        clicks:            parseInt(a.clicks ?? '0', 10),
        ctr:               parseFloat(a.ctr ?? '0'),
        frequency:         parseFloat(a.frequency ?? '0'),
        purchases:         aPurchases,
        purchase_value:    aPurchaseValue,
        add_to_carts:      sumActions(a.actions, 'add_to_cart'),
        checkouts:         sumActions(a.actions, 'initiate_checkout'),
        roas:              aSpend > 0 ? aPurchaseValue / aSpend : 0,
        cost_per_purchase: aPurchases > 0 ? aSpend / aPurchases : 0,
      }
    }).filter(a => a.spend > 0 || a.impressions > 0).sort((a, b) => b.spend - a.spend)
  }

  return NextResponse.json({ summary, campaigns, ads, trend, account_name: config.account_name, days })
}
