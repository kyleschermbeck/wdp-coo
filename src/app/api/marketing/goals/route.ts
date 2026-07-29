import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = getDb()
  const goals = db.prepare('SELECT * FROM marketing_goals ORDER BY created_at DESC').all()
  return NextResponse.json(goals)
}

export async function POST(request: Request) {
  const db = getDb()
  const { title, description, category, target_value, current_value, unit, due_date } = await request.json()
  const result = db.prepare(`
    INSERT INTO marketing_goals (title, description, category, target_value, current_value, unit, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    title,
    description ?? null,
    category ?? 'growth',
    target_value ?? null,
    current_value ?? 0,
    unit ?? '',
    due_date ?? null
  )
  const goal = db.prepare('SELECT * FROM marketing_goals WHERE id = ?').get(result.lastInsertRowid)
  return NextResponse.json(goal)
}
