import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getShopifyConfig, cancelOrder } from '@/lib/shopify'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await getDb()
  const config = await getShopifyConfig(db)
  if (!config?.access_token) return NextResponse.json({ error: 'Shopify not connected' }, { status: 400 })

  try {
    await cancelOrder(config, parseInt(id))
    await db.execute({sql: `UPDATE shopify_orders SET financial_status = 'voided', fulfillment_status = 'cancelled' WHERE shopify_id = ?`, args: [id]})
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
