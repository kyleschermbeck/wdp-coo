import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  const db = getDb()
  const like = `%${q}%`

  const tasks = db.prepare(`
    SELECT t.id, t.title, t.status, t.priority, t.project_id,
           p.name as project_name, p.color as project_color
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id
    WHERE t.title LIKE ? OR t.notes LIKE ? OR t.description LIKE ?
    ORDER BY (t.status = 'done') ASC, t.created_at DESC
    LIMIT 8
  `).all(like, like, like) as {
    id: number; title: string; status: string; priority: string
    project_id: number | null; project_name: string | null; project_color: string | null
  }[]

  const subtasks = db.prepare(`
    SELECT s.id, s.title, s.status, s.task_id, t.title as task_title,
           p.name as project_name
    FROM subtasks s
    JOIN tasks t ON t.id = s.task_id
    LEFT JOIN projects p ON p.id = t.project_id
    WHERE s.title LIKE ? OR s.notes LIKE ?
    ORDER BY s.completed ASC, s.created_at DESC
    LIMIT 4
  `).all(like, like) as {
    id: number; title: string; status: string; task_id: number
    task_title: string; project_name: string | null
  }[]

  const contacts = db.prepare(`
    SELECT id, shopify_id,
           TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) as name,
           email, orders_count, total_spent
    FROM shopify_customers
    WHERE first_name LIKE ? OR last_name LIKE ? OR email LIKE ?
       OR (first_name || ' ' || last_name) LIKE ?
    LIMIT 4
  `).all(like, like, like, like) as {
    id: number; shopify_id: string; name: string; email: string
    orders_count: number; total_spent: number
  }[]

  const campaigns = db.prepare(`
    SELECT id, name, status, send_time, klaviyo_id
    FROM klaviyo_campaigns
    WHERE name LIKE ?
    LIMIT 4
  `).all(like) as {
    id: number; name: string; status: string; send_time: string | null; klaviyo_id: string | null
  }[]

  return NextResponse.json({ tasks, subtasks, contacts, campaigns })
}
