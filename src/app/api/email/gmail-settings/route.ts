import { NextRequest, NextResponse } from 'next/server'
import { getGmailSettings, updateSenderDisplayName } from '@/lib/gmail'

export async function GET() {
  try {
    const settings = await getGmailSettings()
    if (!settings) return NextResponse.json({ error: 'Not authenticated or missing scope' }, { status: 401 })
    // Return both HTML (for sending) and text (for display)
    return NextResponse.json(settings)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { displayName } = await req.json()
    if (!displayName?.trim()) return NextResponse.json({ error: 'displayName required' }, { status: 400 })
    await updateSenderDisplayName(displayName.trim())
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
