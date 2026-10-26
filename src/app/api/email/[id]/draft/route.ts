import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { generateDraft } from '@/lib/ai'

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb()
    const { id } = await params
    const email = (await db.execute({sql: 'SELECT * FROM email_cache WHERE id = ?', args: [id]})).rows[0] as unknown as Record<string, unknown> | undefined
    if (!email) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { draft, usage } = await generateDraft(
      email.subject as string,
      email.from_name as string,
      email.from_email as string,
      (email.body_text as string) || (email.snippet as string),
    )

    await db.execute({sql: 'DELETE FROM email_drafts WHERE email_id = ? AND status = ?', args: [id, 'pending']})

    const result = await db.execute({sql: 'INSERT INTO email_drafts (email_id, draft_body, status) VALUES (?, ?, ?)', args: [id, draft, 'pending']})

    await db.execute({sql: 'INSERT INTO api_usage (operation, model, input_tokens, output_tokens) VALUES (?, ?, ?, ?)', args: ['draft', 'claude-sonnet-4-6', usage.input_tokens, usage.output_tokens]})

    return NextResponse.json({
      id: Number(result.lastInsertRowid),
      email_id: Number(id),
      draft_body: draft,
      status: 'pending',
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb()
    const { id } = await params
    const { draft_id, draft_body } = await req.json()
    await db.execute({sql: 'UPDATE email_drafts SET draft_body = ? WHERE id = ? AND email_id = ?', args: [draft_body, draft_id, id]})
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
