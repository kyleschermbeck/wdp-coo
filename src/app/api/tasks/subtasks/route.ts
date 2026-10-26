import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// POST /api/tasks/subtasks — create a subtask on an existing task
export async function POST(req: NextRequest) {
  const db = getDb()
  const body = await req.json() as { task_id: number; title: string; due_date?: string; notes?: string }
  const { task_id, title, due_date, notes } = body

  if (!task_id || !title?.trim()) {
    return NextResponse.json({ error: 'task_id and title are required' }, { status: 400 })
  }

  try {
    const result = db.prepare(
      'INSERT INTO subtasks (task_id, title, due_date, notes, status) VALUES (?, ?, ?, ?, ?)'
    ).run(task_id, title.trim(), due_date ?? null, notes ?? null, 'todo')
    const subtask = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(result.lastInsertRowid)
    return NextResponse.json(subtask, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
