import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb()
  const { id } = await params
  const { name, description, system_prompt, model, active } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  db.prepare(
    'UPDATE agents SET name = ?, description = ?, system_prompt = ?, model = ?, active = ? WHERE id = ?'
  ).run(name.trim(), description?.trim() || null, system_prompt?.trim() || '', model || 'claude-sonnet-4-6', active ?? 1, id)
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id)
  return NextResponse.json(agent)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb()
  const { id } = await params
  db.prepare('DELETE FROM agents WHERE id = ?').run(id)
  return NextResponse.json({ ok: true })
}
