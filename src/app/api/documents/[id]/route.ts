import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { unlinkSync } from 'fs'
import { join } from 'path'

const DOCS_DIR = join(process.cwd(), 'data', 'docs')

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()

  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(Number(id)) as { filename: string } | undefined
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try { unlinkSync(join(DOCS_DIR, doc.filename)) } catch {}

  db.prepare('DELETE FROM documents_fts WHERE rowid = ?').run(Number(id))
  db.prepare('DELETE FROM documents WHERE id = ?').run(Number(id))

  return NextResponse.json({ ok: true })
}
