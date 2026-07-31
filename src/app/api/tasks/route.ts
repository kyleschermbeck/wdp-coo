import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

function attachTags(db: ReturnType<typeof import('@/lib/db').getDb>, tasks: Record<string, unknown>[]) {
  if (tasks.length === 0) return tasks
  const ids = tasks.map(t => t.id as number)
  const placeholders = ids.map(() => '?').join(',')
  const rows = db.prepare(`
    SELECT tt.task_id, t.id, t.name, t.color
    FROM tags t JOIN task_tags tt ON tt.tag_id = t.id
    WHERE tt.task_id IN (${placeholders})
  `).all(...ids) as { task_id: number; id: number; name: string; color: string }[]

  const byTask: Record<number, unknown[]> = {}
  for (const r of rows) {
    if (!byTask[r.task_id]) byTask[r.task_id] = []
    byTask[r.task_id].push({ id: r.id, name: r.name, color: r.color })
  }
  return tasks.map(t => ({ ...t, tags: byTask[t.id as number] ?? [] }))
}

export async function GET(req: NextRequest) {
  try {
    const db = getDb()
    try { db.exec('ALTER TABLE tasks ADD COLUMN start_date TEXT') } catch {}
    const projectId = req.nextUrl.searchParams.get('project_id')

    let tasks = (projectId
      ? db.prepare(`
          SELECT t.*, p.name as project_name, p.color as project_color,
            (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id) as subtask_count,
            (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.status = 'done') as completed_subtask_count
          FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
          WHERE t.project_id = ? ORDER BY t.created_at DESC
        `).all(projectId)
      : db.prepare(`
          SELECT t.*, p.name as project_name, p.color as project_color,
            (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id) as subtask_count,
            (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.status = 'done') as completed_subtask_count
          FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
          ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC
        `).all()
    ) as Record<string, unknown>[]

    tasks = attachTags(db, tasks)
    return NextResponse.json(tasks)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb()
    const { project_id, title, description, notes, status, priority, due_date } = await req.json()
    if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

    const result = db.prepare(`
      INSERT INTO tasks (project_id, title, description, notes, status, priority, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(project_id || null, title.trim(), description?.trim() || null, notes?.trim() || null, status || 'todo', priority || 'medium', due_date || null)

    const taskId = result.lastInsertRowid

    const task = db.prepare(`
      SELECT t.*, p.name as project_name, p.color as project_color
      FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.id = ?
    `).get(taskId) as Record<string, unknown>

    return NextResponse.json({ ...task, tags: [], subtask_count: 0, completed_subtask_count: 0 }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
