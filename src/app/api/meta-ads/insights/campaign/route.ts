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

// POST /api/meta-ads/insights/campaign — AI insights for a single Meta Ads campaign
export async function POST(req: NextRequest) {
  const apiKey = getApiKey()
  if (!apiKey) return NextResponse.json({ error: 'No API key configured' }, { status: 400 })

  const { campaign } = await req.json() as {
    campaign: {
      name: string; status: string; effective_status?: string
      spend: number; impressions: number; clicks: number
      cpc: number | null; cpm: number | null; ctr: number | null
      stop_time?: string | null
    }
  }

  const effectiveStatus = campaign.effective_status ?? campaign.status
  const isCompleted = effectiveStatus === 'COMPLETED'
  const avgCPC = campaign.cpc ?? (campaign.clicks > 0 ? campaign.spend / campaign.clicks : null)
  const avgCPM = campaign.cpm ?? (campaign.impressions > 0 ? (campaign.spend / campaign.impressions) * 1000 : null)

  const ctx = [
    `Brand: Weeknight Dinner Party — artisan spice blends, DTC e-commerce`,
    ``,
    `## Campaign: "${campaign.name}"`,
    `- Status: ${effectiveStatus}${isCompleted && campaign.stop_time ? ` (ended ${new Date(campaign.stop_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})` : ''}`,
    `- Total Spend: $${campaign.spend.toFixed(2)}`,
    `- Impressions: ${campaign.impressions.toLocaleString()}`,
    `- Clicks: ${campaign.clicks.toLocaleString()}`,
    `- CTR: ${campaign.ctr != null ? campaign.ctr.toFixed(2) + '%' : 'N/A'}`,
    `- CPC: ${avgCPC != null ? '$' + avgCPC.toFixed(2) : 'N/A'}`,
    `- CPM: ${avgCPM != null ? '$' + avgCPM.toFixed(2) : 'N/A'}`,
  ].join('\n')

  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: `You are the AI COO for Weeknight Dinner Party. Give a concise, specific insight paragraph (3–5 sentences) about this Meta Ads campaign's performance.
Be direct and actionable: what do the numbers indicate, is the CTR/CPM strong or weak for a DTC food brand, and what's the one recommended next step?
For completed campaigns, assess what worked and whether it should be relaunched. No lists, no headers — just a tight insight paragraph.`,
    messages: [{ role: 'user', content: `Give me insights on this campaign:\n\n${ctx}` }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  return NextResponse.json({ insights: text })
}
