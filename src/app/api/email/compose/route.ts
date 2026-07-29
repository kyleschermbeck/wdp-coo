import { NextRequest, NextResponse } from 'next/server'
import { sendNewEmail } from '@/lib/gmail'

export async function POST(req: NextRequest) {
  try {
    const { to, subject, body, signatureHtml, fromName, fromEmail } = await req.json()
    if (!to?.trim() || !subject?.trim() || !body?.trim()) {
      return NextResponse.json({ error: 'to, subject, and body are required' }, { status: 400 })
    }
    await sendNewEmail(to.trim(), subject.trim(), body.trim(), signatureHtml ?? undefined, fromName ?? undefined, fromEmail ?? undefined)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
