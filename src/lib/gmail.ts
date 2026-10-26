import { google } from 'googleapis'
import { getDb } from './db'

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!
export const REDIRECT_URI = 'http://localhost:3000/api/auth/google/callback'

export const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.settings.basic',
]

export function createOAuth2Client() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI)
}

export function getAuthUrl() {
  const client = createOAuth2Client()
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })
}

export function saveTokens(tokens: { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null }) {
  const db = getDb()
  db.prepare(`
    INSERT INTO oauth_tokens (id, provider, access_token, refresh_token, expiry_date)
    VALUES (1, 'google', ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = COALESCE(excluded.refresh_token, refresh_token),
      expiry_date = excluded.expiry_date
  `).run(tokens.access_token ?? null, tokens.refresh_token ?? null, tokens.expiry_date ?? null)
}

export function loadTokens() {
  const db = getDb()
  return db.prepare('SELECT * FROM oauth_tokens WHERE provider = ?').get('google') as {
    access_token: string; refresh_token: string; expiry_date: number
  } | undefined
}

export async function getGmailClient() {
  const tokens = loadTokens()
  if (!tokens?.refresh_token) return null
  const client = createOAuth2Client()
  client.setCredentials(tokens)
  // Auto-refresh if needed
  client.on('tokens', saveTokens)
  return google.gmail({ version: 'v1', auth: client })
}

// Parse MIME body recursively
function extractBody(payload: any): { text: string; html: string } {
  if (!payload) return { text: '', html: '' }
  if (payload.parts) {
    let text = '', html = ''
    for (const part of payload.parts) {
      const sub = extractBody(part)
      text += sub.text
      html += sub.html
    }
    return { text, html }
  }
  const data = payload.body?.data
  if (!data) return { text: '', html: '' }
  const decoded = Buffer.from(data, 'base64url').toString('utf-8')
  if (payload.mimeType === 'text/plain') return { text: decoded, html: '' }
  if (payload.mimeType === 'text/html') return { text: '', html: decoded }
  return { text: '', html: '' }
}

function getHeader(headers: { name?: string | null; value?: string | null }[], name: string) {
  return headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
}

export async function fetchRecentEmails(maxResults = 100): Promise<{ emails: ReturnType<typeof mapMessage>[]; listCalls: number; getCalls: number }> {
  const gmail = await getGmailClient()
  if (!gmail) return { emails: [], listCalls: 0, getCalls: 0 }

  const allMessages: { id: string }[] = []
  let pageToken: string | undefined
  let listCalls = 0

  while (allMessages.length < maxResults) {
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      maxResults: Math.min(100, maxResults - allMessages.length),
      ...(pageToken ? { pageToken } : {}),
    })
    listCalls++
    const msgs = listRes.data.messages ?? []
    allMessages.push(...msgs.map(m => ({ id: m.id! })))
    pageToken = listRes.data.nextPageToken ?? undefined
    if (!pageToken || msgs.length === 0) break
  }

  if (allMessages.length === 0) return { emails: [], listCalls, getCalls: 0 }

  // Batch fetch in parallel groups of 10 to avoid rate limits
  const results = []
  for (let i = 0; i < allMessages.length; i += 10) {
    const batch = await Promise.all(
      allMessages.slice(i, i + 10).map(m =>
        gmail.users.messages.get({ userId: 'me', id: m.id!, format: 'full' })
      )
    )
    results.push(...batch)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emails = results.map(r => mapMessage(r.data as any))
  return { emails, listCalls, getCalls: allMessages.length }
}

function mapMessage(msg: { id?: string | null; threadId?: string | null; snippet?: string | null; labelIds?: string[] | null; payload?: { headers?: { name?: string | null; value?: string | null }[] | null; [key: string]: unknown } | null }) {
  const headers = msg.payload?.headers ?? []
  const { text, html } = extractBody(msg.payload)
  const fromRaw = getHeader(headers as { name?: string | null; value?: string | null }[], 'from')
  const fromMatch = fromRaw.match(/^(.*?)\s*<(.+?)>$/)
  return {
    gmail_id: msg.id!,
    thread_id: msg.threadId!,
    subject: getHeader(headers as { name?: string | null; value?: string | null }[], 'subject') || '(no subject)',
    from_name: fromMatch ? fromMatch[1].replace(/"/g, '').trim() : fromRaw,
    from_email: fromMatch ? fromMatch[2] : fromRaw,
    date: getHeader(headers as { name?: string | null; value?: string | null }[], 'date'),
    snippet: msg.snippet ?? '',
    body_text: text,
    body_html: html,
    is_read: msg.labelIds?.includes('UNREAD') ? 0 : 1,
    is_sent: msg.labelIds?.includes('SENT') && !msg.labelIds?.includes('INBOX') ? 1 : 0,
  }
}

function toHtmlBody(plain: string, signatureHtml?: string): string {
  const escaped = plain
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
  const sig = signatureHtml ? `<br><br><div class="gmail_signature">${signatureHtml}</div>` : ''
  return `<div dir="ltr">${escaped}${sig}</div>`
}

export async function sendNewEmail(to: string, subject: string, body: string, signatureHtml?: string, fromName?: string, fromEmail?: string) {
  const gmail = await getGmailClient()
  if (!gmail) throw new Error('Not authenticated')
  const html = toHtmlBody(body, signatureHtml)
  const fromHeader = fromName && fromEmail ? `From: ${fromName} <${fromEmail}>` : null
  const headers = [
    `To: ${to}`,
    ...(fromHeader ? [fromHeader] : []),
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
  ]
  const raw = [...headers, '', html].join('\r\n')
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: Buffer.from(raw).toString('base64url') },
  })
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function getGmailSettings(): Promise<{
  displayName: string
  sendAsEmail: string
  signatureHtml: string
  signatureText: string
} | null> {
  const gmail = await getGmailClient()
  if (!gmail) return null
  try {
    const res = await gmail.users.settings.sendAs.list({ userId: 'me' })
    const all = res.data.sendAs ?? []
    const primary = all.find(s => s.isPrimary) ?? all[0]
    if (!primary) return null
    return {
      displayName: primary.displayName ?? '',
      sendAsEmail: primary.sendAsEmail ?? '',
      signatureHtml: primary.signature ?? '',
      signatureText: primary.signature ? stripHtml(primary.signature) : '',
    }
  } catch {
    return null
  }
}

export async function updateSenderDisplayName(displayName: string): Promise<void> {
  const gmail = await getGmailClient()
  if (!gmail) throw new Error('Not authenticated')
  const listRes = await gmail.users.settings.sendAs.list({ userId: 'me' })
  const primary = listRes.data.sendAs?.find(s => s.isPrimary)
  if (!primary?.sendAsEmail) throw new Error('No primary send-as found')
  await gmail.users.settings.sendAs.patch({
    userId: 'me',
    sendAsEmail: primary.sendAsEmail,
    requestBody: { displayName },
  })
}

export async function trashEmail(gmailId: string) {
  const gmail = await getGmailClient()
  if (!gmail) throw new Error('Not authenticated')
  await gmail.users.messages.trash({ userId: 'me', id: gmailId })
}

export async function sendReply(threadId: string, to: string, subject: string, body: string, messageId?: string, signatureHtml?: string, fromName?: string, fromEmail?: string) {
  const gmail = await getGmailClient()
  if (!gmail) throw new Error('Not authenticated')

  const replyTo = messageId ?? threadId
  const html = toHtmlBody(body, signatureHtml)
  const fromHeader = fromName && fromEmail ? `From: ${fromName} <${fromEmail}>` : null
  const headers = [
    `To: ${to}`,
    ...(fromHeader ? [fromHeader] : []),
    `Subject: Re: ${subject}`,
    `In-Reply-To: ${replyTo}`,
    `References: ${replyTo}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
  ]
  const raw = [...headers, '', html].join('\r\n')

  const encoded = Buffer.from(raw).toString('base64url')
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded, threadId },
  })
}
