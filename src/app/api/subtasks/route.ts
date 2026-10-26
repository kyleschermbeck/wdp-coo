import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import type { Client } from '@libsql/client'

async function withTags(db: Client, subtasks: Record<string, unknown>[]) {
  if (subtasks.length === 0) return subtasks
  const ids = subtasks.map(s => s.id as number)
  const placeholders = ids.map(() => '?').join(',')
  const tagRows = (await db.execute({sql: `
    SELECT st.subtask_id, t.id, t.name, t.color
    FROM tags t JOIN subtask_tags st ON st.tag_id = t.id
    WHERE st.subtask_id IN (${placeholders})
  `, args: ids as (string | number | boolean | null | bigint)[]})).rows as unknown as { subtask_id: number; id: number; name: string; color: string }[]
  const bySubtask: Record<number, unknown[]> = {}
  for (const r of tagRows) {
    if (!bySubtask[r.subtask_id]) bySubtask[r.subtask_id] = []
    bySubtask[r.subtask_id].push({ id: r.id, name: r.name, color: r.color })
  }
  return subtasks.map(s => ({ ...s, tags: bySubtask[s.id as number] ?? [] }))
}

export async function GET(req: NextRequest) {
  try {
    const db = await getDb()
    try { await db.execute({sql: 'ALTER TABLE subtasks ADD COLUMN start_date TEXT', args: []}) } catch {}
    const taskId = req.nextUrl.searchParams.get('task_id')
    const projectId = req.nextUrl.searchParams.get('project_id')

    if (taskId) {
      const subtasks = (await db.execute({sql: `
        SELECT s.*,
          (SELECT COUNT(*) FROM subtask_items WHERE subtask_id = s.id) as subitem_count,
          (SELECT COUNT(*) FROM subtask_items WHERE subtask_id = s.id AND completed = 1) as completed_subitem_count
        FROM subtasks s
        WHERE s.task_id = ?
        ORDER BY s.sort_order ASC, s.created_at ASC
      `, args: [taskId]})).rows as unknown as Record<string, unknown>[]
      return NextResponse.json(withTags(db, subtasks))
    }

    if (projectId) {
      const subtasks = (await db.execute({sql: `
        SELECT s.id, s.title, s.status, s.completed
        FROM subtasks s
        JOIN tasks t ON t.id = s.task_id
        WHERE t.project_id = ?
        ORDER BY s.created_at ASC
      `, args: [projectId]})).rows as unknown as Record<string, unknown>[]
      return NextResponse.json(subtasks)
    }

    // All subtasks with task + project context
    const subtasks = (await db.execute({sql: `
      SELECT s.*,
        (SELECT COUNT(*) FROM subtask_items WHERE subtask_id = s.id) as subitem_count,
        (SELECT COUNT(*) FROM subtask_items WHERE subtask_id = s.id AND completed = 1) as completed_subitem_count,
        t.title as task_title,
        t.project_id,
        p.name as project_name,
        p.color as project_color
      FROM subtasks s
      JOIN tasks t ON t.id = s.task_id
      LEFT JOIN projects p ON p.id = t.project_id
      ORDER BY s.due_date ASC NULLS LAST, s.created_at DESC
    `, args: []})).rows as unknown as Record<string, unknown>[]
    return NextResponse.json(withTags(db, subtasks))
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = await getDb()
    const { task_id, title, status } = await req.json()
    if (!title?.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })
    const resolvedStatus = status ?? 'todo'
    const maxOrder = ((await db.execute({sql: 'SELECT COALESCE(MAX(sort_order), -1) as m FROM subtasks WHERE task_id = ?', args: [task_id]})).rows[0] as unknown as { m: number }).m
    const result = await db.execute({sql: 'INSERT INTO subtasks (task_id, title, status, completed, sort_order) VALUES (?, ?, ?, ?, ?)', args: [task_id, title.trim(), resolvedStatus, resolvedStatus === 'done' ? 1 : 0, maxOrder + 1]})
    const subtask = (await db.execute({sql: 'SELECT * FROM subtasks WHERE id = ?', args: [Number(result.lastInsertRowid)]})).rows[0]
    return NextResponse.json({ ...(subtask as object), tags: [] }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
