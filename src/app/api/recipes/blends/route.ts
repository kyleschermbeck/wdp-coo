import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = getDb()
  const blends = db.prepare(`
    SELECT title FROM shopify_products
    WHERE status = 'active' AND (is_bundle = 0 OR is_bundle IS NULL)
    ORDER BY title
  `).all() as { title: string }[]
  return NextResponse.json(blends)
}
