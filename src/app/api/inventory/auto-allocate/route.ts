import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface OrderRow { order_number: number; line_items: string }
interface LineItem { product_id: number; fulfillable_quantity: number; quantity: number; properties?: { name: string; value: string }[] }
interface ProductTitle { shopify_id: string; title: string }

export async function POST(req: NextRequest) {
  const { shopify_id, new_qty } = await req.json() as { shopify_id: string; new_qty?: number }
  if (!shopify_id) return NextResponse.json({ error: 'shopify_id required' }, { status: 400 })

  const db = await getDb()

  // If new_qty is provided (e.g. downward correction from product tab), write it first
  if (new_qty !== undefined) {
    await db.execute({ sql: `UPDATE shopify_products SET inventory_quantity = ? WHERE shopify_id = ?`, args: [new_qty, shopify_id] })
  }

  const product = (await db.execute({ sql: `SELECT inventory_quantity FROM shopify_products WHERE shopify_id = ?`, args: [shopify_id] })).rows[0] as unknown as { inventory_quantity: number } | undefined
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const allProducts = (await db.execute({ sql: `SELECT shopify_id, title FROM shopify_products`, args: [] })).rows as unknown as ProductTitle[]
  const titleToId: Record<string, string> = {}
  for (const p of allProducts) titleToId[p.title] = p.shopify_id

  const openOrders = (await db.execute({ sql: `
    SELECT order_number, line_items FROM shopify_orders
    WHERE fulfillment_status IS NULL OR fulfillment_status IN ('unfulfilled','partial')
    ORDER BY created_at ASC
  `, args: [] })).rows as unknown as OrderRow[]

  const orderQtys: { orderNumber: number; needed: number }[] = []
  let totalNeeded = 0
  for (const o of openOrders) {
    let items: LineItem[] = []
    try { items = JSON.parse(o.line_items) } catch { continue }
    let needed = 0
    for (const item of items) {
      const hasBundleProps = item.properties?.some(p => !p.name.startsWith('_'))
      if (hasBundleProps && item.properties) {
        for (const prop of item.properties) {
          if (prop.name.startsWith('_')) continue
          if (titleToId[prop.name] === shopify_id) needed += parseInt(prop.value) || 0
        }
      } else if (String(item.product_id) === shopify_id) {
        needed += item.fulfillable_quantity ?? item.quantity ?? 0
      }
    }
    if (needed > 0) { orderQtys.push({ orderNumber: o.order_number, needed }); totalNeeded += needed }
  }

  let available = Math.max(0, totalNeeded + product.inventory_quantity)
  await db.execute({ sql: `DELETE FROM pack_assignments WHERE shopify_product_id = ?`, args: [shopify_id] })
  for (const { orderNumber, needed } of orderQtys) {
    const fill = Math.min(needed, available)
    if (fill > 0) await db.execute({ sql: `INSERT INTO pack_assignments (shopify_product_id, order_number, qty) VALUES (?, ?, ?)`, args: [shopify_id, orderNumber, fill] })
    available -= fill
    if (available <= 0) break
  }

  return NextResponse.json({ ok: true, allocated: orderQtys.length })
}
