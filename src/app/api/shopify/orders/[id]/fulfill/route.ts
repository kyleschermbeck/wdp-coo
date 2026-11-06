import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getShopifyConfig, fulfillOrder, fetchLocations } from '@/lib/shopify'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await getDb()
  const config = await getShopifyConfig(db)
  if (!config?.access_token) return NextResponse.json({ error: 'Shopify not connected' }, { status: 400 })

  try {
    // Get first active location
    let locationId = (await db.execute({sql: `SELECT shopify_id FROM shopify_locations WHERE active = 1 LIMIT 1`, args: []})).rows[0] as unknown as { shopify_id: string } | undefined
    if (!locationId) {
      const locations = await fetchLocations(config)
      const active = locations.find(l => l.active)
      if (!active) return NextResponse.json({ error: 'No active location found' }, { status: 400 })
      locationId = { shopify_id: String(active.id) }
    }

    await fulfillOrder(config, parseInt(id), locationId.shopify_id)

    // Update local cache
    await db.execute({sql: `UPDATE shopify_orders SET fulfillment_status = 'fulfilled', inventory_deducted = 1 WHERE shopify_id = ?`, args: [id]})

    // Decrement local on-hand inventory for each line item
    // For fixed bundle products, decrement components instead of the bundle itself
    const orderRow = (await db.execute({sql: `SELECT line_items FROM shopify_orders WHERE shopify_id = ?`, args: [id]})).rows[0] as unknown as { line_items: string } | undefined
    if (orderRow?.line_items) {
      interface FulfillLineItem { product_id: number | null; quantity: number; fulfillable_quantity?: number }
      interface BundleComp { component_shopify_id: string; quantity: number }
      const lineItems = JSON.parse(orderRow.line_items) as FulfillLineItem[]
      for (const item of lineItems) {
        if (!item.product_id) continue
        const qty = item.fulfillable_quantity ?? item.quantity ?? 0
        if (!qty) continue
        const sid = String(item.product_id)
        // Check if this is a fixed bundle with defined components
        const components = (await db.execute({
          sql: `SELECT component_shopify_id, quantity FROM product_bundle_components WHERE bundle_shopify_id = ?`,
          args: [sid],
        })).rows as unknown as BundleComp[]
        if (components.length > 0) {
          for (const comp of components) {
            await db.execute({
              sql: `UPDATE shopify_products SET inventory_quantity = MAX(0, inventory_quantity - ?) WHERE shopify_id = ?`,
              args: [comp.quantity * qty, comp.component_shopify_id],
            })
          }
        } else {
          await db.execute({
            sql: `UPDATE shopify_products SET inventory_quantity = MAX(0, inventory_quantity - ?) WHERE shopify_id = ?`,
            args: [qty, sid],
          })
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
