import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getShopifyConfig, updateProduct, updateVariantPrice, updateInventoryLevel, fetchLocations } from '@/lib/shopify'

interface PatchBody {
  // Shopify product fields
  title?: string
  status?: string
  body_html?: string
  tags?: string
  product_type?: string
  vendor?: string
  // Variant fields
  price?: string
  compare_at_price?: string
  sku?: string
  weight?: number
  weight_unit?: string
  variant_id?: string
  // Inventory
  inventory_qty?: number
  inventory_item_id?: string
  inventory_item_cost?: string
  // Local only
  reorder_threshold?: number
  is_bundle?: number
  accent_color?: string | null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params  // shopify_id
  const db = await getDb()
  const config = await getShopifyConfig(db)
  if (!config?.access_token) return NextResponse.json({ error: 'Shopify not connected' }, { status: 400 })

  const body = await req.json() as PatchBody
  const errors: string[] = []

  // ── Product fields → Shopify products API ──────────────────────────────────
  const productPatchKeys = ['title', 'status', 'body_html', 'tags', 'product_type', 'vendor'] as const
  const productPatch: Record<string, string> = {}
  for (const k of productPatchKeys) {
    if (body[k] !== undefined) productPatch[k] = body[k] as string
  }

  if (Object.keys(productPatch).length > 0) {
    try {
      await updateProduct(config, id, productPatch)

      // Update local cache columns
      const updates: string[] = []
      const vals: (string | number)[] = []
      if (body.title !== undefined)   { updates.push('title = ?');  vals.push(body.title) }
      if (body.status !== undefined)  { updates.push('status = ?'); vals.push(body.status) }

      // Merge remaining fields into raw JSON
      const row = (await db.execute({sql: `SELECT raw FROM shopify_products WHERE shopify_id = ?`, args: [id]})).rows[0] as unknown as { raw: string } | undefined
      if (row) {
        const raw = JSON.parse(row.raw) as Record<string, unknown>
        for (const k of (['body_html', 'tags', 'product_type', 'vendor'] as const)) {
          if (body[k] !== undefined) raw[k] = body[k]
        }
        updates.push('raw = ?')
        vals.push(JSON.stringify(raw))
      }

      if (updates.length > 0) {
        await db.execute({sql: `UPDATE shopify_products SET ${updates.join(', ')} WHERE shopify_id = ?`, args: [...vals, id] as (string | number | boolean | null | bigint)[]})
      }
    } catch (err) {
      errors.push(`product: ${(err as Error).message}`)
    }
  }

  // ── Variant fields (price, compare_at_price, sku, weight) → Shopify variants API ──
  if ((body.price !== undefined || body.compare_at_price !== undefined || body.sku !== undefined || body.weight !== undefined || body.weight_unit !== undefined) && body.variant_id) {
    try {
      // updateVariantPrice only handles price; extend via direct fetch for other variant fields
      const variantPatch: Record<string, string> = { id: body.variant_id }
      if (body.price !== undefined)             variantPatch.price = body.price
      if (body.compare_at_price !== undefined)  variantPatch.compare_at_price = body.compare_at_price
      if (body.sku !== undefined)               variantPatch.sku = body.sku
      if (body.weight !== undefined)            variantPatch.weight = String(body.weight)
      if (body.weight_unit !== undefined)       variantPatch.weight_unit = body.weight_unit

      const { store_url, access_token } = config
      const res = await fetch(`https://${store_url}/admin/api/2024-01/variants/${body.variant_id}.json`, {
        method: 'PUT',
        headers: { 'X-Shopify-Access-Token': access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant: variantPatch }),
      })
      if (!res.ok) throw new Error(`variant update failed (${res.status})`)

      // Merge into raw JSON cache
      const row = (await db.execute({sql: `SELECT raw FROM shopify_products WHERE shopify_id = ?`, args: [id]})).rows[0] as unknown as { raw: string } | undefined
      if (row) {
        const raw = JSON.parse(row.raw) as { variants: Array<Record<string, unknown>> }
        raw.variants = raw.variants.map(v =>
          String(v.id) === body.variant_id ? { ...v, ...variantPatch } : v
        )
        await db.execute({sql: `UPDATE shopify_products SET raw = ? WHERE shopify_id = ?`, args: [JSON.stringify(raw), id]})
      }
    } catch (err) {
      errors.push(`variant: ${(err as Error).message}`)
    }
  }

  // ── Inventory qty → Shopify inventory API ──────────────────────────────────
  if (body.inventory_qty !== undefined && body.inventory_item_id) {
    try {
      let locationId = ((await db.execute({sql: `SELECT shopify_id FROM shopify_locations WHERE active = 1 LIMIT 1`, args: []})).rows[0] as unknown as { shopify_id: string } | undefined)?.shopify_id
      if (!locationId) {
        const locs = await fetchLocations(config)
        const active = locs.find(l => l.active)
        if (!active) throw new Error('No active location')
        locationId = String(active.id)
      }
      await updateInventoryLevel(config, body.inventory_item_id, locationId, body.inventory_qty)
      await db.execute({sql: `UPDATE shopify_products SET inventory_quantity = ? WHERE shopify_id = ?`, args: [body.inventory_qty, id]})
    } catch (err) {
      errors.push(`inventory: ${(err as Error).message}`)
    }
  }

  // ── Inventory item cost (COGS) → Shopify + local product_local ───────────
  if (body.inventory_item_cost !== undefined && body.inventory_item_id) {
    try {
      const { store_url, access_token } = config
      const res = await fetch(`https://${store_url}/admin/api/2024-01/inventory_items/${body.inventory_item_id}.json`, {
        method: 'PUT',
        headers: { 'X-Shopify-Access-Token': access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventory_item: { cost: body.inventory_item_cost } }),
      })
      if (!res.ok) throw new Error(`inventory item cost update failed (${res.status})`)
    } catch (err) {
      errors.push(`cost: ${(err as Error).message}`)
    }
    // Always save cost locally so COGS calculations match the inventory page exactly
    const costNum = parseFloat(body.inventory_item_cost)
    if (!isNaN(costNum)) {
      await db.execute({sql: `
        INSERT INTO product_local (shopify_product_id, cost_per_unit)
        VALUES (?, ?)
        ON CONFLICT(shopify_product_id) DO UPDATE SET cost_per_unit = excluded.cost_per_unit
      `, args: [id, costNum]})
    }
  }

  // ── is_bundle → local DB only ──────────────────────────────────────────────
  if (body.is_bundle !== undefined) {
    await db.execute({sql: `UPDATE shopify_products SET is_bundle = ? WHERE shopify_id = ?`, args: [body.is_bundle, id]})
  }

  // ── Reorder threshold → local DB only ─────────────────────────────────────
  if (body.reorder_threshold !== undefined) {
    await db.execute({sql: `
      INSERT INTO shopify_inventory_settings (shopify_product_id, reorder_threshold)
      VALUES (?, ?)
      ON CONFLICT(shopify_product_id) DO UPDATE SET reorder_threshold = excluded.reorder_threshold
    `, args: [id, body.reorder_threshold]})
  }

  // ── Accent color → local DB only ──────────────────────────────────────────
  if (body.accent_color !== undefined) {
    await db.execute({sql: `UPDATE shopify_products SET accent_color = ? WHERE shopify_id = ?`, args: [body.accent_color, id]})
  }

  if (errors.length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 207 })
  }
  return NextResponse.json({ ok: true })
}
