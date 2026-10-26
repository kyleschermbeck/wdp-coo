import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { fetchRecentEmails } from '@/lib/gmail'
import { analyzeEmail } from '@/lib/ai'

export async function POST() {
  try {
    const db = await getDb()
    const { emails, listCalls, getCalls } = await fetchRecentEmails(50)
    console.log(`[sync] fetched ${emails.length} emails (${listCalls} list + ${getCalls} get calls)`)
    if (emails.length === 0) return NextResponse.json({ synced: 0, message: 'No emails returned from Gmail' })

    const upsertSql = `
      INSERT INTO email_cache (gmail_id, thread_id, subject, from_email, from_name, date, snippet, body_text, body_html, is_read, is_sent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(gmail_id) DO UPDATE SET
        is_read = excluded.is_read,
        is_sent = excluded.is_sent,
        snippet = excluded.snippet,
        body_text = excluded.body_text,
        body_html = excluded.body_html
    `
    const setAnalysisSql = `UPDATE email_cache SET category = ?, priority = ?, ai_summary = ? WHERE gmail_id = ?`
    const logUsageSql = `INSERT INTO api_usage (operation, model, input_tokens, output_tokens) VALUES (?, ?, ?, ?)`
    const getByGmailIdSql = 'SELECT id, ai_summary FROM email_cache WHERE gmail_id = ?'

    if (listCalls > 0) await db.execute({ sql: logUsageSql, args: ['gmail_list', 'gmail', listCalls, 0] })
    if (getCalls > 0) await db.execute({ sql: logUsageSql, args: ['gmail_get', 'gmail', getCalls, 0] })

    let newCount = 0
    for (const email of emails) {
      const existing = (await db.execute({ sql: getByGmailIdSql, args: [email.gmail_id] })).rows[0] as unknown as { id: number; ai_summary: string } | undefined
      await db.execute({ sql: upsertSql, args: [
        email.gmail_id, email.thread_id, email.subject,
        email.from_email, email.from_name, email.date,
        email.snippet, email.body_text, email.body_html, email.is_read, email.is_sent
      ]})
      if (!existing?.ai_summary) {
        newCount++
        try {
          const { analysis, usage } = await analyzeEmail(
            email.subject, email.from_email, email.snippet, email.body_text
          )
          await db.execute({ sql: setAnalysisSql, args: [analysis.category, analysis.priority, analysis.summary, email.gmail_id] })
          await db.execute({ sql: logUsageSql, args: ['analyze', 'claude-haiku-4-5-20251001', usage.input_tokens, usage.output_tokens] })
        } catch {
          await db.execute({ sql: setAnalysisSql, args: ['other', 2, email.snippet.slice(0, 100), email.gmail_id] })
        }
      }
    }

    return NextResponse.json({ synced: emails.length, analyzed: newCount })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
