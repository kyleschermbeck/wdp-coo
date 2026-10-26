import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface BlendRow {
  shopify_id: string
  title: string
  inventory_quantity: number
  total_sold: number
}

interface JarRow {
  containers_on_hand: number
}

interface DateRangeRow {
  weeks: number
}

export interface FillRecommendation {
  shopifyId: string
  blend: string
  currentStock: number
  totalSold: number
  unitsPerWeek: number
  weeksOfStock: number | null  // null = no sales history
  suggestedFill: number
}

export interface FillRecommendationsResponse {
  jarsOnHand: number
  weeksOfHistory: number
  recommendations: FillRecommendation[]
}

export async function GET() {
  const db = await getDb()

  const jarRow = (await db.execute({sql: `SELECT containers_on_hand FROM supplies WHERE name = '8 oz. Jar' LIMIT 1`, args: []})).rows[0] as unknown as JarRow | undefined
  const jarsOnHand = Math.floor(jarRow?.containers_on_hand ?? 0)

  const dateRangeRow = (await db.execute({sql: `
    SELECT (julianday(MAX(created_at)) - julianday(MIN(created_at))) / 7.0 AS weeks
    FROM shopify_orders WHERE fulfillment_status = 'fulfilled'
  `, args: []})).rows[0] as unknown as DateRangeRow | undefined
  const weeks = dateRangeRow?.weeks ?? 1

  const blends = (await db.execute({sql: `
    SELECT
      sp.shopify_id,
      sp.title,
      sp.inventory_quantity,
      COALESCE(SUM(json_extract(li.value, '$.quantity')), 0) AS total_sold
    FROM shopify_products sp
    LEFT JOIN shopify_orders o ON o.fulfillment_status = 'fulfilled'
    LEFT JOIN json_each(o.line_items) li
      ON CAST(json_extract(li.value, '$.product_id') AS TEXT) = sp.shopify_id
    WHERE sp.status = 'active'
      AND sp.is_bundle = 0
      AND sp.title NOT IN ('Build A Bundle!')
    GROUP BY sp.shopify_id
    ORDER BY sp.title ASC
  `, args: []})).rows as unknown as BlendRow[]

  const recommendations: FillRecommendation[] = []
  let totalVelocity = 0

  for (const p of blends) {
    const totalSold = p.total_sold
    const unitsPerWeek = totalSold / weeks
    totalVelocity += unitsPerWeek
    const weeksOfStock = unitsPerWeek > 0 ? p.inventory_quantity / unitsPerWeek : null
    recommendations.push({
      shopifyId: p.shopify_id,
      blend: p.title,
      currentStock: p.inventory_quantity ?? 0,
      totalSold,
      unitsPerWeek: Math.round(unitsPerWeek * 100) / 100,
      weeksOfStock: weeksOfStock !== null ? Math.round(weeksOfStock * 10) / 10 : null,
      suggestedFill: 0, // calculated below
    })
  }

  // Allocate jars proportionally to velocity, weighted toward urgency
  // Score = velocity / max(1, weeksOfStock + 1) — faster movers with less stock get more
  let totalScore = 0
  const scores: number[] = recommendations.map(r => {
    const score = r.unitsPerWeek > 0
      ? r.unitsPerWeek / Math.max(1, (r.weeksOfStock ?? 0) + 1)
      : 0
    totalScore += score
    return score
  })

  if (totalScore > 0 && jarsOnHand > 0) {
    const raw = scores.map(s => (s / totalScore) * jarsOnHand)
    // floor first pass
    const floored = raw.map(Math.floor)
    let remainder = jarsOnHand - floored.reduce((a, b) => a + b, 0)
    // distribute remainder to highest fractional parts
    const fractions = raw.map((v, i) => ({ i, frac: v - floored[i] }))
    fractions.sort((a, b) => b.frac - a.frac)
    for (let k = 0; k < remainder; k++) floored[fractions[k].i]++
    recommendations.forEach((r, i) => { r.suggestedFill = floored[i] })
  }

  // Sort: urgency first (least weeks of stock), then no-history blends at end
  recommendations.sort((a, b) => {
    if (a.weeksOfStock === null && b.weeksOfStock === null) return a.blend.localeCompare(b.blend)
    if (a.weeksOfStock === null) return 1
    if (b.weeksOfStock === null) return -1
    return a.weeksOfStock - b.weeksOfStock
  })

  return NextResponse.json({
    jarsOnHand,
    weeksOfHistory: Math.round(weeks * 10) / 10,
    recommendations,
  } satisfies FillRecommendationsResponse)
}
