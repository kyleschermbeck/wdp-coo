import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { testShopifyConnection } from '@/lib/shopify'

export async function POST(request: Request) {
  const db = getDb()
  const { store_url, access_token } = await request.json() as { store_url: string; access_token: string }

  if (!store_url || !access_token) {
    return NextResponse.json({ error: 'store_url and access_token are required' }, { status: 400 })
  }

  // Normalize store URL — strip protocol and trailing slash
  const normalizedUrl = store_url.replace(/^https?:\/\//, '').replace(/\/$/, '')

  const config = { id: 1, store_url: normalizedUrl, access_token, last_synced_at: null }

  try {
    const shop = await testShopifyConnection(config)

    // Save config
    db.prepare(`
      INSERT INTO shopify_config (id, store_url, access_token)
      VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        store_url = excluded.store_url,
        access_token = excluded.access_token
    `).run(normalizedUrl, access_token)

    return NextResponse.json({ success: true, shop_name: shop.name, store_url: normalizedUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function GET() {
  const db = getDb()
  const config = db.prepare('SELECT id, store_url, access_token, last_synced_at FROM shopify_config WHERE id = 1').get() as
    | { id: number; store_url: string; access_token: string; last_synced_at: string | null }
    | undefined

  if (!config || !config.access_token) {
    return NextResponse.json({ connected: false })
  }

  return NextResponse.json({
    connected: true,
    store_url: config.store_url,
    last_synced_at: config.last_synced_at,
  })
}
