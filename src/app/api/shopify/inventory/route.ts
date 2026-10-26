import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getShopifyConfig, updateInventoryLevel, fetchLocations } from '@/lib/shopify'

export async function POST(req: NextRequest) {
  const db = await getDb()
  const config = await getShopifyConfig(db)
  if (!config?.access_token) return NextResponse.json({ error: 'Shopify not connected' }, { status: 400 })

  const { inventory_item_id, available } = await req.json() as { inventory_item_id: string; available: number }
  if (!inventory_item_id || available == null) {
    return NextResponse.json({ error: 'inventory_item_id and available required' }, { status: 400 })
  }

  try {
    let locationId = ((await db.execute({sql: `SELECT shopify_id FROM shopify_locations WHERE active = 1 LIMIT 1`, args: []})).rows[0] as unknown as { shopify_id: string } | undefined)?.shopify_id
    if (!locationId) {
      const locations = await fetchLocations(config)
      const active = locations.find(l => l.active)
      if (!active) return NextResponse.json({ error: 'No active location' }, { status: 400 })
      locationId = String(active.id)
    }

    await updateInventoryLevel(config, inventory_item_id, locationId, available)
    // Update local cache
    await db.execute({sql: `UPDATE shopify_products SET inventory_quantity = ? WHERE inventory_item_id = ?`, args: [available, inventory_item_id]})
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
