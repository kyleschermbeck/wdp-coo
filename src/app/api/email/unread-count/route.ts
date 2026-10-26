import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const db = await getDb()
    const row = (await db.execute({sql: `SELECT COUNT(*) as count FROM email_cache WHERE is_sent = 0 AND is_read = 0`, args: []})).rows[0] as unknown as { count: number }
    return NextResponse.json({ count: row?.count ?? 0 })
  } catch {
    return NextResponse.json({ count: 0 })
  }
}
