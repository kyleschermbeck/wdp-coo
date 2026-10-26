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

  const { campaign } = await req.json() as {
    campaign: {
      name: string; status: string; subject?: string | null; send_time?: string | null
      recipients?: number | null; opens?: number | null; clicks?: number | null
      open_rate?: number | null; click_rate?: number | null; revenue?: number | null
      unsubscribes?: number | null
    }
  }

  const sentDate = campaign.send_time
    ? new Date(campaign.send_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'unknown date'

  const ctx = [
    `Brand: Weeknight Dinner Party — artisan spice blends, DTC e-commerce`,
    ``,
    `## Email Campaign: "${campaign.name}"`,
    campaign.subject ? `- Subject line: "${campaign.subject}"` : '',
    `- Status: ${campaign.status} | Sent: ${sentDate}`,
    `- Recipients: ${campaign.recipients?.toLocaleString() ?? 'N/A'}`,
    `- Open rate: ${campaign.open_rate != null ? campaign.open_rate.toFixed(1) + '%' : 'N/A'}`,
    `- Click rate: ${campaign.click_rate != null ? campaign.click_rate.toFixed(1) + '%' : 'N/A'}`,
    `- Clicks: ${campaign.clicks?.toLocaleString() ?? 'N/A'}`,
    `- Revenue attributed: ${campaign.revenue != null && campaign.revenue > 0 ? '$' + campaign.revenue.toFixed(2) : 'N/A'}`,
    `- Unsubscribes: ${campaign.unsubscribes ?? 'N/A'}`,
  ].filter(Boolean).join('\n')

  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: `You are the AI COO for Weeknight Dinner Party. Give a concise, specific insight paragraph (3–5 sentences) about this Klaviyo email campaign.
Benchmark context: Good DTC food brand email benchmarks — open rate 30–45%, click rate 2–5%. Comment on how this campaign compares, what the subject line effectiveness suggests, and one specific next action (resend to non-openers, A/B test subject, etc.).
If metrics are 0 or N/A, acknowledge that data hasn't synced yet and focus on what you can infer from the campaign name and send date.
No lists, no headers — one tight insight paragraph.`,
    messages: [{ role: 'user', content: `Give me insights on this Klaviyo campaign:\n\n${ctx}` }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return NextResponse.json({ insights: text })
}
