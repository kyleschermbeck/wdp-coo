import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// Returns the blended gross margin % across all Shopify products that have cost data.
// Falls back to 55% if no costed products exist.
export async function GET() {
  const db = getDb()

  // Get all Shopify products with their prices
  const products = db.prepare(`
    SELECT sp.shopify_id, sp.raw
    FROM shopify_products sp
    WHERE sp.status != 'archived'
  `).all() as Array<{ shopify_id: string; raw: string }>

  const margins: number[] = []

  for (const product of products) {
    let price = 0
    try {
      const raw = JSON.parse(product.raw)
      price = parseFloat(raw.variants?.[0]?.price ?? '0')
    } catch { continue }
    if (!price) continue

    // Ingredient cost
    const ingredients = db.prepare(`
      SELECT pi.tbsp, s.oz_per_tbsp, s.package_cost, s.package_weight
      FROM product_ingredients pi
      JOIN supplies s ON s.id = pi.supply_id
      WHERE pi.shopify_product_id = ?
    `).all(product.shopify_id) as Array<{ tbsp: number; oz_per_tbsp: number | null; package_cost: number | null; package_weight: number | null }>

    if (ingredients.length === 0) continue // no cost data — skip

    let ingredientCost = 0
    for (const ing of ingredients) {
      if (!ing.package_cost || !ing.package_weight || !ing.oz_per_tbsp) continue
      // package_weight is stored in lbs — convert to oz
      const totalOz = ing.package_weight * 16
      const ozUsed = (ing.tbsp ?? 0) * (ing.oz_per_tbsp ?? 0)
      ingredientCost += (ing.package_cost / (totalOz || 1)) * ozUsed
    }

    // Packaging cost
    const packaging = db.prepare(`
      SELECT s.package_cost, s.total_servings
      FROM product_packaging pp
      JOIN supplies s ON s.id = pp.supply_id
      WHERE pp.shopify_product_id = ?
    `).all(product.shopify_id) as Array<{ package_cost: number | null; total_servings: number | null }>
    // Divide by total_servings to get per-unit cost (package_cost is case/bulk price)
    const packagingCost = packaging.reduce((sum, p) => {
      if (!p.package_cost) return sum
      const perUnit = (p.total_servings && p.total_servings > 0)
        ? p.package_cost / p.total_servings
        : p.package_cost
      return sum + perUnit
    }, 0)

    // Labor cost
    const local = db.prepare('SELECT labor_cost FROM product_local WHERE shopify_product_id = ?').get(product.shopify_id) as
      { labor_cost: number } | undefined
    const laborCost = local?.labor_cost ?? 0

    const totalCost = ingredientCost + packagingCost + laborCost
    if (totalCost > 0 && price > 0) {
      margins.push(((price - totalCost) / price) * 100)
    }
  }

  const blendedMargin = margins.length > 0
    ? margins.reduce((s, m) => s + m, 0) / margins.length
    : 55 // default estimate

  return NextResponse.json({ blendedMargin, costedProductCount: margins.length })
}
