import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const db = getDb()
    const row = db.prepare(`SELECT COUNT(*) as count FROM email_cache WHERE is_sent = 0 AND is_read = 0`).get() as { count: number }
    return NextResponse.json({ count: row?.count ?? 0 })
  } catch {
    return NextResponse.json({ count: 0 })
  }
}
