import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// POST /api/tasks/[id]/promote
// Converts a task into a standalone project.
// • The task's title → project name
// • The task's description / notes → project description
// • The task's due_date → project due_date
// • Each subtask → a new task inside the new project (title, notes, status, due_date preserved)
// • The original task (and its subtasks) is then deleted via CASCADE.

function mapStatus(taskStatus: string): string {
  if (taskStatus === 'done') return 'complete'
  if (taskStatus === 'in_progress' || taskStatus === 'review') return 'active'
  return 'planning'
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const db = await getDb()
    const { id } = await params
    const taskId = parseInt(id, 10)
    if (isNaN(taskId)) return NextResponse.json({ error: 'Invalid task id' }, { status: 400 })

    const task = (await db.execute({sql: 'SELECT * FROM tasks WHERE id = ?', args: [taskId]})).rows[0] as unknown as {
      id: number; title: string; description: string | null; notes: string | null
      status: string; priority: string; due_date: string | null; project_id: number | null
    } | undefined

    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    const subtasks = (await db.execute({sql: 'SELECT * FROM subtasks WHERE task_id = ? ORDER BY sort_order ASC, id ASC', args: [taskId]})).rows as unknown as {
      id: number; title: string; notes: string | null; due_date: string | null; status: string
    }[]

    // Build project description — combine task description and notes if both present
    const descParts = [task.description, task.notes].filter(Boolean)
    const projectDescription = descParts.length > 0 ? descParts.join('\n\n') : null

    // 1. Create the project
    const projectResult = await db.execute({sql: `
      INSERT INTO projects (name, description, status, color, due_date)
      VALUES (?, ?, ?, 'sage', ?)
    `, args: [task.title, projectDescription, mapStatus(task.status), task.due_date ?? null]})

    const newProjectId = Number(projectResult.lastInsertRowid) as number

    // 2. Convert subtasks → tasks in the new project
    for (const s of subtasks) {
      await db.execute({sql: `
        INSERT INTO tasks (project_id, title, notes, status, priority, due_date)
        VALUES (?, ?, ?, ?, ?, ?)
      `, args: [newProjectId, s.title, s.notes ?? null, s.status, task.priority, s.due_date ?? null]})
    }

    // 3. Delete the original task (subtasks cascade)
    await db.execute({sql: 'DELETE FROM tasks WHERE id = ?', args: [taskId]})
    const project = (await db.execute({sql: 'SELECT * FROM projects WHERE id = ?', args: [newProjectId]})).rows[0]
    return NextResponse.json({ ok: true, project_id: newProjectId, project })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
