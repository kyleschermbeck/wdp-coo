import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json([])

  const db = getDb()

  const results = db.prepare(`
    SELECT d.id, d.original_name, d.file_type, d.task_id, t.title as task_title,
           snippet(documents_fts, 0, '<mark>', '</mark>', '…', 32) as excerpt
    FROM documents_fts
    JOIN documents d ON d.id = documents_fts.rowid
    LEFT JOIN tasks t ON t.id = d.task_id
    WHERE documents_fts MATCH ?
    ORDER BY rank
    LIMIT 5
  `).all(q) as {
    id: number; original_name: string; file_type: string
    task_id: number | null; task_title: string | null; excerpt: string
  }[]

  return NextResponse.json(results)
}
