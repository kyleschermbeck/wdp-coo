import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = await getDb()
  const rows = (await db.execute({sql: 'SELECT * FROM supplies ORDER BY category, name', args: []})).rows
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const db = await getDb()
  const body = await req.json()
  const { name, vendor, order_url, package_weight, package_extra_oz, serving_size, serving_unit, total_servings, package_cost, category, active } = body

  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const pkgLbs = package_weight ? parseFloat(package_weight) : null
  const pkgExtraOz = package_extra_oz ? parseFloat(package_extra_oz) : 0
  const servSize = serving_size ? parseFloat(serving_size) : null
  const servUnit = serving_unit === 'tsp' ? 'tsp' : serving_unit === 'tbsp' ? 'tbsp' : 'oz'
  const totalServings = total_servings ? parseInt(total_servings) : 0
  const pkgCost = package_cost ? parseFloat(package_cost) : null
  const pkgOz = (pkgLbs ?? 0) * 16 + pkgExtraOz
  let ozPerTbsp: number | null = null
  if (servSize && totalServings && pkgOz) {
    if (servUnit === 'tbsp') {
      const totalTbsp = totalServings * servSize
      ozPerTbsp = totalTbsp > 0 ? pkgOz / totalTbsp : null
    } else if (servUnit === 'tsp') {
      const totalTbsp = (totalServings * servSize) / 3
      ozPerTbsp = totalTbsp > 0 ? pkgOz / totalTbsp : null
    } else {
      ozPerTbsp = servSize > 0 ? servSize : null
    }
  }

  const result = await db.execute({sql: `
    INSERT INTO supplies (name, vendor, order_url, package_weight, weight_unit, package_extra_oz, serving_size, serving_unit, total_servings, package_cost, oz_per_tbsp, category, active)
    VALUES (?, ?, ?, ?, 'lb', ?, ?, ?, ?, ?, ?, ?, ?)
  `, args: [name.trim(), vendor || null, order_url || null, pkgLbs, pkgExtraOz, servSize, servUnit, totalServings, pkgCost, ozPerTbsp, category || 'product', active === false ? 0 : 1]})
  const row = (await db.execute({sql: 'SELECT * FROM supplies WHERE id = ?', args: [Number(result.lastInsertRowid)]})).rows[0]
  return NextResponse.json(row, { status: 201 })
}
