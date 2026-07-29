import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_: NextRequest, { params }: Params) {
  const { id } = await params
  const db = getDb()
  db.prepare('DELETE FROM task_attachments WHERE id = ?').run(id)
  return NextResponse.json({ ok: true })
}
