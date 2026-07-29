import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface MetaConfig { access_token: string; ad_account_id: string; account_name: string | null }

const BASE = 'https://graph.facebook.com/v19.0'
const ACCOUNT_METRICS = 'spend,reach,impressions,clicks,ctr,cpm,cpc,actions,action_values'
const CAMPAIGN_METRICS = 'spend,reach,impressions,clicks,ctr,actions,action_values'

function getConfig(): MetaConfig | null {
  const db = getDb()
  return db.prepare(
    'SELECT access_token, ad_account_id, account_name FROM meta_ads_config WHERE id = 1'
  ).get() as MetaConfig | null
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
  const config = getConfig()
  if (!config) return NextResponse.json({ error: 'Meta Ads not connected' }, { status: 400 })

  const { access_token, ad_account_id } = config
  const { searchParams } = new URL(request.url)
  const days = parseInt(searchParams.get('days') ?? '30', 10)

  const timeRange = JSON.stringify({ since: since(days), until: since(0) })
  const params = `access_token=${access_token}&time_range=${encodeURIComponent(timeRange)}`

  // 1. Account-level summary
  const summaryRes = await fetch(
    `${BASE}/${ad_account_id}/insights?fields=${ACCOUNT_METRICS}&${params}`
  )
  if (!summaryRes.ok) {
    const err = await summaryRes.json() as { error?: { message?: string } }
    return NextResponse.json({ error: err.error?.message ?? 'Failed to fetch insights' }, { status: 502 })
  }
  const summaryData = await summaryRes.json() as {
    data?: Array<{
      spend?: string; reach?: string; impressions?: string; clicks?: string
      ctr?: string; cpm?: string; cpc?: string
      actions?: Array<{ action_type: string; value: string }>
      action_values?: Array<{ action_type: string; value: string }>
    }>
  }
  const s = summaryData.data?.[0]
  const purchases = sumActions(s?.actions, 'purchase')
  const purchaseValue = sumActions(s?.action_values, 'purchase')
  const spend = parseFloat(s?.spend ?? '0')
  const summary = {
    spend,
    reach: parseInt(s?.reach ?? '0', 10),
    impressions: parseInt(s?.impressions ?? '0', 10),
    clicks: parseInt(s?.clicks ?? '0', 10),
    ctr: parseFloat(s?.ctr ?? '0'),
    cpm: parseFloat(s?.cpm ?? '0'),
    cpc: parseFloat(s?.cpc ?? '0'),
    purchases,
    purchase_value: purchaseValue,
    roas: spend > 0 ? purchaseValue / spend : 0,
  }

  // 2. Active campaigns with insights
  const campaignsRes = await fetch(
    `${BASE}/${ad_account_id}/campaigns?fields=id,name,status,objective,insights{${CAMPAIGN_METRICS}}&filtering=[{"field":"effective_status","operator":"IN","value":["ACTIVE","PAUSED"]}]&limit=20&${params}`
  )
  let campaigns: Array<{
    id: string; name: string; status: string; objective?: string
    spend: number; reach: number; impressions: number; clicks: number; ctr: number
    purchases: number; purchase_value: number; roas: number
  }> = []

  if (campaignsRes.ok) {
    const campaignsData = await campaignsRes.json() as {
      data?: Array<{
        id: string; name: string; status: string; objective?: string
        insights?: { data?: Array<{
          spend?: string; reach?: string; impressions?: string; clicks?: string; ctr?: string
          actions?: Array<{ action_type: string; value: string }>
          action_values?: Array<{ action_type: string; value: string }>
        }> }
      }>
    }
    campaigns = (campaignsData.data ?? []).map(c => {
      const i = c.insights?.data?.[0]
      const cSpend = parseFloat(i?.spend ?? '0')
      const cPurchases = sumActions(i?.actions, 'purchase')
      const cPurchaseValue = sumActions(i?.action_values, 'purchase')
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        objective: c.objective,
        spend: cSpend,
        reach: parseInt(i?.reach ?? '0', 10),
        impressions: parseInt(i?.impressions ?? '0', 10),
        clicks: parseInt(i?.clicks ?? '0', 10),
        ctr: parseFloat(i?.ctr ?? '0'),
        purchases: cPurchases,
        purchase_value: cPurchaseValue,
        roas: cSpend > 0 ? cPurchaseValue / cSpend : 0,
      }
    }).sort((a, b) => b.spend - a.spend)
  }

  // 3. Daily spend trend (last 30 days max)
  const trendRes = await fetch(
    `${BASE}/${ad_account_id}/insights?fields=spend,reach,impressions&time_increment=1&${params}`
  )
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

  return NextResponse.json({ summary, campaigns, trend, account_name: config.account_name, days })
}
