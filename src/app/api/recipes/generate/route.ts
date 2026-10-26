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

interface BlendInfo { name: string; tags: string }

function getActiveBlends(db: ReturnType<typeof import('@/lib/db').getDb>): BlendInfo[] {
  const rows = db.prepare(`
    SELECT title, raw FROM shopify_products
    WHERE status = 'active' AND (is_bundle = 0 OR is_bundle IS NULL)
    ORDER BY title
  `).all() as { title: string; raw: string }[]

  return rows.map(r => {
    try {
      const parsed = JSON.parse(r.raw)
      return { name: r.title, tags: parsed.tags ?? '' }
    } catch {
      return { name: r.title, tags: '' }
    }
  })
}

function getExistingRecipes(db: ReturnType<typeof import('@/lib/db').getDb>): string[] {
  const rows = db.prepare(`
    SELECT title FROM tasks WHERE project_id = 3 ORDER BY created_at DESC
  `).all() as { title: string }[]
  return rows.map(r => r.title)
}

function buildSystemPrompt(blends: BlendInfo[], existingRecipes: string[]): string {
  const blendList = blends.map(b => `- **${b.name}**: ${b.tags}`).join('\n')
  const recipeList = existingRecipes.length > 0
    ? existingRecipes.map(r => `- ${r}`).join('\n')
    : '(none yet)'

  return `You are the Recipe Lab for Weeknight Dinner Party (WDP), an artisan spice blend brand. Your job is to generate original, weeknight-friendly recipes that feature one (or more) WDP spice blends in a delicious and natural way.

## Brand Voice
- Approachable, warm, confident — not food-snobby
- "Made for weeknights" — dinner on the table in 45 minutes or less is the sweet spot
- "Weeknight Dinner Party" energy: food that feels special but isn't stressful
- Real home cook language — no pretentious technique names
- The spice blend should be the hero, but not forced

## Available WDP Spice Blends
${blendList}

## Existing Recipes (do NOT duplicate these concepts)
${recipeList}

## Output Format
You MUST respond with a single valid JSON object — no markdown fences, no explanation outside the JSON. Structure:

{
  "title": "Catchy, fun recipe title — WDP naming style (wordplay, puns welcome)",
  "about": "2-4 paragraphs in WDP brand voice. What it is, why it works, what makes it special. Conversational, vivid, makes you want to cook it right now. Include a 'Why You'll Love It' or similar hook at the end.",
  "why": "3-5 bullet points (plain text, one per line starting with •). Key reasons this recipe wins: quick, uses pantry staples, crowd-pleaser, etc.",
  "ingredients": "Full ingredient list as a single string. Each ingredient on its own line. Include quantities. List the WDP spice blend prominently.",
  "steps": "Numbered recipe steps as a single string. Each step on its own line (1. ... \\n2. ... etc). Clear, confident, home-cook language. Include timing. IMPORTANT: whenever a step references an ingredient, always include the exact quantity (e.g. '2 tbsp Just Dill With It', '1 pound shrimp', '½ cup olive oil') — never say 'the spice blend', 'the marinade', or 'the remaining ingredients' without specifying the amount.",
  "considerations": "2-4 tips, variations, or storage notes. Plain text paragraph or bullet list.",
  "nutrition": "Estimated per serving: calories, protein, carbs, fat. Single line.",
  "keywords": "6-10 comma-separated SEO keywords: spice blend name, main protein/veg, cooking method, meal type (weeknight dinner, snack, appetizer, etc.), dietary tags if applicable, and 1-2 occasion or vibe words (quick, easy, crowd-pleaser, etc.)",
  "seo_heading": "Optimized H1 blog post heading (50-60 chars). Different from the recipe title — keyword-forward, search-intent driven. E.g. 'Easy 20-Minute Dill Crackers with Weeknight Dinner Party Seasoning'.",
  "seo_excerpt": "2-3 sentence meta description / blog excerpt (140-160 chars). Hook the reader, include the primary keyword naturally, and end with a soft CTA or promise."
}`
}

export async function POST(req: NextRequest) {
  const apiKey = getApiKey()
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'No API key configured' }), { status: 500 })
  }

  const body = await req.json()
  const { blend, protein, dietary, time, health, notes, refineContext } = body

  // Build user prompt from criteria
  const criteriaLines: string[] = []
  if (blend && blend !== 'any') criteriaLines.push(`Featured spice blend: **${blend}**`)
  if (protein) criteriaLines.push(`Main protein or star ingredient: ${protein}`)
  if (dietary?.length) criteriaLines.push(`Dietary considerations: ${dietary.join(', ')}`)
  if (time) criteriaLines.push(`Time constraint: ${time}`)
  if (health) criteriaLines.push(`Health level: ${health}`)
  if (notes) criteriaLines.push(`Additional notes: ${notes}`)

  const criteriaBlock = criteriaLines.length
    ? criteriaLines.join('\n')
    : 'No specific constraints — surprise me with something great!'

  const userMessage = refineContext
    ? `Here is the current recipe:\n\n${refineContext}\n\nPlease refine it based on this feedback: ${notes || 'Make it better — tighten the steps, punch up the title, or improve the flavor story.'}\n\nReturn the full updated recipe as JSON.`
    : `Generate a new recipe with these criteria:\n\n${criteriaBlock}\n\nReturn the complete recipe as a single JSON object.`

  const db = getDb()
  const activeBlends = getActiveBlends(db)
  const existingRecipes = getExistingRecipes(db)

  const client = new Anthropic({ apiKey })

  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 2500,
    system: buildSystemPrompt(activeBlends, existingRecipes),
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
