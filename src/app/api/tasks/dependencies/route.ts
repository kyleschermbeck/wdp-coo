import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// GET /api/tasks/dependencies?task_id=123
export async function GET(req: NextRequest) {
  const db = await getDb()
  const taskId = new URL(req.url).searchParams.get('task_id')
  if (!taskId) return NextResponse.json({ error: 'task_id required' }, { status: 400 })

  const deps = (await db.execute({sql: `
    SELECT td.id, td.depends_on_id,
           t.title, t.status, t.priority, t.due_date,
           p.name as project_name
    FROM task_dependencies td
    JOIN tasks t ON t.id = td.depends_on_id
    LEFT JOIN projects p ON p.id = t.project_id
    WHERE td.task_id = ?
    ORDER BY td.id ASC
  `, args: [taskId]})).rows

  return NextResponse.json(deps)
}

// POST /api/tasks/dependencies  { task_id, depends_on_id }
export async function POST(req: NextRequest) {
  const db = await getDb()
  const { task_id, depends_on_id } = await req.json() as { task_id: number; depends_on_id: number }
  if (!task_id || !depends_on_id) return NextResponse.json({ error: 'task_id and depends_on_id required' }, { status: 400 })
  if (task_id === depends_on_id) return NextResponse.json({ error: 'A task cannot depend on itself' }, { status: 400 })

  try {
    await db.execute({sql: 'INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_id) VALUES (?, ?)', args: [task_id, depends_on_id]})
  } catch {
    return NextResponse.json({ error: 'Circular dependency or duplicate' }, { status: 400 })
  }

  const dep = (await db.execute({sql: `
    SELECT td.id, td.depends_on_id,
           t.title, t.status, t.priority, t.due_date,
           p.name as project_name
    FROM task_dependencies td
    JOIN tasks t ON t.id = td.depends_on_id
    LEFT JOIN projects p ON p.id = t.project_id
    WHERE td.task_id = ? AND td.depends_on_id = ?
  `, args: [task_id, depends_on_id]})).rows[0]

  return NextResponse.json(dep)
}

// DELETE /api/tasks/dependencies?task_id=123&depends_on_id=456
export async function DELETE(req: NextRequest) {
  const db = await getDb()
  const { searchParams } = new URL(req.url)
  const task_id = searchParams.get('task_id')
  const depends_on_id = searchParams.get('depends_on_id')
  if (!task_id || !depends_on_id) return NextResponse.json({ error: 'task_id and depends_on_id required' }, { status: 400 })

  await db.execute({sql: 'DELETE FROM task_dependencies WHERE task_id = ? AND depends_on_id = ?', args: [task_id, depends_on_id]})
  return NextResponse.json({ ok: true })
}
