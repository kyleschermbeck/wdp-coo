import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// GET /api/inventory/bundle-components?bundle_id=xxx  → components for one bundle
// GET /api/inventory/bundle-components                → all bundle components
export async function GET(req: Request) {
  const db = await getDb()
  const { searchParams } = new URL(req.url)
  const bundleId = searchParams.get('bundle_id')

  if (bundleId) {
    const rows = (await db.execute({sql: `
      SELECT pbc.id, pbc.bundle_shopify_id, pbc.component_shopify_id, pbc.quantity,
             sp.title
      FROM product_bundle_components pbc
      LEFT JOIN shopify_products sp ON sp.shopify_id = pbc.component_shopify_id
      WHERE pbc.bundle_shopify_id = ?
      ORDER BY pbc.id ASC
    `, args: [bundleId]})).rows
    return NextResponse.json(rows)
  }

  // All bundle components (for page-level bundle qty computation)
  const rows = (await db.execute({sql: `
    SELECT pbc.id, pbc.bundle_shopify_id, pbc.component_shopify_id, pbc.quantity
    FROM product_bundle_components pbc
    ORDER BY pbc.bundle_shopify_id, pbc.id ASC
  `, args: []})).rows
  return NextResponse.json(rows)
}

// POST /api/inventory/bundle-components
// Body: { bundle_shopify_id, components: [{component_shopify_id, quantity}] }
// Replaces all components for the bundle
export async function POST(req: Request) {
  const db = await getDb()
  const { bundle_shopify_id, components } = await req.json() as {
    bundle_shopify_id: string
    components: Array<{ component_shopify_id: string; quantity: number }>
  }

  if (!bundle_shopify_id) return NextResponse.json({ error: 'bundle_shopify_id required' }, { status: 400 })

  await db.execute({ sql: 'DELETE FROM product_bundle_components WHERE bundle_shopify_id = ?', args: [bundle_shopify_id] })
  for (const c of (components ?? [])) {
    if (c.component_shopify_id) {
      await db.execute({ sql: 'INSERT INTO product_bundle_components (bundle_shopify_id, component_shopify_id, quantity) VALUES (?, ?, ?)', args: [bundle_shopify_id, c.component_shopify_id, c.quantity || 1] })
    }
  }
  return NextResponse.json({ ok: true })
}
