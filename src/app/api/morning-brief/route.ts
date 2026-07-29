import { NextResponse } from 'next/server'
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

export async function GET() {
  const db = getDb()
  const row = db.prepare(`SELECT value, updated_at FROM settings_kv WHERE key = 'morning_brief'`).get() as
    | { value: string; updated_at: string }
    | undefined

  if (!row) return NextResponse.json({ brief: null, stale: true })

  const today = new Date().toISOString().slice(0, 10)
  const briefDate = row.updated_at?.slice(0, 10) ?? ''

  return NextResponse.json({ brief: row.value, date: briefDate, generatedAt: row.updated_at, stale: briefDate !== today })
}

export async function POST() {
  const db = getDb()
  const apiKey = getApiKey()
  if (!apiKey) return NextResponse.json({ error: 'No API key configured' }, { status: 400 })

  const tasks = db.prepare(`
    SELECT t.title, t.status, t.priority, t.due_date, p.name as project_name
    FROM tasks t LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.status != 'done'
    ORDER BY CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END
    LIMIT 20
  `).all()

  const lowStock = db.prepare(`
    SELECT sp.title as name, sp.inventory_quantity as quantity_on_hand,
           COALESCE(sis.reorder_threshold, 12) as reorder_threshold
    FROM shopify_products sp
    LEFT JOIN shopify_inventory_settings sis ON sis.shopify_product_id = sp.shopify_id
    WHERE sp.status = 'active' AND sp.is_bundle = 0
      AND sp.inventory_quantity <= COALESCE(sis.reorder_threshold, 12)
    ORDER BY sp.inventory_quantity ASC
  `).all()

  const orderSummary = db.prepare(`
    SELECT COUNT(*) as orders, ROUND(SUM(total_price), 2) as revenue
    FROM shopify_orders WHERE financial_status = 'paid' AND created_at >= datetime('now', '-30 days')
  `).get()

  const projects = db.prepare(`
    SELECT p.name, p.status, COUNT(t.id) as task_count,
           SUM(CASE WHEN t.status='done' THEN 1 ELSE 0 END) as done_count
    FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
    WHERE p.status NOT IN ('complete', 'archived', 'completed')
    GROUP BY p.id
    ORDER BY p.created_at DESC
    LIMIT 8
  `).all()

  const igConnected = db.prepare('SELECT username FROM instagram_config WHERE id = 1').get() as { username: string | null } | undefined
  const klaviyoLists = db.prepare('SELECT name, profile_count FROM klaviyo_lists ORDER BY profile_count DESC LIMIT 3').all()
  const klaviyoMetrics = db.prepare('SELECT metric_name, value_30d FROM klaviyo_metrics ORDER BY updated_at DESC').all()

  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  const marketingParts: string[] = []
  if (igConnected?.username) marketingParts.push(`Instagram: @${igConnected.username} connected`)
  if ((klaviyoLists as unknown[]).length) marketingParts.push(`Email lists: ${JSON.stringify(klaviyoLists)}`)
  if ((klaviyoMetrics as unknown[]).length) marketingParts.push(`Email metrics (30d): ${JSON.stringify(klaviyoMetrics)}`)

  const context = [
    `Date: ${dateStr}`,
    `Open tasks (${(tasks as unknown[]).length}): ${JSON.stringify(tasks)}`,
    `Low stock alerts: ${JSON.stringify(lowStock)}`,
    `Orders & revenue (last 30d): ${JSON.stringify(orderSummary)}`,
    `Active projects: ${JSON.stringify(projects)}`,
    ...(marketingParts.length ? [`Marketing: ${marketingParts.join(' | ')}`] : []),
  ].join('\n')

  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: `You are Rose Mary, the AI COO for Weeknight Dinner Party — a spice blend brand sold DTC, wholesale, and online. Generate a concise morning brief for the owner. Be warm, specific, and actionable — like a trusted COO who has reviewed everything before the owner wakes up. Use markdown. Structure: **one punchy headline sentence** (no header), then **Today's Focus** (2-3 bullets, most urgent items), **Quick Wins** (1-2 bullets, small things to knock out), and **Looking Ahead** (one sentence about what's coming). If marketing data is present, weave relevant insights (email engagement, subscriber growth, social reach) into the brief naturally — don't create a separate section. Keep it under 200 words total.`,
    messages: [{ role: 'user', content: `Generate today's morning brief from this business data:\n\n${context}` }],
  })

  const brief = response.content[0].type === 'text' ? response.content[0].text : ''

  db.prepare(`
    INSERT INTO settings_kv (key, value, updated_at) VALUES ('morning_brief', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(brief)

  try {
    db.prepare('INSERT INTO api_usage (operation, model, input_tokens, output_tokens) VALUES (?, ?, ?, ?)')
      .run('morning_brief', 'claude-sonnet-4-6', response.usage.input_tokens, response.usage.output_tokens)
  } catch { /* ignore */ }

  return NextResponse.json({ brief, date: new Date().toISOString().slice(0, 10) })
}
