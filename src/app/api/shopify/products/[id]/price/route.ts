import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getShopifyConfig, updateVariantPrice } from '@/lib/shopify'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  const config = getShopifyConfig(db)
  if (!config?.access_token) return NextResponse.json({ error: 'Shopify not connected' }, { status: 400 })

  const { variant_id, price } = await req.json() as { variant_id: string; price: string }
  if (!variant_id || !price) return NextResponse.json({ error: 'variant_id and price required' }, { status: 400 })

  try {
    await updateVariantPrice(config, variant_id, price)

    // Update raw JSON in local cache
    const row = db.prepare(`SELECT raw FROM shopify_products WHERE shopify_id = ?`).get(id) as { raw: string } | undefined
    if (row) {
      const raw = JSON.parse(row.raw) as { variants: Array<{ id: number; price: string }> }
      raw.variants = raw.variants.map(v => v.id === parseInt(variant_id) ? { ...v, price } : v)
      db.prepare(`UPDATE shopify_products SET raw = ? WHERE shopify_id = ?`).run(JSON.stringify(raw), id)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
