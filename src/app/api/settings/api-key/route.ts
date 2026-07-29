import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const ENV_PATH = join(process.cwd(), '.env.local')

function readEnv(): string {
  try { return readFileSync(ENV_PATH, 'utf-8') } catch { return '' }
}

export async function GET() {
  const content = readEnv()
  const has_key = /^ANTHROPIC_API_KEY=.+$/m.test(content)
  return NextResponse.json({ has_key })
}

export async function POST(req: NextRequest) {
  const { key } = await req.json() as { key?: string }
  if (!key?.trim() || !key.startsWith('sk-ant-')) {
    return NextResponse.json({ error: 'Invalid API key format' }, { status: 400 })
  }

  let content = readEnv()
  if (/^ANTHROPIC_API_KEY=.*/m.test(content)) {
    content = content.replace(/^ANTHROPIC_API_KEY=.*/m, `ANTHROPIC_API_KEY=${key.trim()}`)
  } else {
    content = content.trimEnd() + (content ? '\n' : '') + `ANTHROPIC_API_KEY=${key.trim()}\n`
  }

  writeFileSync(ENV_PATH, content, 'utf-8')
  return NextResponse.json({ ok: true })
}
