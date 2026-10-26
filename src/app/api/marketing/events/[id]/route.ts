import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = await getDb()
  const body = await request.json()
  // Only update fields provided in the body
  if (body.date !== undefined) {
    await db.execute({sql: 'UPDATE marketing_events SET date = ? WHERE id = ?', args: [body.date, id]})
  }
  const event = (await db.execute({sql: 'SELECT * FROM marketing_events WHERE id = ?', args: [id]})).rows[0]
  return NextResponse.json(event)
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = await getDb()
  const { title, date, platform, type, status, notes, pillar } = await request.json()
  await db.execute({sql: `
    UPDATE marketing_events
    SET title = ?, date = ?, platform = ?, type = ?, status = ?, notes = ?, pillar = ?
    WHERE id = ?
  `, args: [title,
    date,
    platform ?? 'instagram',
    type ?? 'post',
    status ?? 'planned',
    notes ?? null,
    pillar ?? null,
    id]})
  const event = (await db.execute({sql: 'SELECT * FROM marketing_events WHERE id = ?', args: [id]})).rows[0]
  return NextResponse.json(event)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = await getDb()
  await db.execute({sql: 'DELETE FROM marketing_events WHERE id = ?', args: [id]})
  return NextResponse.json({ ok: true })
}
