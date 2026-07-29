import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getShopifyConfig, fulfillOrder, fetchLocations } from '@/lib/shopify'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  const config = getShopifyConfig(db)
  if (!config?.access_token) return NextResponse.json({ error: 'Shopify not connected' }, { status: 400 })

  try {
    // Get first active location
    let locationId = db.prepare(`SELECT shopify_id FROM shopify_locations WHERE active = 1 LIMIT 1`).get() as { shopify_id: string } | undefined
    if (!locationId) {
      const locations = await fetchLocations(config)
      const active = locations.find(l => l.active)
      if (!active) return NextResponse.json({ error: 'No active location found' }, { status: 400 })
      locationId = { shopify_id: String(active.id) }
    }

    await fulfillOrder(config, parseInt(id), locationId.shopify_id)

    // Update local cache
    db.prepare(`UPDATE shopify_orders SET fulfillment_status = 'fulfilled' WHERE shopify_id = ?`).run(id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
