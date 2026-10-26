import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = await getDb()
  const agents = (await db.execute({sql: 'SELECT * FROM agents ORDER BY sort_order ASC, id ASC', args: []})).rows
  return NextResponse.json(agents)
}

export async function POST(req: NextRequest) {
  const db = await getDb()
  const { name, description, system_prompt, model } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  const maxOrder = ((await db.execute({sql: 'SELECT COALESCE(MAX(sort_order), -1) as m FROM agents', args: []})).rows[0] as unknown as { m: number }).m
  const result = await db.execute({sql: 'INSERT INTO agents (name, description, system_prompt, model, sort_order) VALUES (?, ?, ?, ?, ?)', args: [name.trim(), description?.trim() || null, system_prompt?.trim() || '', model || 'claude-sonnet-4-6', maxOrder + 1]})
  const agent = (await db.execute({sql: 'SELECT * FROM agents WHERE id = ?', args: [Number(result.lastInsertRowid)]})).rows[0]
  return NextResponse.json(agent, { status: 201 })
}
