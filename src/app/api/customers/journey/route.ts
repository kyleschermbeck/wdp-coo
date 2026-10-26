import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface LineItem {
  title: string
  quantity: number
  price: string
  variant_title?: string | null
}

interface OrderRow {
  shopify_id: string
  order_number: number
  total_price: number
  subtotal_price: number
  financial_status: string
  fulfillment_status: string | null
  line_items: string
  created_at: string
  discount_codes: string | null
}

interface ProfileListRow {
  list_id: string
  list_name: string
}

interface ProfileRow {
  klaviyo_id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  created: string | null
}

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email')
  if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 })

  const db = await getDb()

  // ── Shopify orders for this email ──
  const orders = (await db.execute({sql: `
    SELECT shopify_id, order_number, total_price, subtotal_price,
           financial_status, fulfillment_status, line_items, created_at, discount_codes
    FROM shopify_orders
    WHERE lower(email) = lower(?)
    ORDER BY created_at ASC
  `, args: [email]})).rows as unknown as OrderRow[]

  const parsedOrders = orders.map(o => {
    let items: LineItem[] = []
    try { items = JSON.parse(o.line_items) as LineItem[] } catch { /* ignore */ }
    return {
      ...o,
      items: items.map(i => ({
        title: i.title,
        quantity: i.quantity,
        price: parseFloat(i.price ?? '0'),
        variant_title: i.variant_title ?? null,
      })),
      line_items: undefined,  // don't expose raw JSON
    }
  })

  // ── Klaviyo profile + list memberships ──
  const klaviyoProfiles = (await db.execute({sql: `
    SELECT klaviyo_id, email, first_name, last_name, created
    FROM klaviyo_profiles
    WHERE lower(email) = lower(?)
    ORDER BY created ASC
  `, args: [email]})).rows as unknown as ProfileRow[]

  // Use the earliest Klaviyo profile if multiple exist
  const klaviyoProfile = klaviyoProfiles[0] ?? null

  const lists: ProfileListRow[] = klaviyoProfile
    ? (await db.execute({sql: `
        SELECT list_id, list_name FROM klaviyo_profile_lists
        WHERE profile_id = ?
      `, args: [klaviyoProfile.klaviyo_id]})).rows as unknown as ProfileListRow[]
    : []

  // ── Derived metrics ──
  const firstOrderDate  = parsedOrders[0]?.created_at ?? null
  const lastOrderDate   = parsedOrders[parsedOrders.length - 1]?.created_at ?? null
  const totalSpent      = parsedOrders.reduce((s, o) => s + (o.total_price ?? 0), 0)
  const subscribedDate  = klaviyoProfile?.created ?? null

  let daysToFirstPurchase: number | null = null
  if (subscribedDate && firstOrderDate) {
    const subMs = new Date(subscribedDate).getTime()
    const buyMs = new Date(firstOrderDate).getTime()
    daysToFirstPurchase = Math.round((buyMs - subMs) / 86_400_000)
  }

  // Best-selling product for this customer
  const productCount: Record<string, number> = {}
  for (const o of parsedOrders) {
    for (const item of o.items) {
      productCount[item.title] = (productCount[item.title] ?? 0) + item.quantity
    }
  }
  const favoriteProduct = Object.entries(productCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  // ── Subscribers who haven't purchased (for the broader list endpoint) ──
  // (not needed per-customer, but included as a flag)
  const hasOrders = parsedOrders.length > 0

  return NextResponse.json({
    email,
    orders: parsedOrders,
    klaviyo_profile: klaviyoProfile,
    lists,
    metrics: {
      total_orders:           parsedOrders.length,
      total_spent:            totalSpent,
      avg_order_value:        parsedOrders.length > 0 ? totalSpent / parsedOrders.length : 0,
      first_order_date:       firstOrderDate,
      last_order_date:        lastOrderDate,
      subscribed_date:        subscribedDate,
      days_to_first_purchase: daysToFirstPurchase,
      favorite_product:       favoriteProduct,
      in_klaviyo:             !!klaviyoProfile,
      has_ordered:            hasOrders,
      is_prospect:            !!klaviyoProfile && !hasOrders,
    },
  })
}
