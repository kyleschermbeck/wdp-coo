import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const db = await getDb()
    const { ids } = await req.json() as { ids: number[] }
    if (!Array.isArray(ids)) return NextResponse.json({ error: 'ids array required' }, { status: 400 })

    for (let idx = 0; idx < ids.length; idx++) {
      await db.execute({ sql: 'UPDATE subtasks SET sort_order = ? WHERE id = ?', args: [idx, ids[idx]] })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
