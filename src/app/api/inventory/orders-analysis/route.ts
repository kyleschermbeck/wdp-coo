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
  price: string
  sku: string
  variant_title: string | null
  properties?: LineItemProperty[]
}

interface ExpandedItem {
  title: string
  variantTitle: string | null
  sku: string
  price: string
  quantity: number
  productId: string  // shopify_id as string
  fromBundle: boolean
}

interface OrderRow {
  id: number
  shopify_id: string
  order_number: number
  email: string
  total_price: number
  fulfillment_status: string | null
  financial_status: string
  line_items: string
  created_at: string
}

interface ProductStock {
  shopify_id: string
  inventory_quantity: number
}

interface AssignmentRow {
  shopify_product_id: string
  order_number: number
  qty: number
}

export async function GET() {
  const db = getDb()

  const orders = db.prepare(`
    SELECT id, shopify_id, order_number, email, total_price,
           fulfillment_status, financial_status, line_items, created_at
    FROM shopify_orders
    WHERE fulfillment_status IS NULL OR fulfillment_status IN ('unfulfilled', 'partial')
    ORDER BY created_at ASC
  `).all() as OrderRow[]

  const products = db.prepare(
    `SELECT shopify_id, title, inventory_quantity FROM shopify_products WHERE status != 'archived'`
  ).all() as (ProductStock & { title: string })[]

  // Use raw inventory_quantity (can be negative = behind on packing)
  const stockMap: Record<string, number> = {}
  const titleToId: Record<string, string> = {}
  for (const p of products) {
    stockMap[p.shopify_id] = p.inventory_quantity
    titleToId[p.title] = p.shopify_id
  }

  // Expand a raw line items array, breaking out bundle items into individual products
  function expandItems(rawItems: LineItem[]): ExpandedItem[] {
    const out: ExpandedItem[] = []
    for (const item of rawItems) {
      const qty = item.fulfillable_quantity ?? item.quantity ?? 0
      if (!qty) continue
      const hasBundleProps = item.properties?.some(p => !p.name.startsWith('_'))
      if (hasBundleProps && item.properties) {
        for (const prop of item.properties) {
          if (prop.name.startsWith('_')) continue
          const propQty = parseInt(prop.value)
          if (!propQty) continue
          const sid = titleToId[prop.name] ?? ''
          out.push({ title: prop.name, variantTitle: null, sku: '', price: item.price, quantity: propQty, productId: sid, fromBundle: true })
        }
      } else {
        out.push({ title: item.title, variantTitle: item.variant_title, sku: item.sku, price: item.price, quantity: qty, productId: String(item.product_id), fromBundle: false })
      }
    }
    return out
  }

  // First pass: total fulfillable jars needed per product across all orders
  const totalNeededByProduct: Record<string, number> = {}
  for (const order of orders) {
    let items: LineItem[] = []
    try { items = JSON.parse(order.line_items) } catch { continue }
    for (const ei of expandItems(items)) {
      totalNeededByProduct[ei.productId] = (totalNeededByProduct[ei.productId] ?? 0) + ei.quantity
    }
  }

  // FIFO pool: after reset, inventory = -(total needed), so jars packed = total_needed + inventory_qty.
  const remaining: Record<string, number> = {}
  for (const [pid, needed] of Object.entries(totalNeededByProduct)) {
    const inventoryQty = stockMap[pid] ?? 0
    remaining[pid] = Math.max(0, needed + inventoryQty)
  }

  // Load stored manual assignments (sum by product+order in case of multiple runs)
  const assignmentRows = db.prepare(`
    SELECT shopify_product_id, order_number, SUM(qty) as qty
    FROM pack_assignments GROUP BY shopify_product_id, order_number
  `).all() as AssignmentRow[]

  // { productId -> { orderNumber -> assignedQty } }
  const storedAssignments: Record<string, Record<number, number>> = {}
  for (const row of assignmentRows) {
    if (!storedAssignments[row.shopify_product_id]) storedAssignments[row.shopify_product_id] = {}
    storedAssignments[row.shopify_product_id][row.order_number] = row.qty
  }

  const result = orders.map(order => {
    let rawItems: LineItem[] = []
    try { rawItems = JSON.parse(order.line_items) } catch { /* skip */ }

    const expandedItems = expandItems(rawItems)

    const analyzed = expandedItems.map(ei => {
        const needed = ei.quantity
        const pid = ei.productId
        const inventoryQty = stockMap[pid] ?? 0
        const onHand = Math.max(0, (totalNeededByProduct[pid] ?? 0) + inventoryQty)

        const storedAssigned = storedAssignments[pid]?.[order.order_number]
        const avail = remaining[pid] ?? 0
        const fifoFill = Math.min(needed, avail)
        const canFill = storedAssigned !== undefined
          ? Math.min(Math.max(storedAssigned, fifoFill), needed, avail)
          : fifoFill
        remaining[pid] = avail - canFill

        return {
          title: ei.title,
          variantTitle: ei.variantTitle,
          sku: ei.sku,
          price: ei.price,
          needed,
          inventoryQty,
          onHand,
          canFill,
          short: needed - canFill,
          productId: pid,
          assignedQty: storedAssigned ?? 0,
          fromBundle: ei.fromBundle,
        }
      })

    const totalNeeded = analyzed.reduce((s, i) => s + i.needed, 0)
    const totalCanFill = analyzed.reduce((s, i) => s + i.canFill, 0)
    // Order-level deficit: how many jars short across all items in this order
    const totalShort = totalNeeded - totalCanFill

    const status: 'ready' | 'partial' | 'short' =
      totalShort === 0 ? 'ready' : totalCanFill === 0 ? 'short' : 'partial'

    return {
      orderId: order.id,
      shopifyId: order.shopify_id,
      orderNumber: order.order_number,
      email: order.email,
      totalPrice: order.total_price,
      financialStatus: order.financial_status,
      fulfillmentStatus: order.fulfillment_status,
      createdAt: order.created_at,
      items: analyzed,
      totalNeeded,
      totalCanFill,
      totalShort,
      status,
    }
  })

  // Sort: ready first, then partial, then short
  const order = { ready: 0, partial: 1, short: 2 }
  result.sort((a, b) => order[a.status] - order[b.status])

  return NextResponse.json(result)
}
