import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const db = getDb()
    const { ids } = await req.json() as { ids: number[] }
    if (!Array.isArray(ids)) return NextResponse.json({ error: 'ids array required' }, { status: 400 })

    const update = db.prepare('UPDATE subtasks SET sort_order = ? WHERE id = ?')
    db.transaction(() => {
      ids.forEach((id, i) => update.run(i, id))
    })()

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
