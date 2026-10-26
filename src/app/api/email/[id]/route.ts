import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { trashEmail } from '@/lib/gmail'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb()
    const { id } = await params
    const body = await req.json()

    if (body.category !== undefined) {
      await db.execute({sql: 'UPDATE email_cache SET category = ? WHERE id = ?', args: [body.category, id]})
    }
    if (body.is_read !== undefined) {
      await db.execute({sql: 'UPDATE email_cache SET is_read = ? WHERE id = ?', args: [body.is_read, id]})
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb()
    const { id } = await params
    const email = (await db.execute({sql: 'SELECT gmail_id FROM email_cache WHERE id = ?', args: [id]})).rows[0] as unknown as { gmail_id: string } | undefined
    if (email) {
      try { await trashEmail(email.gmail_id) } catch {}
    }
    await db.execute({sql: 'DELETE FROM email_cache WHERE id = ?', args: [id]})
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
