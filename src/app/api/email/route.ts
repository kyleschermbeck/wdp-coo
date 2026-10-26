import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { loadTokens } from '@/lib/gmail'

export async function GET(req: NextRequest) {
  try {
    const db = await getDb()
    const tokens = await loadTokens()
    const connected = !!tokens?.refresh_token

    const category = req.nextUrl.searchParams.get('category')

    // Inbox emails (non-sent), filtered by category if provided
    const inboxConditions: string[] = ['e.is_sent = 0']
    const inboxArgs: unknown[] = []

    if (category && category !== 'all') {
      inboxConditions.push('e.category = ?')
      inboxArgs.push(category)
    }

    const inboxQuery = `
      SELECT e.*, d.draft_body, d.status as draft_status, d.id as draft_id
      FROM email_cache e
      LEFT JOIN email_drafts d ON d.email_id = e.id AND d.status != 'sent'
      WHERE ${inboxConditions.join(' AND ')}
      ORDER BY e.date DESC
    `
    const emails = (await db.execute({sql: inboxQuery, args: inboxArgs as (string | number | boolean | null | bigint)[]})).rows

    // Sent emails
    const sent = (await db.execute({sql: `
      SELECT e.*, NULL as draft_body, NULL as draft_status, NULL as draft_id
      FROM email_cache e
      WHERE e.is_sent = 1
      ORDER BY e.date DESC
    `, args: []})).rows

    // Counts per category (inbox only, for tab badges)
    const rawCounts = (await db.execute({sql: `
      SELECT category, COUNT(*) as count
      FROM email_cache
      WHERE is_sent = 0
      GROUP BY category
    `, args: []})).rows as unknown as { category: string; count: number }[]

    const counts: Record<string, number> = {}
    for (const row of rawCounts) counts[row.category] = row.count

    return NextResponse.json({ connected, emails, sent, counts })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
