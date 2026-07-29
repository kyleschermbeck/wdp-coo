import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = getDb()

  const shopifyConfig = db.prepare('SELECT access_token FROM shopify_config WHERE id = 1').get() as
    | { access_token: string } | undefined
  const shopifyConnected = !!(shopifyConfig?.access_token)

  if (shopifyConnected) {
    // Shopify-first: all synced products joined with local data where available
    const rows = db.prepare(`
      SELECT
        sp.id,
        sp.shopify_id,
        sp.title,
        sp.handle,
        sp.status,
        sp.inventory_quantity AS shopify_qty,
        sp.inventory_item_id,
        sp.raw,
        sp.is_bundle,
        p.id AS local_product_id,
        p.accent_color,
        COALESCE(sis.reorder_threshold, i.reorder_threshold, 12) AS reorder_threshold
      FROM shopify_products sp
      LEFT JOIN products p ON p.id = sp.product_id
      LEFT JOIN inventory i ON i.product_id = p.id
      LEFT JOIN shopify_inventory_settings sis ON sis.shopify_product_id = sp.shopify_id
      WHERE sp.status != 'archived'
      ORDER BY sp.title ASC
    `).all()
    return NextResponse.json({ source: 'shopify', rows })
  }

  // Fallback: local products only
  const rows = db.prepare(`
    SELECT
      p.id AS product_id, p.name, p.slug, p.accent_color, p.active,
      i.id AS inventory_id, i.quantity_on_hand, i.reorder_threshold, i.last_updated
    FROM products p
    LEFT JOIN inventory i ON i.product_id = p.id
    WHERE p.active = 1
    ORDER BY p.name ASC
  `).all()
  return NextResponse.json({ source: 'local', rows })
}
