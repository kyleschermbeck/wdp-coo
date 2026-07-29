import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { unlink } from 'fs/promises'
import path from 'path'

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'event-attachments')

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const { attachmentId } = await params
  const db = getDb()

  const attachment = db.prepare('SELECT * FROM event_attachments WHERE id = ?').get(attachmentId) as
    | { id: number; filename: string } | undefined

  if (!attachment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Delete file from disk
  try {
    await unlink(path.join(UPLOAD_DIR, attachment.filename))
  } catch {
    // File may already be gone — that's fine
  }

  db.prepare('DELETE FROM event_attachments WHERE id = ?').run(attachmentId)
  return NextResponse.json({ ok: true })
}
