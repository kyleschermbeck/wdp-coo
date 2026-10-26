import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// GET /api/subtasks/dependencies?subtask_id=123
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const subtask_id = searchParams.get('subtask_id')
  if (!subtask_id) return NextResponse.json({ error: 'subtask_id required' }, { status: 400 })
  const db = await getDb()
  const rows = (await db.execute({sql: `
    SELECT
      sd.id,
      sd.depends_on_task_id,
      sd.depends_on_subtask_id,
      COALESCE(t.title, s.title) AS title,
      COALESCE(t.status, s.status) AS status,
      CASE WHEN sd.depends_on_task_id IS NOT NULL THEN 'task' ELSE 'subtask' END AS kind
    FROM subtask_dependencies sd
    LEFT JOIN tasks t ON t.id = sd.depends_on_task_id
    LEFT JOIN subtasks s ON s.id = sd.depends_on_subtask_id
    WHERE sd.subtask_id = ?
  `, args: [Number(subtask_id)]})).rows
  return NextResponse.json(rows)
}

// POST /api/subtasks/dependencies  { subtask_id, depends_on_task_id?, depends_on_subtask_id? }
export async function POST(req: Request) {
  const { subtask_id, depends_on_task_id, depends_on_subtask_id } = await req.json() as {
    subtask_id: number
    depends_on_task_id?: number | null
    depends_on_subtask_id?: number | null
  }
  if (!subtask_id || (!depends_on_task_id && !depends_on_subtask_id)) {
    return NextResponse.json({ error: 'subtask_id and one of depends_on_task_id or depends_on_subtask_id required' }, { status: 400 })
  }
  if (depends_on_subtask_id && depends_on_subtask_id === subtask_id) {
    return NextResponse.json({ error: 'A subtask cannot depend on itself' }, { status: 400 })
  }
  const db = await getDb()
  await db.execute({sql: `
    INSERT OR IGNORE INTO subtask_dependencies (subtask_id, depends_on_task_id, depends_on_subtask_id)
    VALUES (?, ?, ?)
  `, args: [subtask_id, depends_on_task_id ?? null, depends_on_subtask_id ?? null]})
  const row = (await db.execute({sql: `
    SELECT
      sd.id,
      sd.depends_on_task_id,
      sd.depends_on_subtask_id,
      COALESCE(t.title, s.title) AS title,
      COALESCE(t.status, s.status) AS status,
      CASE WHEN sd.depends_on_task_id IS NOT NULL THEN 'task' ELSE 'subtask' END AS kind
    FROM subtask_dependencies sd
    LEFT JOIN tasks t ON t.id = sd.depends_on_task_id
    LEFT JOIN subtasks s ON s.id = sd.depends_on_subtask_id
    WHERE sd.subtask_id = ? AND sd.depends_on_task_id IS ? AND sd.depends_on_subtask_id IS ?
  `, args: [subtask_id, depends_on_task_id ?? null, depends_on_subtask_id ?? null]})).rows[0]
  return NextResponse.json(row)
}

// DELETE /api/subtasks/dependencies?subtask_id=1&dep_id=2
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const subtask_id = searchParams.get('subtask_id')
  const dep_id = searchParams.get('dep_id')
  if (!subtask_id || !dep_id) return NextResponse.json({ error: 'subtask_id and dep_id required' }, { status: 400 })
  const db = await getDb()
  await db.execute({sql: 'DELETE FROM subtask_dependencies WHERE subtask_id = ? AND id = ?', args: [Number(subtask_id), Number(dep_id)]})
  return NextResponse.json({ ok: true })
}
