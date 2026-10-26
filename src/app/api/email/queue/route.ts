import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export interface QueuedEmail {
  id: number
  to_email: string | null
  to_name: string | null
  subject: string
  body: string
  context: string | null
  status: string
  created_at: string
  reviewed_at: string | null
}

// GET /api/email/queue — list agent-drafted emails
export async function GET() {
  try {
    const db = getDb()
    const emails = db.prepare(
      `SELECT * FROM agent_email_queue ORDER BY created_at DESC`
    ).all() as QueuedEmail[]
    return NextResponse.json({ emails })
  } catch {
    return NextResponse.json({ emails: [] })
  }
}

// PATCH /api/email/queue — approve or dismiss a queued email
export async function PATCH(req: NextRequest) {
  try {
    const { id, action } = await req.json() as { id: number; action: 'approve' | 'dismiss' | 'delete' }
    const db = getDb()

    if (action === 'delete') {
      db.prepare(`DELETE FROM agent_email_queue WHERE id = ?`).run(id)
      return NextResponse.json({ ok: true })
    }

    const status = action === 'approve' ? 'approved' : 'dismissed'
    db.prepare(
      `UPDATE agent_email_queue SET status = ?, reviewed_at = datetime('now') WHERE id = ?`
    ).run(status, id)

    return NextResponse.json({ ok: true, status })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
