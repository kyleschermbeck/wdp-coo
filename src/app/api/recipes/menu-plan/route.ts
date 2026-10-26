import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

interface MenuPlanRow {
  theme: string
  notes: string
  blends: string
  recipes: string
  updated_at: string
}

export async function GET() {
  const db = getDb()
  const row = db.prepare('SELECT theme, notes, blends, recipes, updated_at FROM menu_plans WHERE id = 1').get() as MenuPlanRow | undefined
  if (!row) return NextResponse.json({ theme: '', notes: '', blends: [], recipes: [] })
  return NextResponse.json({
    theme: row.theme,
    notes: row.notes,
    blends: JSON.parse(row.blends),
    recipes: JSON.parse(row.recipes),
    updated_at: row.updated_at,
  })
}

export async function PUT(req: NextRequest) {
  const { theme, notes, blends, recipes } = await req.json() as {
    theme: string
    notes: string
    blends: string[]
    recipes: { role: string; dish: string; blend: string }[]
  }
  const db = getDb()
  db.prepare(`
    UPDATE menu_plans SET theme = ?, notes = ?, blends = ?, recipes = ?, updated_at = datetime('now') WHERE id = 1
  `).run(theme ?? '', notes ?? '', JSON.stringify(blends ?? []), JSON.stringify(recipes ?? []))
  return NextResponse.json({ ok: true })
}
