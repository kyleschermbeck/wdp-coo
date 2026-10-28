import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getShopifyConfig, updateInventoryLevel, fetchLocations } from '@/lib/shopify'

interface IngredientRow {
  supply_id: number
  tbsp: number
  package_weight: number | null
  package_extra_oz: number | null
  oz_per_tbsp: number | null
  containers_on_hand: number
}

interface PackagingRow {
  supply_id: number
  containers_on_hand: number
  is_label: number
}

interface LabelInventoryRow {
  units_on_hand: number
}

interface LabeledJarsRow {
  qty: number
}

export async function POST(req: NextRequest) {
  const { shopify_id, qty, assignments } = await req.json() as {
    shopify_id: string
    qty: number
    assignments?: { orderNumber: number; qty: number }[]
  }
  if (!shopify_id || !qty || qty <= 0) {
    return NextResponse.json({ error: 'shopify_id and qty required' }, { status: 400 })
  }

  const db = await getDb()
  const config = await getShopifyConfig(db)
  if (!config?.access_token) {
    return NextResponse.json({ error: 'Shopify not connected' }, { status: 400 })
  }

  // Get inventory_item_id and current qty for this product
  const product = (await db.execute({sql: `SELECT inventory_item_id, inventory_quantity FROM shopify_products WHERE shopify_id = ?`, args: [shopify_id]})).rows[0] as unknown as { inventory_item_id: string | null; inventory_quantity: number } | undefined

  if (!product?.inventory_item_id) {
    return NextResponse.json({ error: 'Product not found or not tracked' }, { status: 404 })
  }

  // Get active location
  let locationId = ((await db.execute({sql: `SELECT shopify_id FROM shopify_locations WHERE active = 1 LIMIT 1`, args: []})).rows[0] as unknown as { shopify_id: string } | undefined)?.shopify_id

  if (!locationId) {
    try {
      const locations = await fetchLocations(config)
      const active = locations.find(l => l.active)
      if (active) locationId = String(active.id)
    } catch { /* proceed without location */ }
  }

  // Update Shopify inventory (non-fatal — local DB always updates)
  const newQty = (product.inventory_quantity ?? 0) + qty
  let shopifyWarning: string | null = null
  if (locationId) {
    try {
      await updateInventoryLevel(config, product.inventory_item_id, locationId, newQty)
    } catch (err) {
      shopifyWarning = err instanceof Error ? err.message : 'Shopify update failed'
    }
  } else {
    shopifyWarning = 'No active Shopify location found'
  }
  // Always update local DB regardless of Shopify result
  await db.execute({sql: `UPDATE shopify_products SET inventory_quantity = ? WHERE shopify_id = ?`, args: [newQty, shopify_id]})

  // Deduct from labeled_jars first (jars already labeled and waiting to fill)
  const labeledRow = (await db.execute({sql: `SELECT qty FROM labeled_jars WHERE shopify_product_id = ?`, args: [shopify_id]})).rows[0] as unknown as LabeledJarsRow | undefined
  const currentLabeled = labeledRow?.qty ?? 0
  const fromLabeled = Math.min(qty, currentLabeled)
  const remainingQty = qty - fromLabeled  // qty that wasn't pre-labeled (same-session label+fill)

  if (fromLabeled > 0) {
    await db.execute({sql: `UPDATE labeled_jars SET qty = ? WHERE shopify_product_id = ?`, args: [currentLabeled - fromLabeled, shopify_id]})
  }

  // Deduct supply usage based on recipe (product_ingredients)
  const ingredients = (await db.execute({sql: `
    SELECT pi.supply_id, pi.tbsp,
           s.package_weight, s.package_extra_oz, s.oz_per_tbsp, s.containers_on_hand
    FROM product_ingredients pi
    JOIN supplies s ON s.id = pi.supply_id
    WHERE pi.shopify_product_id = ?
  `, args: [shopify_id]})).rows as unknown as IngredientRow[]

  const supplyUpdates: { id: number; newContainers: number }[] = []

  for (const ing of ingredients) {
    const totalOz = (ing.package_weight ?? 0) * 16 + (ing.package_extra_oz ?? 0)
    const tbspPerContainer = (totalOz > 0 && ing.oz_per_tbsp) ? totalOz / ing.oz_per_tbsp : null
    if (!tbspPerContainer) continue // can't deduct without calibration data

    const tbspUsed = qty * ing.tbsp
    const containersUsed = tbspUsed / tbspPerContainer
    const current = ing.containers_on_hand ?? 0
    const newContainers = Math.max(0, current - containersUsed)

    await db.execute({sql: `UPDATE supplies SET containers_on_hand = ? WHERE id = ?`, args: [newContainers, ing.supply_id]})
    supplyUpdates.push({ id: ing.supply_id, newContainers })
  }

  // Deduct packaging units (1 unit per jar for each packaging supply used by this product)
  const packagingItems = (await db.execute({sql: `
    SELECT pp.supply_id, s.containers_on_hand,
           CASE WHEN s.name LIKE '%Label%' THEN 1 ELSE 0 END as is_label
    FROM product_packaging pp
    JOIN supplies s ON s.id = pp.supply_id
    WHERE pp.shopify_product_id = ?
  `, args: [shopify_id]})).rows as unknown as PackagingRow[]

  for (const pkg of packagingItems) {
    if (pkg.is_label) {
      // Only deduct labels for jars not already pre-labeled (remainingQty)
      if (remainingQty <= 0) continue
      const existing = (await db.execute({sql: `SELECT units_on_hand FROM product_label_inventory WHERE shopify_product_id = ? AND supply_id = ?`, args: [shopify_id, pkg.supply_id]})).rows[0] as unknown as LabelInventoryRow | undefined
      const current = existing?.units_on_hand ?? 0
      const newUnits = Math.max(0, current - remainingQty)
      await db.execute({sql: `
        INSERT INTO product_label_inventory (shopify_product_id, supply_id, units_on_hand)
        VALUES (?, ?, ?)
        ON CONFLICT(shopify_product_id, supply_id) DO UPDATE SET units_on_hand = excluded.units_on_hand
      `, args: [shopify_id, pkg.supply_id, newUnits]})
    } else {
      // Only deduct jars for jars not already pre-labeled (remainingQty)
      if (remainingQty <= 0) continue
      const current = pkg.containers_on_hand ?? 0
      const newUnits = Math.max(0, current - remainingQty)
      await db.execute({sql: `UPDATE supplies SET containers_on_hand = ? WHERE id = ?`, args: [newUnits, pkg.supply_id]})
    }
  }

  // Replace order assignments: clear stale entries first so each pack session starts clean
  if (assignments && assignments.length > 0) {
    await db.execute({ sql: `DELETE FROM pack_assignments WHERE shopify_product_id = ?`, args: [shopify_id] })
    for (const a of assignments) {
      if (a.qty > 0) await db.execute({ sql: `INSERT INTO pack_assignments (shopify_product_id, order_number, qty) VALUES (?, ?, ?)`, args: [shopify_id, a.orderNumber, a.qty] })
    }
  }

  return NextResponse.json({ ok: true, newQty, supplyUpdates, shopifyWarning })
}
