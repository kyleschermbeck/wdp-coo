import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = getDb()
  const body = await request.json()
  // Only update fields provided in the body
  if (body.date !== undefined) {
    db.prepare('UPDATE marketing_events SET date = ? WHERE id = ?').run(body.date, id)
  }
  const event = db.prepare('SELECT * FROM marketing_events WHERE id = ?').get(id)
  return NextResponse.json(event)
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = getDb()
  const { title, date, platform, type, status, notes, pillar } = await request.json()
  db.prepare(`
    UPDATE marketing_events
    SET title = ?, date = ?, platform = ?, type = ?, status = ?, notes = ?, pillar = ?
    WHERE id = ?
  `).run(
    title,
    date,
    platform ?? 'instagram',
    type ?? 'post',
    status ?? 'planned',
    notes ?? null,
    pillar ?? null,
    id
  )
  const event = db.prepare('SELECT * FROM marketing_events WHERE id = ?').get(id)
  return NextResponse.json(event)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = getDb()
  db.prepare('DELETE FROM marketing_events WHERE id = ?').run(id)
  return NextResponse.json({ ok: true })
}
