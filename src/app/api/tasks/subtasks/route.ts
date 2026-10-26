import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// POST /api/tasks/subtasks — create a subtask on an existing task
export async function POST(req: NextRequest) {
  const db = await getDb()
  const body = await req.json() as { task_id: number; title: string; due_date?: string; notes?: string }
  const { task_id, title, due_date, notes } = body

  if (!task_id || !title?.trim()) {
    return NextResponse.json({ error: 'task_id and title are required' }, { status: 400 })
  }

  try {
    const result = await db.execute({sql: 'INSERT INTO subtasks (task_id, title, due_date, notes, status) VALUES (?, ?, ?, ?, ?)', args: [task_id, title.trim(), due_date ?? null, notes ?? null, 'todo']})
    const subtask = (await db.execute({sql: 'SELECT * FROM subtasks WHERE id = ?', args: [Number(result.lastInsertRowid)]})).rows[0]
    return NextResponse.json(subtask, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
