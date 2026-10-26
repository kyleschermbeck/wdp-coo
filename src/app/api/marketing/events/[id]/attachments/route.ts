import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'event-attachments')

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = await getDb()
  const attachments = (await db.execute({sql: 'SELECT * FROM event_attachments WHERE event_id = ? ORDER BY created_at ASC', args: [id]})).rows
  return NextResponse.json(attachments)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = await getDb()

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const ext = path.extname(file.name)
  const filename = `${randomUUID()}${ext}`
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  await mkdir(UPLOAD_DIR, { recursive: true })
  await writeFile(path.join(UPLOAD_DIR, filename), buffer)

  const result = await db.execute({sql: `
    INSERT INTO event_attachments (event_id, filename, original_name, mime_type, size)
    VALUES (?, ?, ?, ?, ?)
  `, args: [id, filename, file.name, file.type, file.size]})

  const attachment = (await db.execute({sql: 'SELECT * FROM event_attachments WHERE id = ?', args: [Number(result.lastInsertRowid)]})).rows[0]
  return NextResponse.json(attachment)
}
