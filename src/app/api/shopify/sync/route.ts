import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { syncShopifyData } from '@/lib/shopify'

export async function POST() {
  const db = await getDb()
  try {
    const result = await syncShopifyData(db)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
