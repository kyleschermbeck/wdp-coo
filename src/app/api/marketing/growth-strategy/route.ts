import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getDb } from '@/lib/db'
import type { Client } from '@libsql/client'
import { readFileSync } from 'fs'
import { join } from 'path'

function getApiKey(): string | undefined {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  try {
    const content = readFileSync(join(process.cwd(), '.env.local'), 'utf-8')
    const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m)
    return match?.[1]?.trim()
  } catch { return undefined }
}

// ─── Shopify data ─────────────────────────────────────────────────────────────
async function getShopifyData(db: Client) {
  const rev30 = (await db.execute({sql: `
    SELECT COUNT(*) as orders, ROUND(SUM(total_price),2) as revenue, ROUND(AVG(total_price),2) as aov
    FROM shopify_orders WHERE financial_status='paid' AND created_at >= datetime('now','-30 days')
  `, args: []})).rows[0] as unknown as { orders: number; revenue: number; aov: number }

  const rev90 = (await db.execute({sql: `
    SELECT COUNT(*) as orders, ROUND(SUM(total_price),2) as revenue
    FROM shopify_orders WHERE financial_status='paid' AND created_at >= datetime('now','-90 days')
  `, args: []})).rows[0] as unknown as { orders: number; revenue: number }

  const revByMonth = (await db.execute({sql: `
    SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as orders, ROUND(SUM(total_price),2) as revenue
    FROM shopify_orders WHERE financial_status='paid'
    GROUP BY month ORDER BY month DESC LIMIT 4
  `, args: []})).rows as unknown as { month: string; orders: number; revenue: number }[]

  const topProducts = (await db.execute({sql: `
    SELECT title, inventory_quantity FROM shopify_products
    WHERE status='active' AND is_bundle=0
    ORDER BY inventory_quantity ASC LIMIT 8
  `, args: []})).rows as unknown as { title: string; inventory_quantity: number }[]

  const discounts = (await db.execute({sql: `
    SELECT discount_codes, COUNT(*) as cnt, ROUND(SUM(total_price),2) as rev
    FROM shopify_orders WHERE financial_status='paid' AND discount_codes IS NOT NULL AND discount_codes != '[]'
    AND created_at >= datetime('now','-30 days')
    GROUP BY discount_codes LIMIT 5
  `, args: []})).rows as unknown as { discount_codes: string; cnt: number; rev: number }[]

  return { rev30, rev90, revByMonth, topProducts, discounts }
}

// ─── Meta Ads (live) ──────────────────────────────────────────────────────────
async function getMetaAdsData(db: Client) {
  const config = (await db.execute({sql: 'SELECT access_token, ad_account_id, account_name FROM meta_ads_config WHERE id = 1', args: []})).rows[0] as unknown as { access_token: string; ad_account_id: string; account_name: string | null } | undefined

  if (!config) return null

  const BASE = 'https://graph.facebook.com/v19.0'
  const since = (days: number) => {
    const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10)
  }
  const token = config.access_token
  const accountId = config.ad_account_id

  try {
    const timeRange = JSON.stringify({ since: since(30), until: since(0) })
    const params = `access_token=${token}&time_range=${encodeURIComponent(timeRange)}`
    const METRICS = 'spend,reach,impressions,clicks,ctr,cpm,cpc,actions,action_values,frequency'

    const [summaryRes, campaignsRes] = await Promise.all([
      fetch(`${BASE}/${accountId}/insights?fields=${METRICS}&${params}`),
      fetch(`${BASE}/${accountId}/campaigns?fields=id,name,status,insights.time_range(${encodeURIComponent(timeRange)}){spend,reach,impressions,clicks,actions,action_values}&filtering=[{"field":"effective_status","operator":"IN","value":["ACTIVE","PAUSED"]}]&limit=10&${params}`),
    ])

    const summary = summaryRes.ok ? (await summaryRes.json() as { data?: Record<string, string>[] }).data?.[0] : null
    const campaigns = campaignsRes.ok ? (await campaignsRes.json() as { data?: Record<string, unknown>[] }).data ?? [] : []

    const sumActions = (actions: Array<{ action_type: string; value: string }> | undefined, type: string) =>
      actions?.filter(a => a.action_type === type).reduce((s, a) => s + parseFloat(a.value), 0) ?? 0

    const spend = parseFloat(summary?.spend ?? '0')
    const purchases = sumActions(summary?.actions as Array<{ action_type: string; value: string }> | undefined, 'purchase')
    const purchaseValue = sumActions(summary?.action_values as Array<{ action_type: string; value: string }> | undefined, 'purchase')

    return {
      account_name: config.account_name,
      spend_30d: spend,
      reach_30d: parseInt(summary?.reach ?? '0', 10),
      impressions_30d: parseInt(summary?.impressions ?? '0', 10),
      clicks_30d: parseInt(summary?.clicks ?? '0', 10),
      ctr: parseFloat(summary?.ctr ?? '0'),
      cpm: parseFloat(summary?.cpm ?? '0'),
      cpc: parseFloat(summary?.cpc ?? '0'),
      frequency: parseFloat(summary?.frequency ?? '0'),
      purchases_30d: purchases,
      purchase_value_30d: purchaseValue,
      roas: spend > 0 ? purchaseValue / spend : 0,
      cost_per_purchase: purchases > 0 ? spend / purchases : 0,
      active_campaigns: campaigns.length,
    }
  } catch {
    return null
  }
}

// ─── Google Analytics (live) ──────────────────────────────────────────────────
async function getGAData(db: Client) {
  const gaConfig = (await db.execute({sql: 'SELECT property_id, access_token, token_expiry FROM google_analytics_config WHERE id = 1', args: []})).rows[0] as
    unknown as | { property_id: string; access_token: string; token_expiry: number | null } | undefined

  if (!gaConfig?.access_token) return null

  try {
    // 30-day report: sessions by channel + top metrics
    const endDate = new Date().toISOString().slice(0, 10)
    const startDate = new Date(Date.now() - 30 * 24 * 3600_000).toISOString().slice(0, 10)

    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${gaConfig.property_id}:runReport`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${gaConfig.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: 'sessionDefaultChannelGrouping' }],
          metrics: [
            { name: 'sessions' },
            { name: 'newUsers' },
            { name: 'bounceRate' },
            { name: 'averageSessionDuration' },
          ],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: 10,
        }),
      }
    )

    if (!res.ok) return null
    const data = await res.json() as {
      rows?: Array<{ dimensionValues: { value: string }[]; metricValues: { value: string }[] }>
      totals?: Array<{ metricValues: { value: string }[] }>
    }

    const channels = (data.rows ?? []).map(r => ({
      channel: r.dimensionValues[0].value,
      sessions: parseInt(r.metricValues[0].value, 10),
      new_users: parseInt(r.metricValues[1].value, 10),
      bounce_rate: parseFloat(r.metricValues[2].value),
      avg_session_duration: parseFloat(r.metricValues[3].value),
    }))

    const totalSessions = channels.reduce((s, c) => s + c.sessions, 0)

    return { channels, total_sessions_30d: totalSessions }
  } catch {
    return null
  }
}

// ─── Klaviyo data ─────────────────────────────────────────────────────────────
async function getKlaviyoData(db: Client) {
  const subscribers = (await db.execute({sql: 'SELECT SUM(profile_count) as total FROM klaviyo_lists', args: []})).rows[0] as unknown as { total: number }
  const metrics = (await db.execute({sql: 'SELECT metric_name, value_30d FROM klaviyo_metrics', args: []})).rows as unknown as { metric_name: string; value_30d: number }[]
  const campaigns = (await db.execute({sql: `
    SELECT name, status, send_time, recipients, open_rate, click_rate, revenue
    FROM klaviyo_campaigns WHERE status='Sent' ORDER BY send_time DESC LIMIT 5
  `, args: []})).rows as unknown as { name: string; status: string; send_time: string | null; recipients: number; open_rate: number; click_rate: number; revenue: number }[]
  const flows = (await db.execute({sql: `SELECT name, status, trigger_type FROM klaviyo_flows WHERE status='live'`, args: []})).rows as unknown as { name: string; status: string; trigger_type: string | null }[]

  const metricMap: Record<string, number> = {}
  for (const m of metrics) metricMap[m.metric_name] = m.value_30d

  const received = metricMap['Received Email'] ?? 0
  const opened = metricMap['Opened Email'] ?? 0
  const clicked = metricMap['Clicked Email'] ?? 0

  return {
    total_subscribers: subscribers.total,
    open_rate_30d: received > 0 ? (opened / received * 100).toFixed(1) + '%' : '—',
    click_rate_30d: received > 0 ? (clicked / received * 100).toFixed(1) + '%' : '—',
    emails_sent_30d: received,
    live_flows: flows.length,
    flow_names: flows.map(f => f.name),
    recent_campaigns: campaigns.slice(0, 3).map(c => c.name),
  }
}

// ─── Instagram data ───────────────────────────────────────────────────────────
async function getInstagramData(db: Client) {
  const config = (await db.execute({sql: 'SELECT username FROM instagram_config WHERE id = 1', args: []})).rows[0] as unknown as { username: string | null } | undefined
  return config?.username ?? null
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET() {
  const db = await getDb()
  const row = (await db.execute({sql: `SELECT value, updated_at FROM settings_kv WHERE key = 'growth_strategy'`, args: []})).rows[0] as
    unknown as | { value: string; updated_at: string } | undefined
  if (!row) return NextResponse.json({ strategy: null })
  return NextResponse.json({ strategy: row.value, generated_at: row.updated_at })
}

export async function POST() {
  const db = await getDb()
  const apiKey = getApiKey()
  if (!apiKey) return NextResponse.json({ error: 'No API key configured' }, { status: 400 })

  // ── Gather all data in parallel where possible ────────────────────────────
  const [shopify, metaAds, gaData] = await Promise.all([
    Promise.resolve(getShopifyData(db)),
    getMetaAdsData(db),
    getGAData(db),
  ])
  const klaviyo = await getKlaviyoData(db)
  const igUsername = await getInstagramData(db)

  // ── Build context string ──────────────────────────────────────────────────
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const sections: string[] = [`Date: ${today}`, `Brand: Weeknight Dinner Party — artisan spice blends, DTC + wholesale`]

  // Shopify revenue
  sections.push(`## Shopify Revenue
- Last 30 days: $${shopify.rev30.revenue ?? 0} across ${shopify.rev30.orders} orders (AOV: $${shopify.rev30.aov ?? 0})
- Last 90 days: $${shopify.rev90.revenue ?? 0} across ${shopify.rev90.orders} orders
- Monthly trend: ${shopify.revByMonth.map(m => `${m.month}: $${m.revenue} (${m.orders} orders)`).join(', ')}
- Top products by velocity (lowest stock = fastest moving): ${shopify.topProducts.slice(0, 5).map(p => p.title).join(', ')}
- Discount usage (30d): ${shopify.discounts.length > 0 ? shopify.discounts.map(d => `${d.cnt} orders, $${d.rev}`).join('; ') : 'none'}`)

  // Meta Ads
  if (metaAds) {
    const roas = metaAds.roas > 0 ? metaAds.roas.toFixed(2) + 'x' : 'N/A (no purchases tracked)'
    sections.push(`## Meta Ads (Last 30 Days)
- Account: ${metaAds.account_name}
- Spend: $${metaAds.spend_30d.toFixed(2)}
- ROAS: ${roas}
- Reach: ${metaAds.reach_30d.toLocaleString()} people | Impressions: ${metaAds.impressions_30d.toLocaleString()}
- CTR: ${metaAds.ctr.toFixed(2)}% | CPC: $${metaAds.cpc.toFixed(2)} | CPM: $${metaAds.cpm.toFixed(2)}
- Frequency: ${metaAds.frequency.toFixed(2)} (avg times someone sees an ad)
- Active campaigns: ${metaAds.active_campaigns}
- Purchases attributed: ${metaAds.purchases_30d} ($${metaAds.purchase_value_30d.toFixed(2)} value)`)
  } else {
    sections.push(`## Meta Ads: Not connected or data unavailable`)
  }

  // Pinterest
  sections.push(`## Pinterest Ads
- Note: Running Pinterest Ads. Data currently flows into Shopify but UTM attribution is not yet captured in the local DB. Pinterest is an active paid channel for brand awareness and product discovery. No spend/ROAS data available yet — recommend connecting Pinterest Ads API or adding UTM tracking to Shopify orders.`)

  // Google Analytics
  if (gaData) {
    const channelSummary = gaData.channels.slice(0, 6).map(c =>
      `${c.channel}: ${c.sessions} sessions (${c.new_users} new users, ${(c.bounce_rate * 100).toFixed(0)}% bounce)`
    ).join('\n  - ')
    sections.push(`## Website Traffic (Google Analytics, Last 30 Days)
- Total sessions: ${gaData.total_sessions_30d.toLocaleString()}
- Traffic by channel:
  - ${channelSummary}`)
  } else {
    sections.push(`## Google Analytics: Not connected or data unavailable`)
  }

  // Klaviyo email
  sections.push(`## Email Marketing (Klaviyo)
- Total subscribers: ${klaviyo.total_subscribers}
- Open rate (30d): ${klaviyo.open_rate_30d}
- Click rate (30d): ${klaviyo.click_rate_30d}
- Emails sent (30d): ${klaviyo.emails_sent_30d}
- Live automated flows: ${klaviyo.live_flows} (${klaviyo.flow_names.join(', ')})
- Recent campaigns: ${klaviyo.recent_campaigns.join(', ')}`)

  // Instagram
  if (igUsername) {
    sections.push(`## Instagram: @${igUsername} connected (organic social channel)`)
  }

  const context = sections.join('\n\n')

  // ── Call Claude ───────────────────────────────────────────────────────────
  const client = new Anthropic({ apiKey })

  const systemPrompt = `You are a senior growth strategist for Weeknight Dinner Party, a premium artisan spice blend brand. You have deep expertise in DTC e-commerce, paid social (Meta, Pinterest), SEO/content, and email marketing. Your job is to synthesize financial and marketing data and deliver a clear, actionable brand awareness and growth strategy.

Output format — use markdown with these exact sections:

## 📊 Financial Snapshot
A clear, honest summary of revenue performance, ad efficiency, and unit economics. Include ROAS analysis, channel profitability, and trend direction. Be specific with numbers.

## 🎯 Channel Assessment
Rate each active channel (Meta Ads, Pinterest Ads, Email, Organic/SEO, Instagram) on awareness impact vs. conversion efficiency. Identify which channels are underperforming relative to spend or potential.

## 🚀 Brand Awareness Strategy
3-5 specific, prioritized strategic moves to accelerate brand awareness. Each should include:
- The action
- Why it matters for WDP specifically
- Expected impact (awareness, traffic, conversions)
- Rough priority: High/Medium/Low

## 💰 Recommended Marketing Spend
Based on revenue and ROAS data, give a concrete monthly marketing budget recommendation with specific dollar amounts — not just percentages. Structure it as:
- **Total recommended monthly spend**: $X (why this % of revenue)
- **Meta Ads**: $X/month — target ROAS, what campaigns/objectives to run
- **Pinterest Ads**: $X/month — why this allocation, what creative to test
- **Email (Klaviyo)**: $X/month (or note if included in platform fee) — what automations/campaigns to invest in
- **Content / Organic**: $X/month — what to spend on creative, UGC, or SEO
- **Flag**: any channel where current spend is too high or too low relative to return

## ⚡ Quick Wins (Next 30 Days)
3-4 specific things to do immediately with highest impact-to-effort ratio. Be tactical and WDP-specific.

## 📅 90-Day Roadmap
Month-by-month priorities. Keep it punchy — what to focus on each month and why.

Tone: direct, confident, data-driven. No fluff. Be specific to WDP's situation, not generic e-commerce advice.`

  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 16000,
    system: systemPrompt,
    messages: [{ role: 'user', content: `Generate a comprehensive brand awareness and growth strategy based on this business data:\n\n${context}` }],
  })

  const textBlock = response.content.find(b => b.type === 'text')
  const strategy = textBlock?.type === 'text' ? textBlock.text : ''

  // ── Cache ─────────────────────────────────────────────────────────────────
  await db.execute({sql: `
    INSERT INTO settings_kv (key, value, updated_at) VALUES ('growth_strategy', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `, args: [strategy]})

  try {
    await db.execute({sql: 'INSERT INTO api_usage (operation, model, input_tokens, output_tokens) VALUES (?, ?, ?, ?)', args: ['growth_strategy', 'claude-opus-5', response.usage.input_tokens, response.usage.output_tokens]})
  } catch { /* ignore */ }

  return NextResponse.json({ strategy, generated_at: new Date().toISOString() })
}
