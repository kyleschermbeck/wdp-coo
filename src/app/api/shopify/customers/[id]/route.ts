import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getShopifyConfig, updateCustomer } from '@/lib/shopify'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await getDb()
  const config = await getShopifyConfig(db)
  if (!config?.access_token) return NextResponse.json({ error: 'Shopify not connected' }, { status: 400 })

  const patch = await req.json() as { note?: string; tags?: string }

  try {
    await updateCustomer(config, id, patch)
    await db.execute({sql: `
      UPDATE shopify_customers SET note = COALESCE(?, note), tags = COALESCE(?, tags) WHERE shopify_id = ?
    `, args: [patch.note ?? null, patch.tags ?? null, id]})
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
