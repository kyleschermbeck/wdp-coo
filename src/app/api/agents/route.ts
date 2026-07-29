import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = getDb()
  const agents = db.prepare('SELECT * FROM agents ORDER BY sort_order ASC, id ASC').all()
  return NextResponse.json(agents)
}

export async function POST(req: NextRequest) {
  const db = getDb()
  const { name, description, system_prompt, model } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  const maxOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM agents').get() as { m: number }).m
  const result = db.prepare(
    'INSERT INTO agents (name, description, system_prompt, model, sort_order) VALUES (?, ?, ?, ?, ?)'
  ).run(name.trim(), description?.trim() || null, system_prompt?.trim() || '', model || 'claude-sonnet-4-6', maxOrder + 1)
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(result.lastInsertRowid)
  return NextResponse.json(agent, { status: 201 })
}
