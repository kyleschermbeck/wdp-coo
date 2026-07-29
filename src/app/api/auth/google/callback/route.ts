import { NextRequest, NextResponse } from 'next/server'
import { createOAuth2Client, saveTokens } from '@/lib/gmail'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.redirect(new URL('/email?error=no_code', req.url))

  try {
    const client = createOAuth2Client()
    const { tokens } = await client.getToken(code)
    saveTokens(tokens)
    return NextResponse.redirect(new URL('/email?connected=1', req.url))
  } catch (err) {
    console.error('OAuth callback error:', err)
    return NextResponse.redirect(new URL('/email?error=auth_failed', req.url))
  }
}
