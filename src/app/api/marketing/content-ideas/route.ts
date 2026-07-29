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

function getStrategySection(section: string): string {
  const db = getDb()
  const row = db.prepare('SELECT content FROM marketing_strategy WHERE section = ?').get(section) as { content: string } | undefined
  return row?.content ?? ''
}

function saveStrategySection(section: string, content: string) {
  const db = getDb()
  db.prepare(`
    INSERT INTO marketing_strategy (section, content, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(section) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
  `).run(section, content)
}

const BASE = 'https://graph.facebook.com/v22.0'

async function igGet<T>(path: string, params: Record<string, string>, token: string): Promise<T | null> {
  try {
    const qs = new URLSearchParams({ ...params, access_token: token }).toString()
    const res = await fetch(`${BASE}/${path}?${qs}`)
    const json = await res.json()
    if (!res.ok || json?.error) return null
    return json as T
  } catch { return null }
}

export async function GET() {
  const competitors = getStrategySection('content_ideas_competitors')
  const focusNotes  = getStrategySection('content_ideas_focus')
  const ideasRaw    = getStrategySection('content_ideas_result')
  const lastGenerated = getStrategySection('content_ideas_generated_at')
  const ratingsRaw  = getStrategySection('content_ideas_ratings')

  let ideas: unknown[] = []
  try { ideas = ideasRaw ? JSON.parse(ideasRaw) : [] } catch { /* empty */ }
  let ratings: unknown = {}
  try { ratings = ratingsRaw ? JSON.parse(ratingsRaw) : {} } catch { /* empty */ }

  return NextResponse.json({ competitors, focus_notes: focusNotes, ideas, last_generated: lastGenerated || null, ratings })
}

export async function PUT(request: Request) {
  const { competitors, focus_notes, ratings, ideas } = await request.json() as { competitors?: string; focus_notes?: string; ratings?: unknown; ideas?: unknown }
  if (competitors !== undefined) saveStrategySection('content_ideas_competitors', competitors)
  if (focus_notes !== undefined) saveStrategySection('content_ideas_focus', focus_notes)
  if (ratings !== undefined) saveStrategySection('content_ideas_ratings', JSON.stringify(ratings))
  if (ideas !== undefined) saveStrategySection('content_ideas_result', JSON.stringify(ideas))
  return NextResponse.json({ ok: true })
}

export async function POST(request: Request) {
  const { competitors = '', focus_notes = '', ratings = {} } = await request.json() as { competitors?: string; focus_notes?: string; ratings?: Record<string, { thumb?: 'up' | 'down' | null; feedback: string }> }

  // Save inputs
  saveStrategySection('content_ideas_competitors', competitors)
  saveStrategySection('content_ideas_focus', focus_notes)

  const apiKey = getApiKey()
  if (!apiKey) return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 })

  // Pull Instagram data
  const db = getDb()
  const igConfig = db.prepare('SELECT access_token, ig_user_id, username FROM instagram_config WHERE id = 1').get() as
    { access_token: string; ig_user_id: string; username: string | null } | undefined

  let igContext = 'Instagram not connected — no engagement data available.'
  if (igConfig) {
    const { access_token: token, ig_user_id } = igConfig

    const profile = await igGet<{
      followers_count?: number; media_count?: number
    }>(ig_user_id, { fields: 'followers_count,media_count' }, token)

    const since = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000)
    const until = Math.floor(Date.now() / 1000)
    const reach30 = await igGet<{ data?: Array<{ name: string; values: Array<{ value: number }> }> }>(
      `${ig_user_id}/insights`,
      { metric: 'reach', period: 'day', since: String(since), until: String(until) },
      token
    )
    const totalReach = reach30?.data?.[0]?.values?.reduce((s, v) => s + (Number(v.value) || 0), 0) ?? 0

    const media = await igGet<{
      data?: Array<{ id: string; media_type: string; caption?: string; like_count?: number; comments_count?: number; timestamp: string }>
    }>(
      `${ig_user_id}/media`,
      { fields: 'id,media_type,caption,like_count,comments_count,timestamp', limit: '20' },
      token
    )

    const posts = (media?.data ?? [])
      .map(p => ({
        type: p.media_type === 'VIDEO' ? 'Reel' : p.media_type === 'CAROUSEL_ALBUM' ? 'Carousel' : 'Post',
        likes: p.like_count ?? 0,
        comments: p.comments_count ?? 0,
        engagement: (p.like_count ?? 0) + (p.comments_count ?? 0),
        caption: (p.caption ?? '').slice(0, 100),
        date: p.timestamp.slice(0, 10),
      }))
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 8)

    const topFormats = posts.reduce<Record<string, number>>((acc, p) => {
      acc[p.type] = (acc[p.type] ?? 0) + 1; return acc
    }, {})

    igContext = [
      `Followers: ${profile?.followers_count?.toLocaleString() ?? 'unknown'}`,
      `Total posts: ${profile?.media_count ?? 'unknown'}`,
      `30-day reach: ${totalReach.toLocaleString()}`,
      `Top content formats by post count: ${Object.entries(topFormats).map(([k, v]) => `${k} (${v})`).join(', ')}`,
      `Top 8 posts by engagement:`,
      ...posts.map((p, i) => `  ${i + 1}. [${p.type}] ${p.likes} likes, ${p.comments} comments — "${p.caption.replace(/\n/g, ' ')}"`),
    ].join('\n')
  }

  // Pull brand strategy
  const brandVoice    = getStrategySection('brand_voice')
  const targetAudience = getStrategySection('target_audience')
  const positioning   = getStrategySection('brand_positioning')
  const keyMessaging  = getStrategySection('key_messaging')

  const brandContext = [
    brandVoice    ? `Brand Voice: ${brandVoice}` : '',
    targetAudience ? `Target Audience: ${targetAudience}` : '',
    positioning   ? `Brand Positioning: ${positioning}` : '',
    keyMessaging  ? `Key Messaging: ${keyMessaging}` : '',
  ].filter(Boolean).join('\n\n') || 'Weeknight Dinner Party (WDP) — artisanal spice blend brand. Warm, approachable tone. Audience: home cooks who want to elevate everyday meals without complexity.'

  // Build rated-idea feedback context
  const ideasRaw = getStrategySection('content_ideas_result')
  let previousIdeas: Array<{ id: string; title: string; format: string; why: string }> = []
  try { previousIdeas = ideasRaw ? JSON.parse(ideasRaw) : [] } catch { /* empty */ }

  const ratedLines: string[] = []
  for (const [id, rating] of Object.entries(ratings ?? {})) {
    if (!rating.thumb) continue
    const idea = previousIdeas.find(i => i.id === id)
    const title = idea ? `"${idea.title}" (${idea.format})` : id
    const thumbLabel = rating.thumb === 'up' ? '👍 liked' : '👎 disliked'
    ratedLines.push(`  ${title}: ${thumbLabel}${rating.feedback ? ` — "${rating.feedback}"` : ''}`)
  }
  const ratingContext = ratedLines.length
    ? `\nPAST IDEA RATINGS (use to calibrate style and topics):\n${ratedLines.join('\n')}`
    : ''

  const prompt = `You are a creative content strategist for Weeknight Dinner Party (WDP), a boutique spice blend brand on Instagram.

BRAND CONTEXT:
${brandContext}

INSTAGRAM PERFORMANCE (last 30 days):
${igContext}

COMPETITORS & INSPIRATION:
${competitors || 'None provided'}

CURRENT FOCUS / UPCOMING:
${focus_notes || 'None provided'}${ratingContext}

Generate 12 diverse, actionable Instagram content ideas using the generate_ideas tool. Mix formats: 4 Reels, 3 Carousels, 3 Posts, 2 Stories. Prioritize content styles that appear in the top-performing posts. Be specific to spice blends and weeknight cooking. Learn from any past ratings provided above.`

  try {
    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 6000,
      tools: [{
        name: 'generate_ideas',
        description: 'Output structured Instagram content ideas',
        input_schema: {
          type: 'object' as const,
          properties: {
            ideas: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id:              { type: 'string' },
                  format:          { type: 'string', enum: ['Reel', 'Carousel', 'Post', 'Story'] },
                  title:           { type: 'string', description: 'Punchy idea title, 8 words max' },
                  hook:            { type: 'string', description: 'Opening line / scroll-stopping hook, 1-2 sentences' },
                  caption_concept: { type: 'string', description: 'Caption direction, 1 sentence' },
                  why:             { type: 'string', description: 'Why this resonates, 1 sentence' },
                },
                required: ['id', 'format', 'title', 'hook', 'caption_concept', 'why'],
              },
            },
          },
          required: ['ideas'],
        },
      }],
      tool_choice: { type: 'tool' as const, name: 'generate_ideas' },
      messages: [{ role: 'user', content: prompt }],
    })

    const toolUse = message.content.find(b => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') throw new Error('No tool use in response')
    const ideas = (toolUse.input as { ideas: unknown[] }).ideas
    if (!Array.isArray(ideas)) throw new Error('Expected ideas array')

    const now = new Date().toISOString()
    saveStrategySection('content_ideas_result', JSON.stringify(ideas))
    saveStrategySection('content_ideas_generated_at', now)

    // Log usage to api_usage table so it shows in Settings → Agents cost tracker
    try {
      const usage = message.usage
      db.prepare('INSERT INTO api_usage (operation, model, input_tokens, output_tokens) VALUES (?, ?, ?, ?)')
        .run('content-ideas', 'claude-sonnet-5', usage.input_tokens, usage.output_tokens)
    } catch { /* non-fatal */ }

    return NextResponse.json({ ideas, last_generated: now })
  } catch (err) {
    return NextResponse.json({ error: `Failed to generate ideas: ${String(err)}` }, { status: 500 })
  }
}
