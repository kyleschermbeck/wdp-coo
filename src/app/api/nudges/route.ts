import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// ── Proactive nudges — scanned on every chat load ──────────────────────────
// No AI cost. Pure DB logic surfaces things worth mentioning proactively.

export interface Nudge {
  id: string
  type: 'alert' | 'warning' | 'suggestion' | 'info'
  title: string
  body: string
  chip?: string   // suggested follow-up to send into chat
  icon: string    // lucide icon name
}

export async function GET() {
  const db = await getDb()
  const nudges: Nudge[] = []
  const today = new Date().toISOString().slice(0, 10)

  // ── 1. Overdue tasks ──────────────────────────────────────────────────────
  const overdue = (await db.execute({sql: `SELECT id, title, due_date FROM tasks WHERE status != 'done' AND due_date < ? ORDER BY due_date LIMIT 3`, args: [today]})).rows as unknown as { id: number; title: string; due_date: string }[]
  if (overdue.length > 0) {
    nudges.push({
      id: 'overdue-tasks',
      type: 'alert',
      title: `${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}`,
      body: overdue.map(t => `**${t.title}** — due ${formatDate(t.due_date)}`).join('\n'),
      chip: 'Walk me through overdue tasks',
      icon: 'AlertCircle',
    })
  }

  // ── 2. Critical inventory (negative or ≤ 3 units) ────────────────────────
  const criticalStock = (await db.execute({sql: `
    SELECT sp.title, sp.inventory_quantity
    FROM shopify_products sp
    WHERE sp.status = 'active' AND sp.is_bundle = 0 AND sp.inventory_quantity <= 3
    ORDER BY sp.inventory_quantity ASC
    LIMIT 4
  `, args: []})).rows as unknown as { title: string; inventory_quantity: number }[]
  if (criticalStock.length > 0) {
    const negative = criticalStock.filter(p => p.inventory_quantity < 0)
    const lines = criticalStock.map(p => {
      const qty = p.inventory_quantity
      const label = qty < 0 ? `**${p.title}** — ${qty} (Shopify oversell — needs recount)` : `**${p.title}** — ${qty} unit${qty === 1 ? '' : 's'} left`
      return label
    })
    nudges.push({
      id: 'critical-stock',
      type: 'alert',
      title: negative.length > 0
        ? `${negative.length} SKU with negative stock`
        : `${criticalStock.length} SKU${criticalStock.length > 1 ? 's' : ''} critically low`,
      body: lines.join('\n'),
      chip: 'Review inventory and reorder plan',
      icon: 'Package',
    })
  }

  // ── 3. Open agent flags ───────────────────────────────────────────────────
  try {
    const flags = (await db.execute({sql: `SELECT item_name, reason, urgency FROM agent_flags WHERE status = 'open' AND urgency = 'high' ORDER BY created_at DESC LIMIT 2`, args: []})).rows as unknown as { item_name: string; reason: string; urgency: string }[]
    if (flags.length > 0) {
      nudges.push({
        id: 'open-flags',
        type: 'warning',
        title: `${flags.length} high-priority flag${flags.length > 1 ? 's' : ''}`,
        body: flags.map(f => `**${f.item_name}** — ${f.reason}`).join('\n'),
        chip: 'Review flagged items',
        icon: 'Flag',
      })
    }
  } catch { /* table may not exist yet */ }

  // ── 4. Email queue has drafts ─────────────────────────────────────────────
  try {
    const pendingEmails = (await db.execute({sql: `SELECT COUNT(*) as count FROM agent_email_queue WHERE status = 'pending_review'`, args: []})).rows[0] as unknown as { count: number }
    if (pendingEmails.count > 0) {
      nudges.push({
        id: 'email-queue',
        type: 'info',
        title: `${pendingEmails.count} email draft${pendingEmails.count > 1 ? 's' : ''} awaiting review`,
        body: `Your COO drafted ${pendingEmails.count === 1 ? 'an email' : `${pendingEmails.count} emails`} ready for your review before sending.`,
        chip: 'Show me the email drafts',
        icon: 'Mail',
      })
    }
  } catch { /* table may not exist yet */ }

  // ── 5. Email list not contacted recently ─────────────────────────────────
  try {
    const lastCampaign = (await db.execute({sql: `SELECT send_time FROM klaviyo_campaigns WHERE status = 'sent' ORDER BY send_time DESC LIMIT 1`, args: []})).rows[0] as unknown as { send_time: string } | undefined
    if (lastCampaign) {
      const daysSince = Math.floor((Date.now() - new Date(lastCampaign.send_time).getTime()) / (1000 * 60 * 60 * 24))
      if (daysSince >= 10) {
        const listSize = (await db.execute({sql: 'SELECT SUM(profile_count) as t FROM klaviyo_lists', args: []})).rows[0] as unknown as { t: number | null }
        nudges.push({
          id: 'email-gap',
          type: 'suggestion',
          title: `${daysSince} days since last email`,
          body: `Your list of ${(listSize?.t ?? 0).toLocaleString()} subscribers hasn't heard from you since ${formatDate(lastCampaign.send_time)}.`,
          chip: 'Draft an email campaign',
          icon: 'Inbox',
        })
      }
    }
  } catch { /* no campaigns */ }

  // ── 6. Revenue below pace ─────────────────────────────────────────────────
  try {
    const thisWeek = (await db.execute({sql: `
      SELECT ROUND(SUM(total_price), 2) as rev
      FROM shopify_orders WHERE financial_status = 'paid' AND created_at >= datetime('now', '-7 days')
    `, args: []})).rows[0] as unknown as { rev: number | null }
    const lastWeek = (await db.execute({sql: `
      SELECT ROUND(SUM(total_price), 2) as rev
      FROM shopify_orders WHERE financial_status = 'paid'
        AND created_at >= datetime('now', '-14 days') AND created_at < datetime('now', '-7 days')
    `, args: []})).rows[0] as unknown as { rev: number | null }
    const tw = thisWeek.rev ?? 0
    const lw = lastWeek.rev ?? 0
    if (lw > 0 && tw < lw * 0.6) {
      const drop = Math.round(((lw - tw) / lw) * 100)
      nudges.push({
        id: 'revenue-drop',
        type: 'warning',
        title: `Revenue down ${drop}% vs last week`,
        body: `This week: $${tw.toLocaleString()} · Last week: $${lw.toLocaleString()}. Worth investigating.`,
        chip: "What's driving the revenue drop?",
        icon: 'TrendingDown',
      })
    }
  } catch { /* ignore */ }

  // ── 7. Urgent tasks ───────────────────────────────────────────────────────
  if (overdue.length === 0) {
    const urgent = (await db.execute({sql: `SELECT title FROM tasks WHERE status != 'done' AND priority = 'urgent' LIMIT 2`, args: []})).rows as unknown as { title: string }[]
    if (urgent.length > 0) {
      nudges.push({
        id: 'urgent-tasks',
        type: 'warning',
        title: `${urgent.length} urgent task${urgent.length > 1 ? 's' : ''} open`,
        body: urgent.map(t => `**${t.title}**`).join('\n'),
        chip: 'Prioritize my urgent tasks',
        icon: 'Zap',
      })
    }
  }

  return NextResponse.json({ nudges: nudges.slice(0, 4) })
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr + (dateStr.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric',
    })
  } catch {
    return dateStr
  }
}
