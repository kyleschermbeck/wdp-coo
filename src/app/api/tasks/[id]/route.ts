import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb()
    const { id } = await params
    const task = (await db.execute({sql: `
      SELECT t.*, p.name as project_name, p.color as project_color
      FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.id = ?
    `, args: [id]})).rows[0]
    if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(task)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb()
    const { id } = await params
    const body = await req.json()
    const { title, description, notes, recipe_data, task_group, status, priority, start_date, due_date, parent_task_id, project_id } = body

    await db.execute({sql: `
      UPDATE tasks
      SET title = ?, description = ?, notes = ?, recipe_data = ?, task_group = ?, status = ?, priority = ?, start_date = ?, due_date = ?, parent_task_id = ?, project_id = ?
      WHERE id = ?
    `, args: [title?.trim(), description?.trim() || null, notes ?? null, recipe_data ?? null, task_group || null, status, priority, start_date || null, due_date || null, parent_task_id ?? null, project_id ?? null, id]})

    const task = (await db.execute({sql: 'SELECT * FROM tasks WHERE id = ?', args: [id]})).rows[0]
    return NextResponse.json(task)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb()
    const { id } = await params
    const patch = await req.json() as Record<string, unknown>

    const allowed = ['title', 'description', 'notes', 'recipe_data', 'task_group', 'status', 'priority', 'start_date', 'due_date', 'parent_task_id']
    const fields = Object.keys(patch).filter(k => allowed.includes(k))
    if (fields.length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 })

    const setClauses = fields.map(f => `${f} = ?`).join(', ')
    const values = fields.map(f => patch[f] ?? null)
    await db.execute({sql: `UPDATE tasks SET ${setClauses} WHERE id = ?`, args: [...(values as (string | number | boolean | null | bigint)[]), id]})

    const task = (await db.execute({sql: 'SELECT * FROM tasks WHERE id = ?', args: [id]})).rows[0]
    return NextResponse.json(task)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDb()
    const { id } = await params
    await db.execute({sql: 'DELETE FROM tasks WHERE id = ?', args: [id]})
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
