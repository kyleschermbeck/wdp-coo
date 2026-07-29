import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { trashEmail } from '@/lib/gmail'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb()
    const { id } = await params
    const body = await req.json()

    if (body.category !== undefined) {
      db.prepare('UPDATE email_cache SET category = ? WHERE id = ?').run(body.category, id)
    }
    if (body.is_read !== undefined) {
      db.prepare('UPDATE email_cache SET is_read = ? WHERE id = ?').run(body.is_read, id)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb()
    const { id } = await params
    const email = db.prepare('SELECT gmail_id FROM email_cache WHERE id = ?').get(id) as { gmail_id: string } | undefined
    if (email) {
      try { await trashEmail(email.gmail_id) } catch {}
    }
    db.prepare('DELETE FROM email_cache WHERE id = ?').run(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
