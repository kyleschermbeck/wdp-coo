import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const shop = searchParams.get('shop')

  if (!code || !state || !shop) {
    return NextResponse.redirect(new URL('/marketing?shopify_error=missing_params', request.url))
  }

  const db = getDb()
  const config = db.prepare('SELECT store_url, client_id, client_secret, oauth_state FROM shopify_config WHERE id = 1').get() as
    | { store_url: string; client_id: string; client_secret: string; oauth_state: string }
    | undefined

  if (!config) {
    return NextResponse.redirect(new URL('/marketing?shopify_error=no_config', request.url))
  }

  // Verify state to prevent CSRF
  if (state !== config.oauth_state) {
    return NextResponse.redirect(new URL('/marketing?shopify_error=invalid_state', request.url))
  }

  // Exchange code for access token
  try {
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.client_id,
        client_secret: config.client_secret,
        code,
      }),
    })

    if (!tokenRes.ok) {
      const text = await tokenRes.text()
      console.error('Shopify token exchange failed:', text)
      return NextResponse.redirect(new URL('/marketing?shopify_error=token_exchange_failed', request.url))
    }

    const { access_token } = await tokenRes.json() as { access_token: string }

    db.prepare(`
      UPDATE shopify_config SET access_token = ?, oauth_state = NULL WHERE id = 1
    `).run(access_token)

    return NextResponse.redirect(new URL('/marketing?shopify_connected=1', request.url))
  } catch (err) {
    console.error('Shopify OAuth callback error:', err)
    return NextResponse.redirect(new URL('/marketing?shopify_error=server_error', request.url))
  }
}
