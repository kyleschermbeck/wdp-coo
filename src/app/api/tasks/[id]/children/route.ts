import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// GET /api/tasks/[id]/children → all tasks with parent_task_id = id
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb()
  const { id } = await params
  const children = db.prepare(`
    SELECT t.*, p.name as project_name, p.color as project_color,
      (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id) as subtask_count,
      (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.status = 'done') as completed_subtask_count
    FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
    WHERE t.parent_task_id = ?
    ORDER BY t.created_at ASC
  `).all(id)
  return NextResponse.json(children)
}

// POST /api/tasks/[id]/children → create a new child task
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = getDb()
  const { id } = await params
  const { title, status = 'todo', priority = 'medium' } = await req.json() as { title: string; status?: string; priority?: string }
  if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })

  const parent = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(id) as { project_id: number | null } | undefined
  if (!parent) return NextResponse.json({ error: 'Parent task not found' }, { status: 404 })

  const result = db.prepare(`
    INSERT INTO tasks (project_id, parent_task_id, title, status, priority)
    VALUES (?, ?, ?, ?, ?)
  `).run(parent.project_id, id, title.trim(), status, priority)

  const child = db.prepare(`
    SELECT t.*, p.name as project_name, p.color as project_color,
      0 as subtask_count, 0 as completed_subtask_count
    FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
    WHERE t.id = ?
  `).get(result.lastInsertRowid)

  return NextResponse.json(child, { status: 201 })
}
