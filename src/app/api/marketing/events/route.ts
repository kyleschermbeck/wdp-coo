import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(request: Request) {
  const db = await getDb()
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month') // YYYY-MM

  let events
  if (month) {
    events = (await db.execute({sql: "SELECT * FROM marketing_events WHERE strftime('%Y-%m', date) = ? ORDER BY date ASC", args: [month]})).rows
  } else {
    events = (await db.execute({sql: 'SELECT * FROM marketing_events ORDER BY date ASC', args: []})).rows
  }

  return NextResponse.json(events)
}

export async function POST(request: Request) {
  const db = await getDb()
  const { title, date, platform, type, status, notes } = await request.json()
  const result = await db.execute({sql: `
    INSERT INTO marketing_events (title, date, platform, type, status, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `, args: [title,
    date,
    platform ?? 'instagram',
    type ?? 'post',
    status ?? 'planned',
    notes ?? null]})
  const event = (await db.execute({sql: 'SELECT * FROM marketing_events WHERE id = ?', args: [Number(result.lastInsertRowid)]})).rows[0]
  return NextResponse.json(event)
}
