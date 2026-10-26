import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  const { id } = await params
  const { name, description, system_prompt, model, active } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  await db.execute({sql: 'UPDATE agents SET name = ?, description = ?, system_prompt = ?, model = ?, active = ? WHERE id = ?', args: [name.trim(), description?.trim() || null, system_prompt?.trim() || '', model || 'claude-sonnet-4-6', active ?? 1, id]})
  const agent = (await db.execute({sql: 'SELECT * FROM agents WHERE id = ?', args: [id]})).rows[0]
  return NextResponse.json(agent)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await getDb()
  const { id } = await params
  await db.execute({sql: 'DELETE FROM agents WHERE id = ?', args: [id]})
  return NextResponse.json({ ok: true })
}
