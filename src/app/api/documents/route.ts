import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

const DOCS_DIR = join(process.cwd(), 'data', 'docs')

async function extractText(buffer: Buffer, fileType: string, originalName: string): Promise<string> {
  if (fileType === 'application/pdf' || originalName.endsWith('.pdf')) {
    // Use lib directly — pdf-parse/index.js runs debug code on newer Node (module.parent=undefined)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse/lib/pdf-parse.js')
    const result = await pdfParse(buffer)
    return result.text
  }

  if (
    fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    originalName.endsWith('.docx')
  ) {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  // Plain text, markdown, CSV
  return buffer.toString('utf-8')
}

export async function GET(req: NextRequest) {
  const db = await getDb()
  const taskId = req.nextUrl.searchParams.get('task_id')
  const subtaskId = req.nextUrl.searchParams.get('subtask_id')

  let docs
  if (subtaskId) {
    docs = (await db.execute({sql: `
      SELECT d.*, s.title as subtask_title, t.title as task_title
      FROM documents d
      LEFT JOIN subtasks s ON s.id = d.subtask_id
      LEFT JOIN tasks t ON t.id = d.task_id
      WHERE d.subtask_id = ?
      ORDER BY d.created_at DESC
    `, args: [subtaskId]})).rows
  } else if (taskId) {
    docs = (await db.execute({sql: `
      SELECT d.*, t.title as task_title
      FROM documents d LEFT JOIN tasks t ON t.id = d.task_id
      WHERE d.task_id = ?
      ORDER BY d.created_at DESC
    `, args: [taskId]})).rows
  } else {
    docs = (await db.execute({sql: `
      SELECT d.*, t.title as task_title, s.title as subtask_title
      FROM documents d
      LEFT JOIN tasks t ON t.id = d.task_id
      LEFT JOIN subtasks s ON s.id = d.subtask_id
      ORDER BY d.created_at DESC
    `, args: []})).rows
  }

  return NextResponse.json(docs)
}

export async function POST(req: NextRequest) {
  const db = await getDb()

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const taskId = formData.get('task_id') as string | null
    const subtaskId = formData.get('subtask_id') as string | null

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const maxBytes = 20 * 1024 * 1024 // 20 MB
    if (file.size > maxBytes) return NextResponse.json({ error: 'File too large (max 20 MB)' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
    const filename = `${randomUUID()}.${ext}`
    const filepath = join(DOCS_DIR, filename)

    mkdirSync(DOCS_DIR, { recursive: true })
    writeFileSync(filepath, buffer)

    let contentText = ''
    try {
      contentText = await extractText(buffer, file.type, file.name)
    } catch {
      contentText = ''
    }

    const result = await db.execute({sql: `
      INSERT INTO documents (filename, original_name, file_type, file_size, content_text, task_id, subtask_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, args: [filename, file.name, file.type || ext, file.size, contentText, taskId ? Number(taskId) : null, subtaskId ? Number(subtaskId) : null]})

    if (contentText) {
      await db.execute({sql: `INSERT INTO documents_fts(rowid, content_text) VALUES (?, ?)`, args: [Number(result.lastInsertRowid), contentText]})
    }

    const doc = (await db.execute({sql: `
      SELECT d.*, t.title as task_title, s.title as subtask_title
      FROM documents d
      LEFT JOIN tasks t ON t.id = d.task_id
      LEFT JOIN subtasks s ON s.id = d.subtask_id
      WHERE d.id = ?
    `, args: [Number(result.lastInsertRowid)]})).rows[0]

    return NextResponse.json(doc, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
