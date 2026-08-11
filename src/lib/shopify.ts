import Database from 'better-sqlite3'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShopifyConfig {
  id: number
  store_url: string
  access_token: string
  last_synced_at: string | null
}

export interface ShopifyLineItem {
  id: number
  product_id: number | null
  variant_id: number | null
  inventory_item_id: number | null
  title: string
  quantity: number
  price: string
  variant_title: string | null
}

export interface ShopifyDiscountCode {
  code: string
  amount: string
  type: string
}

export interface ShopifyShippingLine {
  price: string
}

export interface ShopifyOrder {
  id: number
  order_number: number
  email: string | null
  total_price: string
  subtotal_price: string
  total_tax: string
  total_discounts: string
  shipping_lines: ShopifyShippingLine[]
  discount_codes: ShopifyDiscountCode[]
  financial_status: string
  fulfillment_status: string | null
  line_items: ShopifyLineItem[]
  created_at: string
  processed_at: string | null
}

export interface ShopifyProductVariant {
  id: number
  inventory_item_id: number
  inventory_quantity: number
  price: string
  title: string
}

export interface ShopifyProduct {
  id: number
  title: string
  handle: string
  status: string
  variants: ShopifyProductVariant[]
}

export interface ShopifyCustomer {
  id: number
  email: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  orders_count: number
  total_spent: string
  tags: string
  note: string | null
  created_at: string
  updated_at: string
}

export interface ShopifyLocation {
  id: number
  name: string
  active: boolean
}

export interface ShopifyShop {
  id: number
  name: string
  email: string
  myshopify_domain: string
}

export interface ShopifyFetchOrdersParams {
  created_at_min?: string
  created_at_max?: string
  limit?: number
  status?: string
}

export interface SyncResult {
  orders_synced: number
  products_synced: number
  customers_synced: number
  synced_at: string
}

// ─── Config ───────────────────────────────────────────────────────────────────

export function getShopifyConfig(db: Database.Database): ShopifyConfig | null {
  const row = db.prepare('SELECT * FROM shopify_config WHERE id = 1').get() as ShopifyConfig | undefined
  return row ?? null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function shopifyFetch(config: ShopifyConfig, path: string, options: RequestInit = {}) {
  return fetch(`https://${config.store_url}/admin/api/2024-01${path}`, {
    ...options,
    headers: {
      'X-Shopify-Access-Token': config.access_token,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
}

// ─── Connection test ──────────────────────────────────────────────────────────

export async function testShopifyConnection(config: ShopifyConfig): Promise<ShopifyShop> {
  const res = await shopifyFetch(config, '/shop.json')
  if (!res.ok) throw new Error(`Shopify connection failed (${res.status}): ${await res.text()}`)
  const data = await res.json() as { shop: ShopifyShop }
  return data.shop
}

// ─── Fetch orders ─────────────────────────────────────────────────────────────

export async function fetchOrders(
  config: ShopifyConfig,
  params: ShopifyFetchOrdersParams = {},
): Promise<ShopifyOrder[]> {
  const query = new URLSearchParams({
    limit: String(params.limit ?? 250),
    status: params.status ?? 'any',
  })
  if (params.created_at_min) query.set('created_at_min', params.created_at_min)
  if (params.created_at_max) query.set('created_at_max', params.created_at_max)

  const res = await shopifyFetch(config, `/orders.json?${query}`)
  if (!res.ok) throw new Error(`Failed to fetch orders (${res.status}): ${await res.text()}`)
  const data = await res.json() as { orders: ShopifyOrder[] }
  return data.orders
}

// ─── Fetch products ───────────────────────────────────────────────────────────

export async function fetchProducts(config: ShopifyConfig): Promise<ShopifyProduct[]> {
  const res = await shopifyFetch(config, '/products.json?limit=250')
  if (!res.ok) throw new Error(`Failed to fetch products (${res.status}): ${await res.text()}`)
  const data = await res.json() as { products: ShopifyProduct[] }
  return data.products
}

// ─── Fetch customers ──────────────────────────────────────────────────────────

export async function fetchCustomers(config: ShopifyConfig): Promise<ShopifyCustomer[]> {
  const res = await shopifyFetch(config, '/customers.json?limit=250')
  if (!res.ok) throw new Error(`Failed to fetch customers (${res.status}): ${await res.text()}`)
  const data = await res.json() as { customers: ShopifyCustomer[] }
  return data.customers
}

// ─── Fetch locations ──────────────────────────────────────────────────────────

export async function fetchLocations(config: ShopifyConfig): Promise<ShopifyLocation[]> {
  const res = await shopifyFetch(config, '/locations.json')
  if (!res.ok) throw new Error(`Failed to fetch locations (${res.status}): ${await res.text()}`)
  const data = await res.json() as { locations: ShopifyLocation[] }
  return data.locations
}

// ─── Order actions ────────────────────────────────────────────────────────────

export async function fulfillOrder(
  config: ShopifyConfig,
  orderId: number,
  locationId: string,
): Promise<void> {
  // Create fulfillment order first
  const foRes = await shopifyFetch(config, `/orders/${orderId}/fulfillment_orders.json`)
  if (!foRes.ok) throw new Error(`Failed to get fulfillment orders (${foRes.status})`)
  const foData = await foRes.json() as { fulfillment_orders: Array<{ id: number }> }
  const fulfillmentOrderIds = foData.fulfillment_orders.map(fo => ({ fulfillment_order_id: fo.id }))

  const res = await shopifyFetch(config, '/fulfillments.json', {
    method: 'POST',
    body: JSON.stringify({
      fulfillment: {
        message: 'Fulfilled via WDP Dashboard',
        notify_customer: true,
        line_items_by_fulfillment_order: fulfillmentOrderIds,
      },
    }),
  })
  if (!res.ok) throw new Error(`Failed to fulfill order (${res.status}): ${await res.text()}`)
}

export async function cancelOrder(config: ShopifyConfig, orderId: number): Promise<void> {
  const res = await shopifyFetch(config, `/orders/${orderId}/cancel.json`, { method: 'POST', body: '{}' })
  if (!res.ok) throw new Error(`Failed to cancel order (${res.status}): ${await res.text()}`)
}

// ─── Inventory actions ────────────────────────────────────────────────────────

export async function updateInventoryLevel(
  config: ShopifyConfig,
  inventoryItemId: string,
  locationId: string,
  available: number,
): Promise<void> {
  const res = await shopifyFetch(config, '/inventory_levels/set.json', {
    method: 'POST',
    body: JSON.stringify({ inventory_item_id: inventoryItemId, location_id: locationId, available }),
  })
  if (!res.ok) throw new Error(`Failed to update inventory (${res.status}): ${await res.text()}`)
}

// ─── Product/price actions ────────────────────────────────────────────────────

export async function updateVariantPrice(
  config: ShopifyConfig,
  variantId: string,
  price: string,
): Promise<void> {
  const res = await shopifyFetch(config, `/variants/${variantId}.json`, {
    method: 'PUT',
    body: JSON.stringify({ variant: { id: variantId, price } }),
  })
  if (!res.ok) throw new Error(`Failed to update variant price (${res.status}): ${await res.text()}`)
}

// ─── Customer actions ─────────────────────────────────────────────────────────

export interface ShopifyProductPatch {
  title?: string
  status?: string
  body_html?: string
  tags?: string
  product_type?: string
  vendor?: string
}

export interface ShopifyProductCreate {
  title: string
  body_html?: string
  vendor?: string
  product_type?: string
  tags?: string
  status?: string
  variants?: Array<{ price: string; compare_at_price?: string; sku?: string }>
}

export async function updateProduct(
  config: ShopifyConfig,
  productId: string,
  patch: ShopifyProductPatch,
): Promise<void> {
  const res = await shopifyFetch(config, `/products/${productId}.json`, {
    method: 'PUT',
    body: JSON.stringify({ product: { id: productId, ...patch } }),
  })
  if (!res.ok) throw new Error(`Failed to update product (${res.status}): ${await res.text()}`)
}

export async function createProduct(
  config: ShopifyConfig,
  data: ShopifyProductCreate,
): Promise<ShopifyProduct & { body_html?: string; tags?: string; vendor?: string }> {
  const res = await shopifyFetch(config, '/products.json', {
    method: 'POST',
    body: JSON.stringify({
      product: {
        vendor: 'Weeknight Dinner Party',
        status: 'draft',
        ...data,
      },
    }),
  })
  if (!res.ok) throw new Error(`Failed to create product (${res.status}): ${await res.text()}`)
  const json = await res.json() as { product: ShopifyProduct & { body_html?: string; tags?: string; vendor?: string } }
  return json.product
}

export async function updateCustomer(
  config: ShopifyConfig,
  customerId: string,
  patch: { note?: string; tags?: string },
): Promise<void> {
  const res = await shopifyFetch(config, `/customers/${customerId}.json`, {
    method: 'PUT',
    body: JSON.stringify({ customer: { id: customerId, ...patch } }),
  })
  if (!res.ok) throw new Error(`Failed to update customer (${res.status}): ${await res.text()}`)
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

export async function syncShopifyData(db: Database.Database): Promise<SyncResult> {
  const config = getShopifyConfig(db)
  if (!config) throw new Error('Shopify not configured')

  // ── Orders (90 days) — graceful if read_all_orders scope is missing ──
  let ordersCount = 0
  try {
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    const orders = await fetchOrders(config, { created_at_min: ninetyDaysAgo.toISOString(), limit: 250 })

    const upsertOrder = db.prepare(`
      INSERT INTO shopify_orders
        (shopify_id, order_number, email, total_price, subtotal_price, total_tax,
         total_discounts, total_shipping, discount_codes, financial_status,
         fulfillment_status, line_items, created_at, processed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(shopify_id) DO UPDATE SET
        order_number = excluded.order_number,
        email = excluded.email,
        total_price = excluded.total_price,
        subtotal_price = excluded.subtotal_price,
        total_tax = excluded.total_tax,
        total_discounts = excluded.total_discounts,
        total_shipping = excluded.total_shipping,
        discount_codes = excluded.discount_codes,
        financial_status = excluded.financial_status,
        fulfillment_status = excluded.fulfillment_status,
        line_items = excluded.line_items,
        created_at = excluded.created_at,
        processed_at = excluded.processed_at,
        synced_at = datetime('now')
    `)

    db.transaction(() => {
      for (const o of orders) {
        const totalShipping = (o.shipping_lines ?? []).reduce(
          (sum, s) => sum + parseFloat(s.price ?? '0'), 0
        )
        upsertOrder.run(
          String(o.id), o.order_number, o.email ?? null,
          parseFloat(o.total_price), parseFloat(o.subtotal_price),
          parseFloat(o.total_tax ?? '0'), parseFloat(o.total_discounts ?? '0'),
          totalShipping, JSON.stringify(o.discount_codes ?? []),
          o.financial_status, o.fulfillment_status ?? null,
          JSON.stringify(o.line_items), o.created_at, o.processed_at ?? null,
        )
      }
    })()
    ordersCount = orders.length
  } catch (err) {
    console.warn('[Shopify sync] Orders skipped (missing read_all_orders scope?):', (err as Error).message)
  }

  // ── Products ──
  const shopifyProducts = await fetchProducts(config)
  const localProducts = db.prepare('SELECT id, slug FROM products').all() as { id: number; slug: string }[]
  const slugToId = new Map(localProducts.map(p => [p.slug, p.id]))

  const upsertProduct = db.prepare(`
    INSERT INTO shopify_products
      (shopify_id, title, handle, status, inventory_quantity, inventory_item_id, product_id, raw)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(shopify_id) DO UPDATE SET
      title = excluded.title,
      handle = excluded.handle,
      status = excluded.status,
      inventory_quantity = excluded.inventory_quantity,
      inventory_item_id = excluded.inventory_item_id,
      product_id = excluded.product_id,
      raw = excluded.raw,
      synced_at = datetime('now')
  `)

  db.transaction(() => {
    for (const p of shopifyProducts) {
      const totalInventory = p.variants.reduce((sum, v) => sum + (v.inventory_quantity ?? 0), 0)
      const localId = slugToId.get(p.handle) ?? null
      const inventoryItemId = p.variants[0]?.inventory_item_id ? String(p.variants[0].inventory_item_id) : null
      upsertProduct.run(
        String(p.id), p.title, p.handle, p.status,
        totalInventory, inventoryItemId, localId, JSON.stringify(p),
      )
    }
  })()

  // ── Customers ──
  const customers = await fetchCustomers(config)

  const upsertCustomer = db.prepare(`
    INSERT INTO shopify_customers
      (shopify_id, email, first_name, last_name, phone, orders_count, total_spent, tags, note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(shopify_id) DO UPDATE SET
      email = excluded.email,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      phone = excluded.phone,
      orders_count = excluded.orders_count,
      total_spent = excluded.total_spent,
      tags = excluded.tags,
      note = excluded.note,
      updated_at = excluded.updated_at,
      synced_at = datetime('now')
  `)

  db.transaction(() => {
    for (const c of customers) {
      upsertCustomer.run(
        String(c.id), c.email ?? null, c.first_name ?? null, c.last_name ?? null,
        c.phone ?? null, c.orders_count, parseFloat(c.total_spent),
        c.tags, c.note ?? null, c.created_at, c.updated_at,
      )
    }
  })()

  // ── Locations ──
  const locations = await fetchLocations(config)
  const upsertLocation = db.prepare(`
    INSERT INTO shopify_locations (shopify_id, name, active)
    VALUES (?, ?, ?)
    ON CONFLICT(shopify_id) DO UPDATE SET name = excluded.name, active = excluded.active
  `)
  db.transaction(() => {
    for (const l of locations) {
      upsertLocation.run(String(l.id), l.name, l.active ? 1 : 0)
    }
  })()

  const now = new Date().toISOString()
  db.prepare('UPDATE shopify_config SET last_synced_at = ? WHERE id = 1').run(now)

  return { orders_synced: ordersCount, products_synced: shopifyProducts.length, customers_synced: customers.length, synced_at: now }
}
