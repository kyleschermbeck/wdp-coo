import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function DELETE(_: NextRequest, { params }: Params) {
  const { id } = await params
  const db = await getDb()
  await db.execute({sql: 'DELETE FROM task_attachments WHERE id = ?', args: [id]})
  return NextResponse.json({ ok: true })
}
