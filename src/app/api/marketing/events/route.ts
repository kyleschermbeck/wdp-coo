import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(request: Request) {
  const db = getDb()
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month') // YYYY-MM

  let events
  if (month) {
    events = db.prepare(
      "SELECT * FROM marketing_events WHERE strftime('%Y-%m', date) = ? ORDER BY date ASC"
    ).all(month)
  } else {
    events = db.prepare('SELECT * FROM marketing_events ORDER BY date ASC').all()
  }

  return NextResponse.json(events)
}

export async function POST(request: Request) {
  const db = getDb()
  const { title, date, platform, type, status, notes } = await request.json()
  const result = db.prepare(`
    INSERT INTO marketing_events (title, date, platform, type, status, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    title,
    date,
    platform ?? 'instagram',
    type ?? 'post',
    status ?? 'planned',
    notes ?? null
  )
  const event = db.prepare('SELECT * FROM marketing_events WHERE id = ?').get(result.lastInsertRowid)
  return NextResponse.json(event)
}
