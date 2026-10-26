export const maxDuration = 300 // 5-minute timeout for large menus

import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getDb } from '@/lib/db'
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

interface CourseSlot {
  blend?: string   // specific blend or 'any'
  role?: string    // e.g. "appetizer", "main", "side", "dessert"
  notes?: string
}

export async function POST(req: NextRequest) {
  const apiKey = getApiKey()
  if (!apiKey) return new Response(JSON.stringify({ error: 'No API key configured' }), { status: 500 })

  const body = await req.json() as {
    theme: string
    featuredBlends?: string[]
    courses: CourseSlot[]
    dietary?: string[]
    docContext?: string
  }

  const { theme, featuredBlends, courses, dietary, docContext } = body
  if (!theme || !courses?.length) {
    return new Response(JSON.stringify({ error: 'theme and courses required' }), { status: 400 })
  }

  const db = getDb()
  const blends = (db.prepare(
    `SELECT title, raw FROM shopify_products WHERE status = 'active' AND (is_bundle = 0 OR is_bundle IS NULL) ORDER BY title`
  ).all() as { title: string; raw: string }[]).map(r => {
    try { return { name: r.title, tags: (JSON.parse(r.raw) as { tags?: string }).tags ?? '' } }
    catch { return { name: r.title, tags: '' } }
  })

  const allBlendList = blends.map(b => `- **${b.name}**: ${b.tags}`).join('\n')
  const heroBlends = featuredBlends?.length
    ? blends.filter(b => featuredBlends.includes(b.name))
    : blends
  const heroBlendList = heroBlends.map(b => `- **${b.name}**: ${b.tags}`).join('\n')

  const courseDescriptions = courses.map((c, i) => {
    const parts = [`Recipe ${i + 1} (${c.role})`]
    if (c.blend && c.blend !== 'any') parts.push(`— feature: **${c.blend}**`)
    else if (featuredBlends?.length) parts.push(`— use one of the featured blends`)
    if (c.notes) parts.push(`— ${c.notes}`)
    return parts.join(' ')
  }).join('\n')

  const dietaryNote = dietary?.length ? `\nDietary constraints for the whole menu: ${dietary.join(', ')}` : ''
  const docNote = docContext ? `\n\n## Planning Doc Context\nThe user shared this context from their planning doc — use it to inform the menu:\n${docContext.slice(0, 2000)}` : ''

  const systemPrompt = `You are the Recipe Lab for Weeknight Dinner Party (WDP), an artisan spice blend brand. Your job is to generate a cohesive, occasion-specific menu of multiple recipes — all centered on a specific set of WDP spice blends — that feel like they belong together on the same table.

## Brand Voice
- Approachable, warm, confident — not food-snobby
- "Weeknight Dinner Party" energy: special but not stressful
- Puns and wordplay welcome in recipe titles
- Real home cook language

## Featured Blends for This Menu (use these — each recipe should feature one of them)
${heroBlendList}

## All Available WDP Spice Blends (for reference)
${allBlendList}

## Output Format
You MUST respond with a single valid JSON array — no markdown fences, no explanation. Each element is one recipe object:

[
  {
    "title": "...",
    "about": "2 paragraphs in WDP brand voice. What it is, why it belongs on this menu, and what makes it special.",
    "why": "3-4 bullet points (one per line, starting with •). Key reasons this dish wins for this occasion.",
    "ingredients": "Full ingredient list, one per line with quantities.",
    "steps": "Numbered steps, one per line (1. ... \\n2. ...). Include quantities inline.",
    "considerations": "1-2 make-ahead tips or hosting notes specific to this dish.",
    "blend_used": "The exact WDP blend name used in this recipe.",
    "course_role": "The role of this dish in the menu (e.g. Appetizer, Main, Side, Dessert)."
  }
]

Make the recipes cohesive: complement each other in flavor, balance richness across courses, and feel like one curated menu — not N separate recipes that happen to share a theme.`

  const featuredNote = featuredBlends?.length
    ? `\n\n**Featured Blends (each recipe must use one of these):** ${featuredBlends.join(', ')}`
    : ''

  const userMessage = `Generate ${courses.length} recipes for this menu:

**Theme / Occasion:** ${theme}${featuredNote}${dietaryNote}${docNote}

**Recipes (in this order):**
${courseDescriptions}

Important:
- Every recipe must feature one of the featured blends as the hero ingredient
- Distribute the blends across the menu so each blend appears in multiple recipes
- All recipes should feel like they belong together at the same occasion
- Return a JSON array of exactly ${courses.length} recipe objects, in the order listed above`

  const client = new Anthropic({ apiKey })
  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 32000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }
      } catch (err) {
        controller.error(err)
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked' },
  })
}
