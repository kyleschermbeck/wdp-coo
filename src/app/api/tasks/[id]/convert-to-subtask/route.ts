import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb()
    const { id } = await params
    const { parent_task_id } = await req.json()
    if (!parent_task_id) return NextResponse.json({ error: 'parent_task_id required' }, { status: 400 })

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as {
      id: number; title: string; notes: string | null; due_date: string | null; status: string
    } | undefined
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    const maxOrder = (db.prepare(
      'SELECT COALESCE(MAX(sort_order), -1) as m FROM subtasks WHERE task_id = ?'
    ).get(parent_task_id) as { m: number }).m

    const result = db.prepare(`
      INSERT INTO subtasks (task_id, title, notes, due_date, status, completed, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      parent_task_id,
      task.title,
      task.notes ?? null,
      task.due_date ?? null,
      task.status,
      task.status === 'done' ? 1 : 0,
      maxOrder + 1
    )

    db.prepare('DELETE FROM tasks WHERE id = ?').run(id)

    const subtask = db.prepare(`
      SELECT s.*,
        t.title as task_title,
        t.project_id,
        p.name as project_name,
        p.color as project_color
      FROM subtasks s
      JOIN tasks t ON t.id = s.task_id
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE s.id = ?
    `).get(result.lastInsertRowid)

    return NextResponse.json({ ...(subtask as object), tags: [] }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
