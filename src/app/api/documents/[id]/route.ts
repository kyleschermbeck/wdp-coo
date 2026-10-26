import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { unlinkSync } from 'fs'
import { join } from 'path'

const DOCS_DIR = join(process.cwd(), 'data', 'docs')

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await getDb()

  const doc = ((await db.execute({sql: 'SELECT * FROM documents WHERE id = ?', args: [Number(id)]})).rows[0]) as unknown as { filename: string } | undefined
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try { unlinkSync(join(DOCS_DIR, doc.filename)) } catch {}

  await db.execute({sql: 'DELETE FROM documents_fts WHERE rowid = ?', args: [Number(id)]})
  await db.execute({sql: 'DELETE FROM documents WHERE id = ?', args: [Number(id)]})

  return NextResponse.json({ ok: true })
}
