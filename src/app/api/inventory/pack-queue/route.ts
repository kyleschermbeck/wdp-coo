import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface LineItemProperty {
  name: string
  value: string
}

interface LineItem {
  title: string
  quantity: number
  fulfillable_quantity: number
  product_id: number
  properties?: LineItemProperty[]
}

interface OrderRow {
  id: number
  order_number: number
  line_items: string
  created_at: string
}

interface LabeledJarsRow {
  shopify_product_id: string
  qty: number
}

interface ProductRow {
  shopify_id: string
  title: string
}

interface IngredientRow {
  shopify_product_id: string
  supply_id: number
  tbsp: number
  containers_on_hand: number
  package_weight: number | null
  package_extra_oz: number | null
  oz_per_tbsp: number | null
}

export async function GET() {
  const db = getDb()

  const orders = db.prepare(`
    SELECT id, order_number, line_items, created_at
    FROM shopify_orders
    WHERE fulfillment_status IS NULL OR fulfillment_status IN ('unfulfilled', 'partial')
    ORDER BY created_at ASC
  `).all() as OrderRow[]

  // Load all active non-bundle products first so we can resolve bundle properties by title
  const allProducts = db.prepare(
    `SELECT shopify_id, title FROM shopify_products WHERE status = 'active' AND is_bundle = 0`
  ).all() as ProductRow[]

  const titleToShopifyId: Record<string, string> = {}
  for (const p of allProducts) titleToShopifyId[p.title] = p.shopify_id

  // Aggregate per blend, tracking per-order breakdown (oldest first from query)
  const byBlend: Record<string, {
    jars: number
    orders: number[]
    orderBreakdown: { orderNumber: number; qty: number; createdAt: string }[]
    productId: number
    shopifyId: string
  }> = {}

  function addToBlend(title: string, shopifyId: string, productId: number, qty: number, orderNumber: number, createdAt: string) {
    if (!byBlend[title]) {
      byBlend[title] = { jars: 0, orders: [], orderBreakdown: [], productId, shopifyId }
    }
    byBlend[title].jars += qty
    if (!byBlend[title].orders.includes(orderNumber)) {
      byBlend[title].orders.push(orderNumber)
    }
    const existing = byBlend[title].orderBreakdown.find(o => o.orderNumber === orderNumber)
    if (existing) {
      existing.qty += qty
    } else {
      byBlend[title].orderBreakdown.push({ orderNumber, qty, createdAt })
    }
  }

  for (const order of orders) {
    let items: LineItem[] = []
    try { items = JSON.parse(order.line_items) } catch { continue }
    for (const item of items) {
      const qty = item.fulfillable_quantity ?? item.quantity ?? 0
      if (!qty) continue

      // Build A Bundle! — expand properties into individual blend quantities
      const isBundleItem = item.properties && item.properties.length > 0 &&
        item.properties.some(p => !p.name.startsWith('_'))
      if (isBundleItem && item.properties) {
        for (const prop of item.properties) {
          if (prop.name.startsWith('_')) continue
          const propQty = parseInt(prop.value)
          if (!propQty) continue
          const sid = titleToShopifyId[prop.name] ?? ''
          addToBlend(prop.name, sid, 0, propQty, order.order_number, order.created_at)
        }
        continue // don't add the bundle line item itself
      }

      // Regular product
      addToBlend(item.title, String(item.product_id), item.product_id, qty, order.order_number, order.created_at)
    }
  }

  // Ensure all active non-bundle products appear in the queue (even with 0 jars)
  for (const p of allProducts) {
    if (!byBlend[p.title]) {
      byBlend[p.title] = { jars: 0, orders: [], orderBreakdown: [], productId: 0, shopifyId: p.shopify_id }
    }
  }

  // Build shopifyId → title map for reverse lookup
  const idToTitle: Record<string, string> = {}
  for (const p of allProducts) idToTitle[p.shopify_id] = p.title
  for (const [title, data] of Object.entries(byBlend)) idToTitle[data.shopifyId] = title

  const labeledJarsRows = db.prepare(`SELECT shopify_product_id, qty FROM labeled_jars`).all() as LabeledJarsRow[]
  const labeledJarsMap: Record<string, number> = {}
  for (const r of labeledJarsRows) labeledJarsMap[r.shopify_product_id] = r.qty

  // Compute max fillable jars per product from current ingredient supply
  // For each ingredient: tbspPerContainer = total_oz / oz_per_tbsp
  //   maxJarsFromIngredient = floor(containers_on_hand * tbspPerContainer / tbsp_per_jar)
  // The limiting ingredient determines canFill for that product
  const ingredients = db.prepare(`
    SELECT pi.shopify_product_id, pi.supply_id, pi.tbsp,
           s.containers_on_hand,
           s.package_weight, s.package_extra_oz, s.oz_per_tbsp
    FROM product_ingredients pi
    JOIN supplies s ON s.id = pi.supply_id
  `).all() as IngredientRow[]

  // Group ingredients by product
  const ingredientsByProduct: Record<string, IngredientRow[]> = {}
  for (const ing of ingredients) {
    if (!ingredientsByProduct[ing.shopify_product_id]) ingredientsByProduct[ing.shopify_product_id] = []
    ingredientsByProduct[ing.shopify_product_id].push(ing)
  }

  // canFill: max jars fillable given current supply (limited by tightest ingredient)
  const canFillMap: Record<string, number> = {}
  const limitingIngredientMap: Record<string, string> = {}

  for (const [pid, ings] of Object.entries(ingredientsByProduct)) {
    let canFill = Infinity
    let limitingName: string | null = null

    for (const ing of ings) {
      const totalOz = (ing.package_weight ?? 0) * 16 + (ing.package_extra_oz ?? 0)
      if (!totalOz || !ing.oz_per_tbsp || !ing.tbsp) continue
      const tbspPerContainer = totalOz / ing.oz_per_tbsp
      const tbspOnHand = Math.max(0, ing.containers_on_hand) * tbspPerContainer
      const maxFromThis = Math.floor(tbspOnHand / ing.tbsp)

      if (maxFromThis < canFill) {
        canFill = maxFromThis
        // Look up supply name for display
        const supplyRow = db.prepare(`SELECT name FROM supplies WHERE id = ?`).get(ing.supply_id) as { name: string } | undefined
        limitingName = supplyRow?.name ?? null
      }
    }

    canFillMap[pid] = canFill === Infinity ? 0 : canFill
    if (limitingName) limitingIngredientMap[pid] = limitingName
  }

  const rows = Object.entries(byBlend)
    .map(([blend, data]) => {
      const canFill = canFillMap[data.shopifyId] ?? 0
      const jarsNeeded = data.jars
      const labeled = labeledJarsMap[data.shopifyId] ?? 0
      // Effective target = max of open orders and labeled jars (labeled backstock will also be filled)
      const effectiveTarget = Math.max(jarsNeeded, labeled)
      const fillableNow = Math.min(canFill, effectiveTarget)
      // Green = can fill all ordered jars; for labeled-only blends (no orders) = can fill all labeled
      const fullyFillable = jarsNeeded > 0
        ? canFill >= jarsNeeded
        : labeled > 0 && canFill >= labeled

      return {
        blend,
        jars: jarsNeeded,
        orderCount: data.orders.length,
        orderNumbers: data.orders,
        orderBreakdown: data.orderBreakdown,
        shopifyId: data.shopifyId,
        labeledJars: labeled,
        canFill,
        fillableNow,
        fullyFillable,
        limitingIngredient: limitingIngredientMap[data.shopifyId] ?? null,
      }
    })
    .sort((a, b) => b.jars - a.jars || a.blend.localeCompare(b.blend))

  // Recommendation order: fully fillable first (most jars → least), then partial (most fillable → least), then can't fill
  const recommendations = [...rows]
    .filter(r => r.jars > 0) // only blends with open orders
    .sort((a, b) => {
      if (a.fullyFillable !== b.fullyFillable) return a.fullyFillable ? -1 : 1
      if (b.fillableNow !== a.fillableNow) return b.fillableNow - a.fillableNow
      return b.jars - a.jars
    })

  return NextResponse.json({
    rows,
    totalJars: rows.reduce((s, r) => s + r.jars, 0),
    openOrderCount: orders.length,
    recommendations,
  })
}
