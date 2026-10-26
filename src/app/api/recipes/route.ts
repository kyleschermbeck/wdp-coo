import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// GET /api/recipes — list all saved recipes
export async function GET(req: NextRequest) {
  const db = await getDb()
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? 'all'
  const blend = searchParams.get('blend')

  let q = `SELECT id, title, tagline, description, blend_used,
             ingredients, instructions, notes, status, tags, created_by, created_at
           FROM recipes WHERE 1=1`
  const params: unknown[] = []
  if (status && status !== 'all') { q += ' AND status = ?'; params.push(status) }
  if (blend) { q += ' AND blend_used LIKE ?'; params.push(`%${blend}%`) }
  q += ' ORDER BY created_at DESC'

  try {
    const rows = (await db.execute({sql: q, args: params as (string | number | boolean | null | bigint)[]})).rows
    return NextResponse.json({ recipes: rows })
  } catch {
    return NextResponse.json({ recipes: [] })
  }
}

// POST /api/recipes — save a generated recipe
export async function POST(req: NextRequest) {
  const db = await getDb()
  const body = await req.json() as {
    title: string
    tagline?: string
    description?: string
    blend_used?: string
    ingredients?: string
    instructions?: string
    notes?: string
    status?: string
  }

  try {
    const result = await db.execute({sql: `
      INSERT INTO recipes (title, tagline, description, blend_used, ingredients, instructions, notes, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'user')
    `, args: [body.title,
      body.tagline ?? null,
      body.description ?? null,
      body.blend_used ?? null,
      body.ingredients ?? null,
      body.instructions ?? null,
      body.notes ?? null,
      body.status ?? 'draft',]})
    return NextResponse.json({ ok: true, id: Number(result.lastInsertRowid) })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// PATCH /api/recipes?id=N — update one or more fields
const PATCHABLE = ['status', 'title', 'description', 'tagline', 'blend_used', 'ingredients', 'instructions', 'notes', 'tags'] as const
export async function PATCH(req: NextRequest) {
  const db = await getDb()
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const body = await req.json() as Record<string, string>
  const updates = Object.entries(body).filter(([k]) => (PATCHABLE as readonly string[]).includes(k))
  if (!updates.length) return NextResponse.json({ error: 'no valid fields' }, { status: 400 })
  const setClauses = updates.map(([k]) => `${k} = ?`).join(', ')
  const values = updates.map(([, v]) => v)
  await db.execute({sql: `UPDATE recipes SET ${setClauses} WHERE id = ?`, args: [...values, parseInt(id)]})
  return NextResponse.json({ ok: true })
}

// DELETE /api/recipes?id=N — delete a recipe
export async function DELETE(req: NextRequest) {
  const db = await getDb()
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await db.execute({sql: 'DELETE FROM recipes WHERE id = ?', args: [parseInt(id)]})
  return NextResponse.json({ ok: true })
}
