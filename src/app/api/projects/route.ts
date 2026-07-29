import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const db = getDb()
    const projects = db.prepare(`
      SELECT
        p.*,
        (
          SELECT COUNT(*) FROM tasks t
          WHERE t.project_id = p.id
            AND NOT EXISTS (SELECT 1 FROM subtasks s WHERE s.task_id = t.id)
        ) + (
          SELECT COUNT(*) FROM subtasks s
          JOIN tasks t ON t.id = s.task_id
          WHERE t.project_id = p.id
        ) as task_count,
        (
          SELECT COUNT(*) FROM tasks t
          WHERE t.project_id = p.id
            AND t.status = 'done'
            AND NOT EXISTS (SELECT 1 FROM subtasks s WHERE s.task_id = t.id)
        ) + (
          SELECT COUNT(*) FROM subtasks s
          JOIN tasks t ON t.id = s.task_id
          WHERE t.project_id = p.id AND s.status = 'done'
        ) as completed_task_count
      FROM projects p
      ORDER BY p.created_at DESC
    `).all() as Record<string, unknown>[]

    // Attach tags to each project
    const tagRows = db.prepare(`
      SELECT pt.project_id, t.* FROM tags t
      JOIN project_tags pt ON pt.tag_id = t.id
    `).all() as ({ project_id: number } & Record<string, unknown>)[]

    const tagsByProject: Record<number, unknown[]> = {}
    for (const row of tagRows) {
      const pid = row.project_id
      if (!tagsByProject[pid]) tagsByProject[pid] = []
      const { project_id: _, ...tag } = row
      tagsByProject[pid].push(tag)
    }

    const result = projects.map(p => ({
      ...p,
      tags: tagsByProject[p.id as number] ?? [],
    }))

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb()
    const body = await req.json()
    const { name, description, status, color, due_date } = body
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    const result = db.prepare(`
      INSERT INTO projects (name, description, status, color, due_date)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      name.trim(),
      description?.trim() || null,
      status || 'planning',
      color || 'sage',
      due_date || null
    )

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid)
    return NextResponse.json({ ...(project as object), tags: [] }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
