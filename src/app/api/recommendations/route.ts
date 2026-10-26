import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export interface Recommendation {
  id: string
  icon: string          // lucide icon name
  title: string         // short action verb phrase
  detail: string        // supporting detail (1 line)
  prompt: string        // what to send to Rose Mary when clicked
  type: 'task' | 'inventory' | 'marketing' | 'revenue' | 'system'
  priority: number      // 0 = highest
}

// GET /api/recommendations — curated proactive action items from agent morning analysis
export async function GET() {
  try {
  const db = getDb()
  const recs: Recommendation[] = []
  let priority = 0

  // 1. Overdue tasks — most specific: name the tasks
  const overdueTasks = db.prepare(`
    SELECT t.id, t.title, t.due_date, t.priority, p.name as project
    FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
    WHERE t.status != 'done' AND t.due_date < date('now')
    ORDER BY t.due_date ASC LIMIT 3
  `).all() as { id: number; title: string; due_date: string; priority: string; project: string }[]

  for (const t of overdueTasks) {
    recs.push({
      id: `overdue-${t.id}`,
      icon: 'CheckSquare',
      title: t.title.length > 38 ? t.title.slice(0, 36) + '…' : t.title,
      detail: `Overdue since ${new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${t.project ? ` · ${t.project}` : ''}`,
      prompt: `Show me task #${t.id} ("${t.title}") — what's its current status and what do I need to do to complete or reschedule it?`,
      type: 'task',
      priority: priority++,
    })
  }

  // 2. Urgent tasks due soon (not overdue)
  const urgentSoon = db.prepare(`
    SELECT t.id, t.title, t.due_date, p.name as project
    FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
    WHERE t.status != 'done' AND t.priority = 'urgent'
      AND t.due_date >= date('now') AND t.due_date <= date('now', '+7 days')
    ORDER BY t.due_date ASC LIMIT 2
  `).all() as { id: number; title: string; due_date: string; project: string }[]

  for (const t of urgentSoon) {
    recs.push({
      id: `urgent-${t.id}`,
      icon: 'Zap',
      title: t.title.length > 38 ? t.title.slice(0, 36) + '…' : t.title,
      detail: `Urgent · due ${new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      prompt: `Show me task #${t.id} ("${t.title}") — walk me through what's needed to complete it before the deadline.`,
      type: 'task',
      priority: priority++,
    })
  }

  // 3. Low-stock Shopify products (finished goods needing restock)
  const lowStock = db.prepare(`
    SELECT sp.title as name, sp.inventory_quantity as qty,
           COALESCE(sis.reorder_threshold, 12) as threshold
    FROM shopify_products sp
    LEFT JOIN shopify_inventory_settings sis ON sis.shopify_product_id = sp.shopify_id
    WHERE sp.status = 'active' AND sp.is_bundle = 0
      AND sp.inventory_quantity <= COALESCE(sis.reorder_threshold, 12)
    ORDER BY sp.inventory_quantity ASC
    LIMIT 2
  `).all() as { name: string; qty: number; threshold: number }[]

  for (const s of lowStock) {
    const shortName = s.name.length > 30 ? s.name.slice(0, 28) + '…' : s.name
    recs.push({
      id: `stock-${s.name.slice(0, 20)}`,
      icon: 'Package',
      title: `Restock ${shortName}`,
      detail: s.qty < 0 ? `${Math.abs(s.qty)} oversold on Shopify` : `${s.qty} left · reorder at ${s.threshold}`,
      prompt: `How should I handle restocking "${s.name}"? It's ${s.qty < 0 ? 'oversold' : `at ${s.qty} units`}.`,
      type: 'inventory',
      priority: priority++,
    })
  }

  // 4. Klaviyo: low click rate → suggest a re-engagement
  const emailMetric = db.prepare(`
    SELECT value_30d FROM klaviyo_metrics WHERE LOWER(metric_name) LIKE '%click%' LIMIT 1
  `).get() as { value_30d: number } | undefined

  const listSize = db.prepare(`SELECT SUM(profile_count) as total FROM klaviyo_lists WHERE LOWER(name) LIKE '%email%'`).get() as { total: number | null } | undefined

  if (emailMetric && emailMetric.value_30d < 2) {
    recs.push({
      id: 'email-click-rate',
      icon: 'Mail',
      title: 'Boost email click rate',
      detail: `${emailMetric.value_30d}% click rate · ${listSize?.total ?? 37} subscribers`,
      prompt: 'Our email click rate is low. Help me draft a re-engagement email for our subscriber list that will drive clicks.',
      type: 'marketing',
      priority: priority++,
    })
  }

  // 5. Agent flags (system-level things agents surfaced)
  const flags = db.prepare(`
    SELECT item_type, item_name, reason, urgency FROM agent_flags
    WHERE status = 'open' ORDER BY created_at DESC LIMIT 2
  `).all() as { item_type: string; item_name: string; reason: string; urgency: string }[]

  for (const f of flags) {
    recs.push({
      id: `flag-${f.item_name.slice(0, 20)}`,
      icon: 'AlertCircle',
      title: f.item_name.length > 38 ? f.item_name.slice(0, 36) + '…' : f.item_name,
      detail: f.reason.slice(0, 80),
      prompt: `Tell me about the issue with "${f.item_name}" and what I should do about it.`,
      type: 'system',
      priority: priority++,
    })
  }

  // 6. Meta Ads: no campaign data synced
  const metaConfig = db.prepare('SELECT account_name FROM meta_ads_config LIMIT 1').get()
  const metaCampaigns = db.prepare('SELECT COUNT(*) as count FROM meta_ads_campaigns').get() as { count: number }
  if (metaConfig && metaCampaigns.count === 0) {
    recs.push({
      id: 'meta-sync',
      icon: 'Megaphone',
      title: 'Sync Meta Ads data',
      detail: 'Campaign performance not yet cached — sync to see spend & results',
      prompt: 'Can you show me what Meta Ads campaigns we have running and how they\'re performing?',
      type: 'marketing',
      priority: priority++,
    })
  }

  return NextResponse.json({ recommendations: recs.slice(0, 5) })
  } catch (err) {
    console.error('recommendations error:', err)
    return NextResponse.json({ recommendations: [], error: String(err) })
  }
}
