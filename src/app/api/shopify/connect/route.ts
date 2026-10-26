import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { testShopifyConnection } from '@/lib/shopify'

export async function POST(request: Request) {
  const db = await getDb()
  const { store_url, access_token, theme_id } = await request.json() as {
    store_url: string
    access_token: string
    theme_id?: string
  }

  if (!store_url || !access_token) {
    return NextResponse.json({ error: 'store_url and access_token are required' }, { status: 400 })
  }

  // Normalize store URL — strip protocol and trailing slash
  const normalizedUrl = store_url.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const normalizedThemeId = theme_id ? String(theme_id).trim() : null

  const config = { id: 1, store_url: normalizedUrl, access_token, last_synced_at: null, theme_id: normalizedThemeId }

  try {
    const shop = await testShopifyConnection(config)

    // Save config — upsert store credentials and optional theme_id
    await db.execute({sql: `
      INSERT INTO shopify_config (id, store_url, access_token, theme_id)
      VALUES (1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        store_url  = excluded.store_url,
        access_token = excluded.access_token,
        theme_id   = COALESCE(excluded.theme_id, shopify_config.theme_id)
    `, args: [normalizedUrl, access_token, normalizedThemeId]})

    return NextResponse.json({ success: true, shop_name: shop.name, store_url: normalizedUrl, theme_id: normalizedThemeId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

// PATCH /api/shopify/connect — update theme_id (or other config) without re-connecting
export async function PATCH(request: Request) {
  const db = await getDb()
  const { theme_id } = await request.json() as { theme_id?: string }

  const existing = (await db.execute({sql: 'SELECT id FROM shopify_config WHERE id = 1', args: []})).rows[0]
  if (!existing) return NextResponse.json({ error: 'Shopify not connected' }, { status: 400 })

  if (theme_id !== undefined) {
    await db.execute({sql: 'UPDATE shopify_config SET theme_id = ? WHERE id = 1', args: [theme_id ? String(theme_id).trim() : null]})
  }

  return NextResponse.json({ ok: true })
}

export async function GET() {
  const db = await getDb()
  const config = (await db.execute({sql: 'SELECT id, store_url, access_token, last_synced_at, theme_id FROM shopify_config WHERE id = 1', args: []})).rows[0] as
    unknown as | { id: number; store_url: string; access_token: string; last_synced_at: string | null; theme_id: string | null }
    | undefined

  if (!config || !config.access_token) {
    return NextResponse.json({ connected: false })
  }

  return NextResponse.json({
    connected: true,
    store_url: config.store_url,
    last_synced_at: config.last_synced_at,
    theme_id: config.theme_id ?? null,
  })
}
