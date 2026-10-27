import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function PUT(req: NextRequest) {
  try {
    const { order } = await req.json() as { order: Array<{ id: number; sort_order: number }> }
    const db = await getDb()
    for (const item of order) {
      await db.execute({ sql: 'UPDATE tasks SET sort_order = ? WHERE id = ?', args: [item.sort_order, item.id] })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
