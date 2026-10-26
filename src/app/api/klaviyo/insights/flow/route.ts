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

  const { flow } = await req.json() as {
    flow: { name: string; status: string; trigger_type?: string | null; updated?: string | null }
  }

  const updatedDate = flow.updated
    ? new Date(flow.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'unknown'

  const ctx = [
    `Brand: Weeknight Dinner Party — artisan spice blends, DTC e-commerce`,
    ``,
    `## Klaviyo Flow: "${flow.name}"`,
    `- Status: ${flow.status}`,
    `- Trigger: ${flow.trigger_type ?? 'Unknown'}`,
    `- Last updated: ${updatedDate}`,
  ].join('\n')

  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: `You are the AI COO for Weeknight Dinner Party. Give a concise, specific insight paragraph (3–5 sentences) about this Klaviyo automated flow.
Based on the flow name and trigger type, comment on: what customer journey moment this flow addresses, whether it's a high-value automation for a DTC food brand, and one specific recommendation to improve or expand it.
For draft flows, focus on how to activate them. For live flows, assess optimization potential.
No lists, no headers — one tight insight paragraph.`,
    messages: [{ role: 'user', content: `Give me insights on this Klaviyo flow:\n\n${ctx}` }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return NextResponse.json({ insights: text })
}
