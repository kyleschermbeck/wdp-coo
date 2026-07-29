import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getShopifyConfig, createProduct } from '@/lib/shopify'

interface CreateBody {
  title: string
  body_html?: string
  tags?: string
  product_type?: string
  status?: string
  price?: string
  compare_at_price?: string
  sku?: string
}

export async function GET() {
  const db = getDb()

  const rows = db.prepare(`
    SELECT
      sp.id,
      sp.shopify_id,
      sp.title,
      sp.handle,
      sp.status,
      sp.inventory_quantity,
      sp.synced_at,
      sp.product_id,
      p.name AS local_name,
      p.accent_color,
      p.slug
    FROM shopify_products sp
    LEFT JOIN products p ON p.id = sp.product_id
    ORDER BY sp.title ASC
  `).all() as {
    id: number
    shopify_id: string
    title: string
    handle: string
    status: string
    inventory_quantity: number
    synced_at: string
    product_id: number | null
    local_name: string | null
    accent_color: string | null
    slug: string | null
  }[]

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const db = getDb()
  const config = getShopifyConfig(db)
  if (!config?.access_token) return NextResponse.json({ error: 'Shopify not connected' }, { status: 400 })

  const body = await req.json() as CreateBody
  if (!body.title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

  try {
    const product = await createProduct(config, {
      title: body.title.trim(),
      body_html: body.body_html ?? '',
      tags: body.tags ?? '',
      product_type: body.product_type ?? 'Spices',
      status: (body.status ?? 'draft') as string,
      variants: [{
        price: body.price ?? '0.00',
        ...(body.compare_at_price ? { compare_at_price: body.compare_at_price } : {}),
        ...(body.sku ? { sku: body.sku } : {}),
      }],
    })

    const totalInventory = product.variants?.reduce(
      (s, v) => s + ((v as unknown as { inventory_quantity?: number }).inventory_quantity ?? 0), 0
    ) ?? 0
    const inventoryItemId = product.variants?.[0]?.inventory_item_id
      ? String(product.variants[0].inventory_item_id) : null

    db.prepare(`
      INSERT INTO shopify_products
        (shopify_id, title, handle, status, inventory_quantity, inventory_item_id, raw)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(shopify_id) DO UPDATE SET
        title = excluded.title, handle = excluded.handle, status = excluded.status,
        inventory_quantity = excluded.inventory_quantity,
        inventory_item_id = excluded.inventory_item_id,
        raw = excluded.raw, synced_at = datetime('now')
    `).run(
      String(product.id), product.title, product.handle, product.status,
      totalInventory, inventoryItemId, JSON.stringify(product),
    )

    return NextResponse.json({ ok: true, shopify_id: String(product.id), product })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
