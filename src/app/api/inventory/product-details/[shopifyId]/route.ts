import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(_: NextRequest, { params }: { params: Promise<{ shopifyId: string }> }) {
  const db = getDb()
  const { shopifyId } = await params

  const ingredients = db.prepare(`
    SELECT pi.id, pi.supply_id, pi.tbsp, pi.sort_order,
           s.name as supply_name, s.oz_per_tbsp, s.package_cost, s.package_weight, s.serving_size
    FROM product_ingredients pi
    JOIN supplies s ON s.id = pi.supply_id
    WHERE pi.shopify_product_id = ?
    ORDER BY pi.sort_order
  `).all(shopifyId)

  const packaging = db.prepare(`
    SELECT pp.supply_id, s.name, s.package_cost, s.serving_size, s.serving_unit
    FROM product_packaging pp
    JOIN supplies s ON s.id = pp.supply_id
    WHERE pp.shopify_product_id = ?
  `).all(shopifyId)

  const local = db.prepare('SELECT * FROM product_local WHERE shopify_product_id = ?').get(shopifyId) as
    { labor_cost: number; accent_color: string | null } | undefined

  return NextResponse.json({
    ingredients,
    packaging,
    labor_cost: local?.labor_cost ?? 0,
    accent_color: local?.accent_color ?? null,
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ shopifyId: string }> }) {
  const db = getDb()
  const { shopifyId } = await params
  const body = await req.json()
  const { ingredients, packaging, labor_cost, cost_per_unit } = body

  db.transaction(() => {
    if (Array.isArray(ingredients)) {
      db.prepare('DELETE FROM product_ingredients WHERE shopify_product_id = ?').run(shopifyId)
      const ins = db.prepare('INSERT INTO product_ingredients (shopify_product_id, supply_id, tbsp, sort_order) VALUES (?, ?, ?, ?)')
      ingredients.forEach((row: { supply_id: number; tbsp: number }, i: number) => {
        ins.run(shopifyId, row.supply_id, row.tbsp ?? 0, i)
      })
    }

    if (Array.isArray(packaging)) {
      db.prepare('DELETE FROM product_packaging WHERE shopify_product_id = ?').run(shopifyId)
      const ins = db.prepare('INSERT INTO product_packaging (shopify_product_id, supply_id) VALUES (?, ?)')
      packaging.forEach((supply_id: number) => ins.run(shopifyId, supply_id))
    }

    if (labor_cost != null || cost_per_unit != null) {
      db.prepare(`
        INSERT INTO product_local (shopify_product_id, labor_cost, cost_per_unit)
        VALUES (?, ?, ?)
        ON CONFLICT(shopify_product_id) DO UPDATE SET
          labor_cost = COALESCE(excluded.labor_cost, labor_cost),
          cost_per_unit = COALESCE(excluded.cost_per_unit, cost_per_unit)
      `).run(
        shopifyId,
        labor_cost != null ? parseFloat(labor_cost) : null,
        cost_per_unit != null ? parseFloat(cost_per_unit) : null,
      )
    }
  })()

  return NextResponse.json({ ok: true })
}
