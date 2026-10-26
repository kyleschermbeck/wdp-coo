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

interface ChatMessage { role: 'user' | 'assistant'; content: string }

// POST /api/chat/summarize — summarize a conversation and extract memorable insights
export async function POST(req: NextRequest) {
  const apiKey = getApiKey()
  if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 400 })

  const { messages } = await req.json() as { messages: ChatMessage[] }
  if (!messages || messages.length < 2) {
    return NextResponse.json({ summary: 'Short conversation — nothing significant to save.', memories: [] })
  }

  const client = new Anthropic({ apiKey })

  // Build a transcript excerpt (cap at last 30 messages to stay within limits)
  const recent = messages.slice(-30)
  const transcript = recent
    .map(m => `${m.role === 'user' ? 'Kyle' : 'Rose Mary'}: ${m.content.slice(0, 500)}`)
    .join('\n\n')

  const prompt = `You are summarizing a conversation between Kyle (business owner of Weeknight Dinner Party) and Rose Mary (his AI COO assistant).

Conversation:
---
${transcript}
---

Your job:
1. Write a 2-3 sentence SUMMARY of what was discussed and accomplished.
2. Extract up to 5 MEMORABLE INSIGHTS — things Rose Mary should remember for future conversations. Focus on:
   - Decisions Kyle made
   - Preferences or priorities Kyle expressed
   - Important business context shared
   - Action items or commitments made
   - Problems identified or resolved

Return as JSON in this exact format:
{
  "summary": "...",
  "memories": [
    { "text": "Kyle decided to prioritize X over Y", "type": "feedback" },
    { "text": "WDP is launching a new product line in Q4", "type": "project" }
  ]
}

Types: "feedback" (Kyle's preferences/guidance), "project" (ongoing work/goals), "user" (personal preferences), "reference" (external info)
Only include memories worth retaining — skip trivial exchanges.`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0]?.type === 'text' ? response.content[0].text : ''

  try {
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as {
      summary: string
      memories: Array<{ text: string; type: string }>
    }
    return NextResponse.json({
      summary: parsed.summary ?? 'No summary available.',
      memories: parsed.memories ?? [],
    })
  } catch {
    return NextResponse.json({
      summary: text.slice(0, 300),
      memories: [],
    })
  }
}
