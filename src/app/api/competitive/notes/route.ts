import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
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

async function getSection(key: string): Promise<string> {
  const db = await getDb()
  const row = (await db.execute({sql: 'SELECT content FROM marketing_strategy WHERE section = ?', args: [key]})).rows[0] as unknown as { content: string } | undefined
  return row?.content ?? ''
}

async function saveSection(key: string, value: string) {
  const db = await getDb()
  await db.execute({sql: `
    INSERT INTO marketing_strategy (section, content, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(section) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
  `, args: [key, value]})
}

export async function GET() {
  const notes = await getSection('competitive_notes')
  const insights = await getSection('competitive_ai_insights')
  const refreshedAt = await getSection('competitive_refreshed_at')
  return NextResponse.json({ notes, insights, refreshed_at: refreshedAt || null })
}

export async function PUT(request: Request) {
  const { notes } = await request.json() as { notes?: string }
  if (notes !== undefined) saveSection('competitive_notes', notes)
  return NextResponse.json({ ok: true })
}

export async function POST(request: Request) {
  const { notes = '' } = await request.json() as { notes?: string }
  saveSection('competitive_notes', notes)

  const apiKey = getApiKey()
  if (!apiKey) return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 })

  const prompt = `You are a brand strategist analyzing the competitive landscape for Weeknight Dinner Party (WDP), a boutique artisanal spice blend brand.

WDP sells spice blends for weeknight home cooks — DTC via Shopify + 2 wholesale accounts. Price point $14–16/jar. ~1.1K Instagram followers. Warm, approachable brand voice.

Key competitors:
- Spiceology ($17–22/jar, 112K IG followers, chef-driven, national grocery + DTC)
- Diaspora Co. ($10–14/jar, 86K followers, single-origin, sourcing story)
- Burlap & Barrel ($9–13/jar, 64K followers, farmer-direct)
- Fly By Jing ($16–24/jar, 210K followers, social-first, Target + Whole Foods)

${notes ? `FOCUS AREAS / WHAT I WANT TO KNOW:\n${notes}\n\n` : ''}Generate a focused competitive analysis using the generate_insights tool. Be specific and actionable for a small brand owner. Prioritize what matters most for WDP's next 90 days.`

  try {
    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 3000,
      tools: [{
        name: 'generate_insights',
        description: 'Output structured competitive insights',
        input_schema: {
          type: 'object' as const,
          properties: {
            summary: { type: 'string', description: '2-3 sentence executive summary of the competitive position' },
            insights: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  category: { type: 'string', description: 'e.g. Pricing, Content, Distribution, Brand Voice' },
                  finding: { type: 'string', description: 'What you found, 1-2 sentences' },
                  action: { type: 'string', description: 'Specific action WDP should take, 1 sentence' },
                  priority: { type: 'string', enum: ['high', 'medium', 'low'] },
                },
                required: ['category', 'finding', 'action', 'priority'],
              },
            },
          },
          required: ['summary', 'insights'],
        },
      }],
      tool_choice: { type: 'tool' as const, name: 'generate_insights' },
      messages: [{ role: 'user', content: prompt }],
    })

    const toolUse = message.content.find(b => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') throw new Error('No tool use in response')
    const result = toolUse.input as { summary: string; insights: unknown[] }

    const now = new Date().toISOString()
    saveSection('competitive_ai_insights', JSON.stringify(result))
    saveSection('competitive_refreshed_at', now)

    const db = await getDb()
    try {
      await db.execute({sql: 'INSERT INTO api_usage (operation, model, input_tokens, output_tokens) VALUES (?, ?, ?, ?)', args: ['competitive-insights', 'claude-sonnet-5', message.usage.input_tokens, message.usage.output_tokens]})
    } catch { /* non-fatal */ }

    return NextResponse.json({ insights: result, refreshed_at: now })
  } catch (err) {
    return NextResponse.json({ error: `Failed to refresh: ${String(err)}` }, { status: 500 })
  }
}
