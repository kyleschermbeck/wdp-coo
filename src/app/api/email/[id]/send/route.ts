import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { sendReply } from '@/lib/gmail'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb()
    const { id } = await params
    const { draft_id, draft_body, signatureHtml, fromName, fromEmail } = await req.json()

    const email = (await db.execute({sql: 'SELECT * FROM email_cache WHERE id = ?', args: [id]})).rows[0] as unknown as Record<string, unknown> | undefined
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

    await db.execute({sql: 'UPDATE email_drafts SET status = ? WHERE id = ?', args: ['sent', draft_id]})
    await db.execute({sql: 'UPDATE email_cache SET is_read = 1 WHERE id = ?', args: [id]})

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
