import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb()
    const { id } = await params
    const subtask = (await db.execute({sql: `
      SELECT s.*,
        (SELECT COUNT(*) FROM subtask_items WHERE subtask_id = s.id) as subitem_count,
        (SELECT COUNT(*) FROM subtask_items WHERE subtask_id = s.id AND completed = 1) as completed_subitem_count
      FROM subtasks s WHERE s.id = ?
    `, args: [id]})).rows[0]
    if (!subtask) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const tags = (await db.execute({sql: `
      SELECT t.* FROM tags t JOIN subtask_tags st ON st.tag_id = t.id WHERE st.subtask_id = ?
    `, args: [id]})).rows
    return NextResponse.json({ ...(subtask as object), tags })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb()
    const { id } = await params
    const body = await req.json()
    const { title, notes, start_date, due_date, completed, status, task_id } = body
    const resolvedStatus = status ?? (completed ? 'done' : 'todo')
    const resolvedCompleted = resolvedStatus === 'done' ? 1 : 0
    if (task_id !== undefined) {
      await db.execute({sql: 'UPDATE subtasks SET title = ?, notes = ?, start_date = ?, due_date = ?, completed = ?, status = ?, task_id = ? WHERE id = ?', args: [title?.trim(), notes ?? null, start_date || null, due_date || null, resolvedCompleted, resolvedStatus, task_id, id]})
    } else {
      await db.execute({sql: 'UPDATE subtasks SET title = ?, notes = ?, start_date = ?, due_date = ?, completed = ?, status = ? WHERE id = ?', args: [title?.trim(), notes ?? null, start_date || null, due_date || null, resolvedCompleted, resolvedStatus, id]})
    }
    const subtask = (await db.execute({sql: `
      SELECT s.*,
        (SELECT COUNT(*) FROM subtask_items WHERE subtask_id = s.id) as subitem_count,
        (SELECT COUNT(*) FROM subtask_items WHERE subtask_id = s.id AND completed = 1) as completed_subitem_count
      FROM subtasks s WHERE s.id = ?
    `, args: [id]})).rows[0] as unknown as { task_id: number } & Record<string, unknown>
    const tags = (await db.execute({sql: `
      SELECT t.* FROM tags t JOIN subtask_tags st ON st.tag_id = t.id WHERE st.subtask_id = ?
    `, args: [id]})).rows

    // Auto-complete parent task if all its subtasks are now done
    if (subtask?.task_id) {
      const counts = (await db.execute({sql: `
        SELECT COUNT(*) as total, SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as done
        FROM subtasks WHERE task_id = ?
      `, args: [subtask.task_id]})).rows[0] as unknown as { total: number; done: number }
      if (counts.total > 0 && counts.total === counts.done) {
        await db.execute({sql: `UPDATE tasks SET status = 'done' WHERE id = ? AND status != 'done'`, args: [subtask.task_id]})
      }
    }

    return NextResponse.json({ ...subtask, tags })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb()
    const { id } = await params
    const patch = await req.json() as Record<string, unknown>

    const allowed = ['title', 'notes', 'start_date', 'due_date', 'completed', 'status', 'sort_order']
    const fields = Object.keys(patch).filter(k => allowed.includes(k))
    if (fields.length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

    // Keep completed and status in sync
    if ('status' in patch && !('completed' in patch)) {
      fields.push('completed')
      patch['completed'] = patch['status'] === 'done' ? 1 : 0
    } else if ('completed' in patch && !('status' in patch)) {
      fields.push('status')
      patch['status'] = patch['completed'] ? 'done' : 'todo'
    }

    const setClauses = [...new Set(fields)].map(f => `${f} = ?`).join(', ')
    const uniqueFields = [...new Set(fields)]
    const values = uniqueFields.map(f => patch[f] ?? null)
    await db.execute({sql: `UPDATE subtasks SET ${setClauses} WHERE id = ?`, args: [...values, id] as (string | number | boolean | null | bigint)[]})

    const subtask = (await db.execute({sql: `
      SELECT s.*,
        (SELECT COUNT(*) FROM subtask_items WHERE subtask_id = s.id) as subitem_count,
        (SELECT COUNT(*) FROM subtask_items WHERE subtask_id = s.id AND completed = 1) as completed_subitem_count
      FROM subtasks s WHERE s.id = ?
    `, args: [id]})).rows[0] as unknown as { task_id: number } & Record<string, unknown>

    // Auto-complete parent task if all subtasks are now done
    if (subtask?.task_id) {
      const counts = (await db.execute({sql: `
        SELECT COUNT(*) as total, SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as done
        FROM subtasks WHERE task_id = ?
      `, args: [subtask.task_id]})).rows[0] as unknown as { total: number; done: number }
      if (counts.total > 0 && counts.total === counts.done) {
        await db.execute({sql: `UPDATE tasks SET status = 'done' WHERE id = ? AND status != 'done'`, args: [subtask.task_id]})
      }
    }

    return NextResponse.json(subtask)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb()
    const { id } = await params
    await db.execute({sql: 'DELETE FROM subtasks WHERE id = ?', args: [id]})
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
