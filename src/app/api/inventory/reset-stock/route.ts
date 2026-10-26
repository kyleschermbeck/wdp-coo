import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getShopifyConfig, updateInventoryLevel, fetchLocations } from '@/lib/shopify'

interface LineItemProperty {
  name: string
  value: string
}

interface LineItem {
  product_id: number
  fulfillable_quantity: number
  quantity: number
  properties?: LineItemProperty[]
}

interface OrderRow {
  line_items: string
}

interface ShopifyProduct {
  shopify_id: string
  title: string
  inventory_item_id: string | null
  is_bundle: number
}

interface ProductRow {
  shopify_id: string
  title: string
}

export async function POST() {
  const db = await getDb()
  const config = await getShopifyConfig(db)
  if (!config?.access_token) return NextResponse.json({ error: 'Shopify not connected' }, { status: 400 })

  // Get active location
  let locationId = ((await db.execute({sql: `SELECT shopify_id FROM shopify_locations WHERE active = 1 LIMIT 1`, args: []})).rows[0] as unknown as { shopify_id: string } | undefined)?.shopify_id
  if (!locationId) {
    const locations = await fetchLocations(config)
    const active = locations.find(l => l.active)
    if (!active) return NextResponse.json({ error: 'No active location' }, { status: 400 })
    locationId = String(active.id)
  }

  // Build title → shopify_id map for bundle expansion
  const allProducts = (await db.execute({sql: `SELECT shopify_id, title FROM shopify_products WHERE status = 'active' AND is_bundle = 0`, args: []})).rows as unknown as ProductRow[]
  const titleToId: Record<string, string> = {}
  for (const p of allProducts) titleToId[p.title] = p.shopify_id

  // Aggregate unfulfilled fulfillable_quantity per product_id (expanding bundle line items)
  const orders = (await db.execute({sql: `
    SELECT line_items FROM shopify_orders
    WHERE fulfillment_status IS NULL OR fulfillment_status IN ('unfulfilled', 'partial')
  `, args: []})).rows as unknown as OrderRow[]

  const needed: Record<string, number> = {}
  for (const order of orders) {
    let items: LineItem[] = []
    try { items = JSON.parse(order.line_items) } catch { continue }
    for (const item of items) {
      const qty = item.fulfillable_quantity ?? item.quantity ?? 0
      if (!qty) continue

      // Build A Bundle! — expand properties into individual blend quantities
      const isBundleItem = item.properties?.some(p => !p.name.startsWith('_'))
      if (isBundleItem && item.properties) {
        for (const prop of item.properties) {
          if (prop.name.startsWith('_')) continue
          const propQty = parseInt(prop.value)
          if (!propQty) continue
          const sid = titleToId[prop.name]
          if (!sid) continue
          needed[sid] = (needed[sid] ?? 0) + propQty
        }
        continue
      }

      const id = String(item.product_id)
      needed[id] = (needed[id] ?? 0) + qty
    }
  }

  // Get all non-bundle products with inventory tracking
  const products = (await db.execute({sql: `
    SELECT shopify_id, title, inventory_item_id, is_bundle
    FROM shopify_products
    WHERE status != 'archived' AND is_bundle = 0
  `, args: []})).rows as unknown as ShopifyProduct[]

  const results: { title: string; shopifyId: string; newQty: number; ok: boolean; error?: string }[] = []

  for (const product of products) {
    if (!product.inventory_item_id) continue
    const newQty = -(needed[product.shopify_id] ?? 0)
    try {
      await updateInventoryLevel(config, product.inventory_item_id, locationId, newQty)
      await db.execute({sql: `UPDATE shopify_products SET inventory_quantity = ? WHERE shopify_id = ?`, args: [newQty, product.shopify_id]})
      results.push({ title: product.title, shopifyId: product.shopify_id, newQty, ok: true })
    } catch (err) {
      results.push({ title: product.title, shopifyId: product.shopify_id, newQty, ok: false, error: String(err) })
    }
  }

  return NextResponse.json({ ok: true, results })
}
