import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import crypto from 'crypto'

const SCOPES = 'read_orders,read_all_orders,read_products,read_inventory,read_customers,write_customers,write_products,write_inventory,write_orders,read_fulfillments,write_fulfillments,read_locations,read_marketing_events'
const REDIRECT_URI = 'http://localhost:3000/api/shopify/callback'

export async function POST(request: Request) {
  const { store_url, client_id, client_secret } = await request.json() as {
    store_url: string
    client_id: string
    client_secret: string
  }

  if (!store_url || !client_id || !client_secret) {
    return NextResponse.json({ error: 'store_url, client_id, and client_secret are required' }, { status: 400 })
  }

  const normalized = store_url.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const state = crypto.randomBytes(16).toString('hex')

  const db = getDb()
  db.prepare(`
    INSERT INTO shopify_config (id, store_url, access_token, client_id, client_secret, oauth_state)
    VALUES (1, ?, '', ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      store_url = excluded.store_url,
      client_id = excluded.client_id,
      client_secret = excluded.client_secret,
      oauth_state = excluded.oauth_state
  `).run(normalized, client_id, client_secret, state)

  const authUrl = new URL(`https://${normalized}/admin/oauth/authorize`)
  authUrl.searchParams.set('client_id', client_id)
  authUrl.searchParams.set('scope', SCOPES)
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  authUrl.searchParams.set('state', state)

  return NextResponse.json({ redirect_url: authUrl.toString() })
}
