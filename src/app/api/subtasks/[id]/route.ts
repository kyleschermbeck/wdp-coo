import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb()
    const { id } = await params
    const subtask = db.prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM subtask_items WHERE subtask_id = s.id) as subitem_count,
        (SELECT COUNT(*) FROM subtask_items WHERE subtask_id = s.id AND completed = 1) as completed_subitem_count
      FROM subtasks s WHERE s.id = ?
    `).get(id)
    if (!subtask) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const tags = db.prepare(`
      SELECT t.* FROM tags t JOIN subtask_tags st ON st.tag_id = t.id WHERE st.subtask_id = ?
    `).all(id)
    return NextResponse.json({ ...(subtask as object), tags })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb()
    const { id } = await params
    const body = await req.json()
    const { title, notes, start_date, due_date, completed, status, task_id } = body
    const resolvedStatus = status ?? (completed ? 'done' : 'todo')
    const resolvedCompleted = resolvedStatus === 'done' ? 1 : 0
    if (task_id !== undefined) {
      db.prepare(
        'UPDATE subtasks SET title = ?, notes = ?, start_date = ?, due_date = ?, completed = ?, status = ?, task_id = ? WHERE id = ?'
      ).run(title?.trim(), notes ?? null, start_date || null, due_date || null, resolvedCompleted, resolvedStatus, task_id, id)
    } else {
      db.prepare(
        'UPDATE subtasks SET title = ?, notes = ?, start_date = ?, due_date = ?, completed = ?, status = ? WHERE id = ?'
      ).run(title?.trim(), notes ?? null, start_date || null, due_date || null, resolvedCompleted, resolvedStatus, id)
    }
    const subtask = db.prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM subtask_items WHERE subtask_id = s.id) as subitem_count,
        (SELECT COUNT(*) FROM subtask_items WHERE subtask_id = s.id AND completed = 1) as completed_subitem_count
      FROM subtasks s WHERE s.id = ?
    `).get(id) as { task_id: number } & Record<string, unknown>
    const tags = db.prepare(`
      SELECT t.* FROM tags t JOIN subtask_tags st ON st.tag_id = t.id WHERE st.subtask_id = ?
    `).all(id)

    // Auto-complete parent task if all its subtasks are now done
    if (subtask?.task_id) {
      const counts = db.prepare(`
        SELECT COUNT(*) as total, SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as done
        FROM subtasks WHERE task_id = ?
      `).get(subtask.task_id) as { total: number; done: number }
      if (counts.total > 0 && counts.total === counts.done) {
        db.prepare(`UPDATE tasks SET status = 'done' WHERE id = ? AND status != 'done'`).run(subtask.task_id)
      }
    }

    return NextResponse.json({ ...subtask, tags })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = getDb()
    const { id } = await params
    db.prepare('DELETE FROM subtasks WHERE id = ?').run(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
