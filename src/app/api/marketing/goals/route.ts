import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = await getDb()
  const goals = (await db.execute({sql: 'SELECT * FROM marketing_goals ORDER BY created_at DESC', args: []})).rows
  return NextResponse.json(goals)
}

export async function POST(request: Request) {
  const db = await getDb()
  const { title, description, category, target_value, current_value, unit, due_date } = await request.json()
  const result = await db.execute({sql: `
    INSERT INTO marketing_goals (title, description, category, target_value, current_value, unit, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, args: [title,
    description ?? null,
    category ?? 'growth',
    target_value ?? null,
    current_value ?? 0,
    unit ?? '',
    due_date ?? null]})
  const goal = (await db.execute({sql: 'SELECT * FROM marketing_goals WHERE id = ?', args: [Number(result.lastInsertRowid)]})).rows[0]
  return NextResponse.json(goal)
}
