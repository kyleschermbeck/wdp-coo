import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(req: NextRequest) {
  const db = getDb()
  const q = new URL(req.url).searchParams.get('q')?.toLowerCase() ?? ''

  let rows
  if (q) {
    rows = db.prepare(`
      SELECT * FROM shopify_customers
      WHERE lower(first_name || ' ' || last_name) LIKE ? OR lower(email) LIKE ?
      ORDER BY total_spent DESC
    `).all(`%${q}%`, `%${q}%`)
  } else {
    rows = db.prepare(`SELECT * FROM shopify_customers ORDER BY total_spent DESC`).all()
  }

  return NextResponse.json(rows)
}
