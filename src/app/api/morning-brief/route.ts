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

// ── Structured brief data extracted directly from DB (no AI cost) ──────────────
export interface BriefSection {
  icon: 'revenue' | 'inventory' | 'task' | 'email' | 'campaign' | 'project' | 'meta'
  color: 'positive' | 'warning' | 'alert' | 'neutral'
  label: string
  value: string
  meta?: string
}

export interface BriefData {
  sections: BriefSection[]
  question?: string
  chips: string[]
  date: string
  ga?: {
    sessions7d: number; pageViews7d: number; bounceRate: number
    avgSessionDurationFmt: string; topChannel: string | null
    topPages: Array<{ path: string; title: string; views: number }>
    trend: Array<{ date: string; sessions: number }>
  }
}

async function buildBriefData(db: ReturnType<typeof getDb>): Promise<BriefData> {
  const sections: BriefSection[] = []

  // Revenue (30d) — matches financials tab: exclude only voided/refunded orders
  const orders = db.prepare(`
    SELECT COUNT(*) as count, ROUND(SUM(total_price), 2) as revenue
    FROM shopify_orders
    WHERE financial_status NOT IN ('voided', 'refunded')
      AND created_at >= datetime('now', '-30 days')
  `).get() as { count: number; revenue: number | null } | undefined

  if (orders && (orders.revenue ?? 0) > 0) {
    // Week-over-week comparison
    const lastWeek = db.prepare(`
      SELECT ROUND(SUM(total_price), 2) as revenue
      FROM shopify_orders
      WHERE financial_status NOT IN ('voided', 'refunded')
        AND created_at >= datetime('now', '-14 days')
        AND created_at < datetime('now', '-7 days')
    `).get() as { revenue: number | null } | undefined
    const thisWeek = db.prepare(`
      SELECT ROUND(SUM(total_price), 2) as revenue
      FROM shopify_orders
      WHERE financial_status NOT IN ('voided', 'refunded')
        AND created_at >= datetime('now', '-7 days')
    `).get() as { revenue: number | null } | undefined

    const lw = lastWeek?.revenue ?? 0
    const tw = thisWeek?.revenue ?? 0
    const pct = lw > 0 ? Math.round(((tw - lw) / lw) * 100) : null
    const delta = pct !== null ? (pct >= 0 ? `↑ ${pct}% vs last week` : `↓ ${Math.abs(pct)}% vs last week`) : undefined

    sections.push({
      icon: 'revenue',
      color: pct !== null && pct < -15 ? 'warning' : 'positive',
      label: 'Revenue · Last 30 days',
      value: `$${(orders.revenue ?? 0).toLocaleString()}${delta ? `  ${delta}` : ''}`,
      meta: `${orders.count} orders · $${tw.toLocaleString()} this week`,
    })
  }

  // Low stock
  const lowStockRaw = db.prepare(`
    SELECT sp.title as name, sp.inventory_quantity as qty
    FROM shopify_products sp
    LEFT JOIN shopify_inventory_settings sis ON sis.shopify_product_id = sp.shopify_id
    WHERE sp.status = 'active' AND sp.is_bundle = 0
      AND sp.inventory_quantity <= COALESCE(sis.reorder_threshold, 12)
    ORDER BY sp.inventory_quantity ASC
    LIMIT 6
  `).all() as { name: string; qty: number }[]

  // Separate negative-stock (Shopify oversell) from genuinely low stock
  const negativeStock = lowStockRaw.filter(s => s.qty < 0)
  const lowStock = lowStockRaw.filter(s => s.qty >= 0)
  const critical = lowStock.filter(s => s.qty <= 3)
  const allLow = [...negativeStock, ...lowStock]

  if (allLow.length > 0) {
    const shortName = (name: string) => name.length > 22 ? name.slice(0, 20) + '…' : name
    sections.push({
      icon: 'inventory',
      color: negativeStock.length > 0 || critical.length > 0 ? 'alert' : 'warning',
      label: `Inventory · ${allLow.length} SKU${allLow.length > 1 ? 's' : ''} need attention`,
      value: negativeStock.length > 0
        ? `${negativeStock.length} negative stock (Shopify oversell)${critical.length > 0 ? ` · ${critical.length} critically low` : ''}`
        : critical.length > 0
          ? `${critical.length} critically low (≤3 units)`
          : `${lowStock.length} below reorder threshold`,
      meta: allLow.slice(0, 3).map(s => `${shortName(s.name)} (${s.qty < 0 ? s.qty : s.qty + ' left'})`).join(' · '),
    })
  }

  // Tasks — overdue and urgent
  const overdue = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE status != 'done' AND due_date < date('now')`).get() as { count: number }
  const urgentTasks = db.prepare(`SELECT title FROM tasks WHERE status != 'done' AND priority = 'urgent' ORDER BY created_at DESC LIMIT 3`).all() as { title: string }[]
  const openCount = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE status != 'done'`).get() as { count: number }

  if (overdue.count > 0 || urgentTasks.length > 0) {
    sections.push({
      icon: 'task',
      color: overdue.count > 2 ? 'alert' : 'warning',
      label: overdue.count > 0
        ? `Tasks · ${overdue.count} overdue`
        : `Tasks · ${urgentTasks.length} urgent`,
      value: urgentTasks.length > 0
        ? urgentTasks.slice(0, 2).map(t => t.title).join(' · ')
        : `${overdue.count} task${overdue.count > 1 ? 's' : ''} past due date`,
      meta: `${openCount.count} total open tasks`,
    })
  }

  // Klaviyo email metrics
  const openRateRow = db.prepare(`SELECT value_30d FROM klaviyo_metrics WHERE LOWER(metric_name) LIKE '%open%' LIMIT 1`).get() as { value_30d: number } | undefined
  const clickRateRow = db.prepare(`SELECT value_30d FROM klaviyo_metrics WHERE LOWER(metric_name) LIKE '%click%' LIMIT 1`).get() as { value_30d: number } | undefined
  const listSize = db.prepare(`SELECT SUM(profile_count) as total FROM klaviyo_lists`).get() as { total: number | null } | undefined

  if (openRateRow || clickRateRow) {
    const openPct = openRateRow?.value_30d ?? null
    const clickPct = clickRateRow?.value_30d ?? null
    sections.push({
      icon: 'email',
      color: (openPct !== null && openPct < 30) ? 'warning' : 'neutral',
      label: 'Klaviyo · Email performance',
      value: [
        openPct !== null ? `${openPct}% open rate` : null,
        clickPct !== null ? `${clickPct}% click rate` : null,
      ].filter(Boolean).join('  ·  '),
      meta: listSize?.total ? `${listSize.total.toLocaleString()} subscribers` : undefined,
    })
  }

  // Active projects snapshot — count ALL, display top 3 names
  const allActiveProjects = db.prepare(`
    SELECT p.name, COUNT(t.id) as task_count, SUM(CASE WHEN t.status='done' THEN 1 ELSE 0 END) as done_count
    FROM projects p LEFT JOIN tasks t ON t.project_id = p.id
    WHERE p.status NOT IN ('complete','archived','completed')
    GROUP BY p.id ORDER BY p.created_at DESC
  `).all() as { name: string; task_count: number; done_count: number }[]

  if (allActiveProjects.length > 0) {
    const total = allActiveProjects.reduce((s, p) => s + p.task_count, 0)
    const done = allActiveProjects.reduce((s, p) => s + (p.done_count ?? 0), 0)
    const pct = total > 0 ? Math.round((done / total) * 100) : 0
    const topThree = allActiveProjects.slice(0, 3)
    sections.push({
      icon: 'project',
      color: 'neutral',
      label: `Projects · ${allActiveProjects.length} active`,
      value: `${done}/${total} tasks complete (${pct}%)`,
      meta: topThree.map(p => p.name).join(' · ') + (allActiveProjects.length > 3 ? ` +${allActiveProjects.length - 3} more` : ''),
    })
  }

  // Meta Ads snapshot
  const metaConfig = db.prepare('SELECT account_name FROM meta_ads_config LIMIT 1').get() as { account_name: string } | undefined
  if (metaConfig) {
    const campaigns = db.prepare("SELECT name, COALESCE(effective_status, status) as status, spend, impressions, clicks, ctr, synced_at FROM meta_ads_campaigns ORDER BY spend DESC").all() as Array<{
      name: string; status: string; spend: number; impressions: number; clicks: number; ctr: number | null; synced_at: string
    }>
    const totalSpend   = campaigns.reduce((s, c) => s + (c.spend ?? 0), 0)
    const activeCount  = campaigns.filter(c => c.status === 'ACTIVE').length
    const latestSync   = campaigns[0]?.synced_at

    if (campaigns.length > 0) {
      const topCampaign = campaigns[0]
      sections.push({
        icon: 'meta',
        color: activeCount > 0 ? 'neutral' : 'warning',
        label: `Meta Ads · ${activeCount} active campaign${activeCount !== 1 ? 's' : ''}`,
        value: `$${totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })} spend · ${campaigns.length} total`,
        meta: topCampaign ? `Top: ${topCampaign.name.length > 28 ? topCampaign.name.slice(0, 26) + '…' : topCampaign.name}` : undefined,
      })
    } else {
      sections.push({
        icon: 'meta',
        color: 'neutral',
        label: 'Meta Ads · Connected',
        value: metaConfig.account_name ?? 'Weeknight Dinner Party',
        meta: latestSync ? undefined : 'No campaign data synced yet — ask Rose Mary to sync',
      })
    }
  }

  // Google Analytics — live 7-day website traffic snapshot
  let gaSnapshot: BriefData['ga'] | undefined
  try {
    const gaRes = await fetch('http://localhost:3000/api/google-analytics/data?days=7')
    if (gaRes.ok) {
      const gaData = await gaRes.json() as {
        summary: { sessions: number; pageViews: number; bounceRate: number; avgSessionDurationFmt: string }
        sources: Array<{ channel: string; sessions: number; pct: number }>
        pages: Array<{ path: string; title: string; views: number }>
        trend: Array<{ date: string; sessions: number; newUsers: number }>
      }
      gaSnapshot = {
        sessions7d:           gaData.summary.sessions,
        pageViews7d:          gaData.summary.pageViews,
        bounceRate:           gaData.summary.bounceRate,
        avgSessionDurationFmt: gaData.summary.avgSessionDurationFmt,
        topChannel:           gaData.sources[0]?.channel ?? null,
        topPages:             (gaData.pages ?? []).slice(0, 5),
        trend:                (gaData.trend ?? []).map(t => ({ date: t.date, sessions: t.sessions })),
      }
      sections.push({
        icon: 'campaign' as const,
        color: 'neutral',
        label: 'Website · Last 7 days',
        value: `${gaData.summary.sessions.toLocaleString()} sessions · ${gaData.summary.pageViews.toLocaleString()} page views`,
        meta: `${gaData.summary.bounceRate.toFixed(0)}% bounce · ${gaData.summary.avgSessionDurationFmt} avg · top: ${gaData.sources[0]?.channel ?? '—'}`,
      })
    }
  } catch { /* GA offline — skip */ }

  // Build smart chips based on what needs attention
  const chips: string[] = []
  if (urgentTasks.length > 0 || overdue.count > 0) chips.push('Walk me through urgent tasks')
  if (lowStock.length > 0) chips.push('Review inventory')
  chips.push("What's the biggest priority today?")
  chips.push('What does my website traffic look like?')
  chips.push('Weekly revenue summary')

  return {
    sections,
    chips: chips.slice(0, 4),
    date: new Date().toISOString().slice(0, 10),
    ga: gaSnapshot,
  }
}

export async function GET() {
  const db = getDb()
  const row = db.prepare(`SELECT value, updated_at FROM settings_kv WHERE key = 'morning_brief'`).get() as
    | { value: string; updated_at: string }
    | undefined

  const today = new Date().toISOString().slice(0, 10)
  const briefDate = row?.updated_at?.slice(0, 10) ?? ''

  // Always return live structured data from DB (no AI cost)
  const briefData = await buildBriefData(db)

  // Also check for a stored question from last generation
  const storedData = db.prepare(`SELECT value FROM settings_kv WHERE key = 'morning_brief_data'`).get() as { value: string } | undefined
  if (storedData) {
    try {
      const parsed = JSON.parse(storedData.value) as { question?: string }
      if (parsed.question) briefData.question = parsed.question
    } catch { /* ignore */ }
  }

  return NextResponse.json({
    brief: row?.value ?? null,
    briefData,
    date: briefDate,
    generatedAt: row?.updated_at,
    stale: !row || briefDate !== today,
  })
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
    FROM shopify_orders
    WHERE financial_status NOT IN ('voided', 'refunded')
      AND created_at >= datetime('now', '-30 days')
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

  // Generate narrative brief + a smart question for the action card
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 700,
    system: `You are the AI COO for Weeknight Dinner Party — a premium spice blend brand sold DTC, wholesale, and online.

Generate two things:
1. A concise morning brief for the owner
2. A single smart follow-up question for the most important thing to act on

Format your response as JSON:
{
  "brief": "the narrative brief in markdown",
  "question": "A single specific question proposing the most important action right now"
}

For the brief: Be warm, specific, and actionable. Structure: **one punchy headline sentence** (no header), then **Today's Focus** (2-3 bullets), **Quick Wins** (1-2 bullets), **Looking Ahead** (one sentence). Under 200 words.

For the question: Make it actionable and specific. Examples: "Want me to pause the Summer Grilling campaign and reallocate the budget?" or "Should I draft the reorder email for SchermCo Jars now?"`,
    messages: [{ role: 'user', content: `Generate today's morning brief and action question from this data:\n\n${context}` }],
  })

  const rawText = response.content[0].type === 'text' ? response.content[0].text : '{}'
  let brief = rawText
  let question: string | undefined

  try {
    // Try to parse as JSON first
    const parsed = JSON.parse(rawText.replace(/^```json\n?/, '').replace(/\n?```$/, '')) as { brief?: string; question?: string }
    brief = parsed.brief ?? rawText
    question = parsed.question
  } catch {
    // Fallback: treat whole response as brief text
    brief = rawText
  }

  // Save narrative brief
  db.prepare(`
    INSERT INTO settings_kv (key, value, updated_at) VALUES ('morning_brief', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(brief)

  // Build and save structured data with the AI-generated question
  const briefData = await buildBriefData(db)
  if (question) briefData.question = question

  db.prepare(`
    INSERT INTO settings_kv (key, value, updated_at) VALUES ('morning_brief_data', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(JSON.stringify(briefData))

  try {
    db.prepare('INSERT INTO api_usage (operation, model, input_tokens, output_tokens) VALUES (?, ?, ?, ?)')
      .run('morning_brief', 'claude-sonnet-4-6', response.usage.input_tokens, response.usage.output_tokens)
  } catch { /* ignore */ }

  return NextResponse.json({
    brief,
    briefData,
    date: new Date().toISOString().slice(0, 10),
  })
}
