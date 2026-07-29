import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not set. Add it to .env.local to use the recipe writer.' }, { status: 503 })
  }

  const { recipe_name, ingredients } = await req.json()

  if (!ingredients?.trim()) {
    return NextResponse.json({ error: 'Ingredients are required.' }, { status: 400 })
  }

  const client = new Anthropic({ apiKey: key })

  const prompt = `You are a food writer for Weeknight Dinner Party, a premium spice blend brand. Your writing is warm, confident, and approachable — like a friend who happens to cook really well. You make weeknight cooking feel elevated but never intimidating.

Write six sections for the recipe "${recipe_name}" based on these ingredients:

${ingredients}

Return ONLY a JSON object with exactly these six keys (no markdown, no code fences):
{
  "about": "2-3 sentences about what this dish is and what makes it special. Mention the spice blend if relevant.",
  "why": "2-3 sentences on why someone will love this — texture, flavor payoff, weeknight simplicity, crowd-pleaser factor.",
  "steps": "Numbered step-by-step instructions. Be specific with temps, times, and technique. Keep it scannable.",
  "considerations": "2-3 tips — substitutions, make-ahead notes, storage, or what to serve alongside.",
  "nutrition": "Estimated nutritional info per serving in a concise format, e.g. Calories: 320 · Protein: 28g · Carbs: 12g · Fat: 18g · Fiber: 3g. Use reasonable estimates based on the ingredients.",
  "keywords": "Comma-separated list of 8-12 SEO and search keywords relevant to this recipe, e.g. weeknight dinner, easy chicken thighs, spice blend recipe, quick sheet pan meal"
}`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  try {
    const parsed = JSON.parse(text)
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ about: text, why: '', steps: '', considerations: '', nutrition: '', keywords: '' })
  }
}
