import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { sendReply } from '@/lib/gmail'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb()
    const { id } = await params
    const { draft_id, draft_body, signatureHtml, fromName, fromEmail } = await req.json()

    const email = db.prepare('SELECT * FROM email_cache WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!email) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await sendReply(
      email.thread_id as string,
      email.from_email as string,
      email.subject as string,
      draft_body,
      undefined,
      signatureHtml ?? undefined,
      fromName ?? undefined,
      fromEmail ?? undefined,
    )

    db.prepare('UPDATE email_drafts SET status = ? WHERE id = ?').run('sent', draft_id)
    db.prepare('UPDATE email_cache SET is_read = 1 WHERE id = ?').run(id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
