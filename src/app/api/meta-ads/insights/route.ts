import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
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

export async function POST(req: NextRequest) {
  const apiKey = getApiKey()
  if (!apiKey) return NextResponse.json({ error: 'No API key configured' }, { status: 400 })

  const body = await req.json() as {
    days: number
    summary: {
      spend: number; roas: number; reach: number; impressions: number
      clicks: number; ctr: number; cpm: number; cpc: number; frequency: number
      purchases: number; purchase_value: number; cost_per_purchase: number
      add_to_carts: number; checkouts: number
    }
    campaigns: Array<{
      name: string; status: string; spend: number; roas: number
      reach: number; clicks: number; ctr: number; purchases: number
      cost_per_purchase: number; frequency: number
      daily_budget: number | null; lifetime_budget: number | null
      start_time: string | null; stop_time: string | null
    }>
    ads: Array<{
      ad_name: string; campaign_name?: string; spend: number; roas: number
      reach: number; clicks: number; ctr: number; purchases: number
      cost_per_purchase: number
    }>
  }

  const { days, summary, campaigns, ads } = body

  // Build context
  const ctx: string[] = [
    `Brand: Weeknight Dinner Party — artisan spice blends, DTC`,
    `Date range: Last ${days} days`,
    ``,
    `## Account Summary`,
    `- Spend: $${summary.spend.toFixed(2)}`,
    `- ROAS: ${summary.roas > 0 ? summary.roas.toFixed(2) + 'x' : 'N/A'}`,
    `- Reach: ${summary.reach.toLocaleString()} | Impressions: ${summary.impressions.toLocaleString()}`,
    `- Clicks: ${summary.clicks.toLocaleString()} | CTR: ${summary.ctr.toFixed(2)}%`,
    `- CPM: $${summary.cpm.toFixed(2)} | CPC: $${summary.cpc.toFixed(2)}`,
    `- Frequency: ${summary.frequency.toFixed(2)}`,
    `- Add to Carts: ${summary.add_to_carts} | Checkouts: ${summary.checkouts} | Purchases: ${summary.purchases}`,
    `- Purchase Value: $${summary.purchase_value.toFixed(2)} | Cost per Purchase: ${summary.cost_per_purchase > 0 ? '$' + summary.cost_per_purchase.toFixed(2) : 'N/A'}`,
  ]

  if (campaigns.length > 0) {
    ctx.push(``, `## Campaigns (${campaigns.length})`)
    for (const c of campaigns.slice(0, 8)) {
      const budgetStr = c.daily_budget != null
        ? `daily budget $${c.daily_budget.toFixed(2)}/day`
        : c.lifetime_budget != null
        ? `lifetime budget $${c.lifetime_budget.toFixed(2)}`
        : 'budget unknown'
      const startStr = c.start_time ? new Date(c.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
      const stopStr  = c.stop_time  ? new Date(c.stop_time).toLocaleDateString('en-US',  { month: 'short', day: 'numeric', year: 'numeric' }) : null
      const dateStr  = startStr ? (stopStr ? `${startStr} → ${stopStr}` : `started ${startStr}, no end date`) : ''
      ctx.push(
        `- ${c.name} [${c.status}]: $${c.spend.toFixed(2)} total spend, ${budgetStr}${dateStr ? `, ${dateStr}` : ''}, ` +
        `ROAS ${c.roas > 0 ? c.roas.toFixed(2) + 'x' : 'N/A'}, ` +
        `${c.reach.toLocaleString()} reach, ${c.clicks} clicks, CTR ${c.ctr.toFixed(2)}%, ` +
        `${c.purchases} purchases, freq ${c.frequency.toFixed(2)}`
      )
    }
  }

  if (ads.length > 0) {
    ctx.push(``, `## Top Ads (${ads.length} total)`)
    const sorted = [...ads].sort((a, b) => b.spend - a.spend).slice(0, 5)
    for (const a of sorted) {
      ctx.push(
        `- "${a.ad_name}"${a.campaign_name ? ` (${a.campaign_name})` : ''}: $${a.spend.toFixed(2)} spend, ` +
        `ROAS ${a.roas > 0 ? a.roas.toFixed(2) + 'x' : 'N/A'}, CTR ${a.ctr.toFixed(2)}%, ${a.purchases} purchases`
      )
    }
  }

  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    system: `You are a Meta Ads performance analyst for Weeknight Dinner Party, a premium artisan spice blend brand. You interpret ad metrics clearly and give direct, WDP-specific next steps.

Output exactly two sections using these headers:

## What This Means
3–5 bullet points interpreting the key metrics in plain language. Call out what's working, what's underperforming, and what the numbers actually signal for a small DTC food brand. Be specific — reference actual numbers. No generic platitudes.

## What To Do Next
3–5 concrete, prioritized action items. Each should be actionable this week. Lead with the highest-impact change. Include specific targeting, budget, or creative recommendations where relevant. Keep it tight — one sentence per action, no sub-bullets.

Tone: direct, confident, zero fluff. Write like a smart analyst talking to a founder, not like an ad agency deck.`,
    messages: [{
      role: 'user',
      content: `Analyze this Meta Ads performance data and tell me what it means and what to do next:\n\n${ctx.join('\n')}`
    }],
  })

  const textBlock = response.content.find(b => b.type === 'text')
  const insights = textBlock?.type === 'text' ? textBlock.text : ''

  return NextResponse.json({ insights })
}
