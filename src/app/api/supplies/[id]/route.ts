import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb()
  const { id } = await params
  const body = await req.json()
  const { name, vendor, order_url, package_weight, package_extra_oz, serving_size, serving_unit, total_servings, package_cost, category, active } = body

  const pkgLbs = package_weight != null ? parseFloat(package_weight) : null
  const pkgExtraOz = package_extra_oz != null ? parseFloat(package_extra_oz) : 0
  const servSize = serving_size != null ? parseFloat(serving_size) : null
  const servUnit = serving_unit === 'tsp' ? 'tsp' : 'oz'
  const totalServings = total_servings != null ? parseInt(total_servings) : 0
  const pkgCost = package_cost != null ? parseFloat(package_cost) : null
  const pkgOz = (pkgLbs ?? 0) * 16 + pkgExtraOz
  let ozPerTbsp: number | null = null
  if (servSize && totalServings && pkgOz) {
    if (servUnit === 'tsp') {
      const totalTbsp = (totalServings * servSize) / 3
      ozPerTbsp = totalTbsp > 0 ? pkgOz / totalTbsp : null
    } else {
      ozPerTbsp = servSize > 0 ? servSize : null
    }
  }

  db.prepare(`
    UPDATE supplies SET name=?, vendor=?, order_url=?, package_weight=?, weight_unit='lb',
    package_extra_oz=?, serving_size=?, serving_unit=?, total_servings=?,
    package_cost=?, oz_per_tbsp=?, category=?, active=?
    WHERE id=?
  `).run(
    name?.trim() || null, vendor || null, order_url || null,
    pkgLbs,
    pkgExtraOz,
    servSize,
    servUnit,
    totalServings,
    pkgCost,
    ozPerTbsp,
    category || 'product',
    active === false ? 0 : 1,
    id
  )
  const row = db.prepare('SELECT * FROM supplies WHERE id = ?').get(id)
  return NextResponse.json(row)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb()
  const { id } = await params
  db.prepare('DELETE FROM supplies WHERE id = ?').run(id)
  return NextResponse.json({ ok: true })
}
