'use client'

import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Mail, Inbox, Wand2, Send, Trash2, Pencil, X, ExternalLink, BarChart2, ChevronDown, ChevronRight, ChevronUp, AlertTriangle, CheckCircle, Bot, Check, XCircle } from 'lucide-react'
import type { QueuedEmail } from '@/app/api/email/queue/route'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

interface Email {
  id: number
  gmail_id: string
  thread_id: string
  subject: string
  from_email: string
  from_name: string
  date: string
  snippet: string
  body_text: string
  body_html: string
  category: string
  priority: number
  ai_summary: string
  is_read: number
  is_sent: number
  draft_id?: number
  draft_body?: string
  draft_status?: string
}

interface UsageData {
  anthropic: {
    total_input_tokens: number
    total_output_tokens: number
    total_tokens: number
    estimated_cost_usd: number
    by_operation: { operation: string; model: string; input_tokens: number; output_tokens: number; call_count: number }[]
  }
  gmail: {
    list_calls: number
    get_calls: number
    total_calls: number
    note: string
  }
}

const CATEGORIES = [
  { value: 'all',               label: 'Unsorted',      apiValue: 'other' },
  { value: 'wholesale_inquiry', label: 'Wholesale',     apiValue: 'wholesale_inquiry' },
  { value: 'customer_retail',   label: 'Customer',      apiValue: 'customer_retail' },
  { value: 'press_collab',      label: 'Press & Collabs', apiValue: 'press_collab' },
  { value: 'admin_ops',         label: 'Admin & Ops',   apiValue: 'admin_ops' },
]

const PRIORITY_DOT: Record<number, string> = {
  1: 'bg-tomato',
  2: 'bg-mushroom',
  3: 'bg-mushroom/40',
}
const PRIORITY_BADGE: Record<number, string> = {
  1: 'text-tomato bg-tomato/10 border-tomato/30',
  2: 'text-ink bg-white border-mushroom/60',
  3: 'text-ink/60 bg-oatmilk border-mushroom/40',
}
const PRIORITY_LABEL: Record<number, string> = { 1: 'Urgent', 2: 'Normal', 3: 'Low' }

const CATEGORY_BADGE: Record<string, string> = {
  wholesale_inquiry: 'bg-blueberry-light text-blueberry border-blueberry/30',
  customer_retail:   'bg-sage-light text-ink-dark border-sage/30',
  press_collab:      'bg-candy-light text-ink-dark border-candy/30',
  admin_ops:         'bg-butter-light text-ink-dark border-butter/40',
  other:             'bg-oatmilk text-ink border-mushroom/40',
}

const AVATAR_COLORS = ['#4B5FDE', '#5C8C6B', '#D4473A', '#C96B96', '#D4A827', '#7A6FA8', '#4A8FA8']

function getAvatarColor(str: string) {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getInitials(name: string, email: string) {
  const n = (name || email).trim()
  const parts = n.split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return n.slice(0, 2).toUpperCase()
}

function Avatar({ name, email, size = 32 }: { name: string; email: string; size?: number }) {
  const color = getAvatarColor(email || name)
  return (
    <div
      className="rounded-full flex items-center justify-center shrink-0 text-white font-semibold select-none"
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.38, fontFamily: "'Jost', system-ui, sans-serif" }}
    >
      {getInitials(name, email)}
    </div>
  )
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr)
    const now = new Date()
    if (d.toDateString() === now.toDateString()) return format(d, 'h:mm a')
    if (d.getFullYear() === now.getFullYear()) return format(d, 'MMM d')
    return format(d, 'MMM d, yyyy')
  } catch { return dateStr }
}


export default function EmailPage() {
  const [connected, setConnected] = useState(false)
  const [emails, setEmails] = useState<Email[]>([])
  const [sent, setSent] = useState<Email[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [category, setCategory] = useState('all')
  const [selected, setSelected] = useState<Email | null>(null)
  const [draftBody, setDraftBody] = useState('')
  const [generatingDraft, setGeneratingDraft] = useState(false)
  const [sending, setSending] = useState(false)
  const [showBody, setShowBody] = useState(true)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [composeTo, setComposeTo] = useState('')
  const [composeSubject, setComposeSubject] = useState('')
  const [composeBody, setComposeBody] = useState('')
  const [composeSending, setComposeSending] = useState(false)
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [showUsage, setShowUsage] = useState(false)
  const [sentExpanded, setSentExpanded] = useState(false)
  const [signatureHtml, setSignatureHtml] = useState('')
  const [signatureText, setSignatureText] = useState('')
  const [gmailDisplayName, setGmailDisplayName] = useState<string | null>(null)
  const [gmailSendAsEmail, setGmailSendAsEmail] = useState<string>('')
  const [fixingName, setFixingName] = useState(false)
  const [nameFixed, setNameFixed] = useState(false)
  const [view, setView] = useState<'inbox' | 'queue'>('inbox')
  const [queuedEmails, setQueuedEmails] = useState<QueuedEmail[]>([])
  const [selectedQueued, setSelectedQueued] = useState<QueuedEmail | null>(null)
  const [queueLoading, setQueueLoading] = useState(false)
  const [queueAction, setQueueAction] = useState<Record<number, 'approving' | 'dismissing' | 'deleting' | null>>({})

  useEffect(() => {
    fetch('/api/email/gmail-settings')
      .then(r => r.json())
      .then(data => {
        if (data.error) return
        setGmailDisplayName(data.displayName)
        if (data.sendAsEmail) setGmailSendAsEmail(data.sendAsEmail)
        if (data.signatureHtml) setSignatureHtml(data.signatureHtml)
        if (data.signatureText) setSignatureText(data.signatureText)
      })
      .catch(() => {})
  }, [])

  async function fixDisplayName() {
    setFixingName(true)
    const res = await fetch('/api/email/gmail-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Weeknight Dinner Party' }),
    })
    const data = await res.json()
    if (data.ok) {
      setGmailDisplayName('Weeknight Dinner Party')
      setNameFixed(true)
    }
    setFixingName(false)
  }

  const apiCategory = (cat: string) => CATEGORIES.find(c => c.value === cat)?.apiValue ?? 'other'

  const load = useCallback(async (cat?: string) => {
    const c = cat ?? category
    const params = `?category=${apiCategory(c)}`
    const res = await fetch(`/api/email${params}`)
    const data = await res.json()
    setConnected(data.connected)
    setEmails(data.emails ?? [])
    setSent(data.sent ?? [])
    setCounts(data.counts ?? {})
    setLoading(false)
  }, [category])

  const loadUsage = useCallback(async () => {
    const res = await fetch('/api/email/usage')
    const data = await res.json()
    if (!data.error) setUsage(data)
  }, [])

  const loadQueue = useCallback(async () => {
    setQueueLoading(true)
    try {
      const res = await fetch('/api/email/queue')
      const data = await res.json()
      setQueuedEmails(data.emails ?? [])
      if (selectedQueued) {
        const updated = (data.emails ?? []).find((e: QueuedEmail) => e.id === selectedQueued.id)
        setSelectedQueued(updated ?? null)
      }
    } catch { /* */ } finally {
      setQueueLoading(false)
    }
  }, [selectedQueued])

  async function handleQueueAction(id: number, action: 'approve' | 'dismiss' | 'delete') {
    setQueueAction(prev => ({ ...prev, [id]: action === 'approve' ? 'approving' : action === 'dismiss' ? 'dismissing' : 'deleting' }))
    await fetch('/api/email/queue', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    })
    await loadQueue()
    if (selectedQueued?.id === id) setSelectedQueued(null)
    setQueueAction(prev => ({ ...prev, [id]: null }))
  }

  useEffect(() => { load() }, [load])
  useEffect(() => { loadUsage() }, [loadUsage])
  useEffect(() => { loadQueue() }, [loadQueue])

  useEffect(() => {
    if (selected) {
      const allEmails = [...emails, ...sent]
      const updated = allEmails.find(e => e.id === selected.id)
      if (updated) {
        setSelected(updated)
        if (!draftBody) setDraftBody(updated.draft_body ?? '')
      }
    }
  }, [emails, sent])

  async function sync() {
    setSyncing(true); setSyncMsg(null)
    const res = await fetch('/api/email/sync', { method: 'POST' })
    const data = await res.json()
    setSyncMsg(data.error ? `Error: ${data.error}` : `Synced ${data.synced} · ${data.analyzed} analyzed`)
    await Promise.all([load(), loadUsage()])
    setSyncing(false)
  }

  async function markRead(email: Email) {
    if (email.is_read) return
    await fetch(`/api/email/${email.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_read: 1 }),
    })
    setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_read: 1 } : e))
    setSent(prev => prev.map(e => e.id === email.id ? { ...e, is_read: 1 } : e))
  }

  function selectEmail(email: Email) {
    setSelected(email)
    setDraftBody(email.draft_body ?? '')
    setShowBody(true)
    setComposing(false)
    markRead(email)
  }

  async function sendCompose() {
    if (!composeTo.trim() || !composeSubject.trim() || !composeBody.trim()) return
    setComposeSending(true)
    const res = await fetch('/api/email/compose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: composeTo, subject: composeSubject, body: composeBody, signatureHtml: signatureHtml || undefined, fromName: gmailDisplayName || undefined, fromEmail: gmailSendAsEmail || undefined }),
    })
    const data = await res.json()
    if (!data.error) {
      setComposing(false); setComposeTo(''); setComposeSubject(''); setComposeBody('')
    }
    setComposeSending(false)
  }

  async function generateDraft() {
    if (!selected) return
    setGeneratingDraft(true)
    const res = await fetch(`/api/email/${selected.id}/draft`, { method: 'POST' })
    const data = await res.json()
    // Append signature after AI draft
    const withSig = data.draft_body ? `${data.draft_body}\n\n${signatureText}` : ''
    setDraftBody(withSig)
    await Promise.all([load(), loadUsage()])
    setGeneratingDraft(false)
  }

  async function deleteEmail(email: Email) {
    const allSorted = [...emails, ...sent].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const idx = allSorted.findIndex(e => e.id === email.id)
    const next = allSorted.find((e, i) => i > idx && !e.is_sent) ?? allSorted.slice(0, idx).reverse().find(e => !e.is_sent) ?? null

    await fetch(`/api/email/${email.id}`, { method: 'DELETE' })

    if (selected?.id === email.id || !selected) {
      setSelected(next)
      setDraftBody(next?.draft_body ?? '')
      setShowBody(true)
    }
    await load()
  }

  async function reassignCategory(email: Email, newCategory: string) {
    await fetch(`/api/email/${email.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: newCategory }),
    })
    await load()
  }

  async function saveDraft(body: string) {
    if (!selected?.draft_id) return
    await fetch(`/api/email/${selected.id}/draft`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft_id: selected.draft_id, draft_body: body }),
    })
  }

  async function sendEmail() {
    if (!selected || !draftBody.trim()) return
    setSending(true)
    await fetch(`/api/email/${selected.id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft_id: selected.draft_id, draft_body: draftBody, signatureHtml: signatureHtml || undefined, fromName: gmailDisplayName || undefined, fromEmail: gmailSendAsEmail || undefined }),
    })
    setDraftBody('')
    await load()
    setSending(false)
  }

  const sorted = [...emails].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const urgent = sorted.filter(e => e.priority === 1)
  const normal = sorted.filter(e => e.priority === 2)
  const low    = sorted.filter(e => e.priority === 3)

  const unreadCount = emails.filter(e => !e.is_read).length

  // Counts for tab pills — sourced from API (all-category query), not just loaded emails
  const countForTab = (cat: string) => {
    if (cat === 'all') return counts['other'] ?? 0
    return counts[cat] ?? 0
  }

  const totalAnthropicTokens = usage?.anthropic.total_tokens ?? 0

  function EmailRow({ email, isSent = false }: { email: Email; isSent?: boolean }) {
    const sel = selected?.id === email.id
    const unread = !email.is_read && !isSent
    return (
      <div className={cn(
        'group/row relative flex items-center gap-3 px-4 py-3 border-b border-mushroom/20 hover:bg-oatmilk/70 cursor-pointer transition-colors',
        sel && 'bg-blueberry-light/60 border-l-2 border-l-blueberry',
        unread && !sel && 'bg-cream/40'
      )} onClick={() => selectEmail(email)}>
        <Avatar name={email.from_name} email={email.from_email} size={38} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('text-sm truncate flex-1', unread ? 'font-bold text-ink-dark' : 'font-medium text-ink')}
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
              {isSent ? `To: ${email.from_name || email.from_email}` : (email.from_name || email.from_email)}
            </span>
            <span className="text-xs text-ink/50 shrink-0" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
              {formatDate(email.date)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {!isSent && (
              <div className={cn('w-1.5 h-1.5 rounded-full shrink-0 mt-px', PRIORITY_DOT[email.priority] ?? PRIORITY_DOT[2])}
                title={PRIORITY_LABEL[email.priority]} />
            )}
            <p className={cn('text-xs truncate flex-1', unread ? 'text-ink-dark' : 'text-ink/70')}
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
              <span className={cn(unread && 'font-semibold')}>{email.subject}</span>
              {email.ai_summary && !isSent && (
                <span className="font-normal text-ink/50"> — {email.ai_summary}</span>
              )}
            </p>
            {email.draft_body && email.draft_status !== 'sent' && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-citrus-light border border-citrus/30 text-ink-dark"
                style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                Draft
              </span>
            )}
          </div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); deleteEmail(email) }}
          className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover/row:opacity-100 text-ink/30 hover:text-tomato transition-all"
          title="Move to trash"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  function Section({ title, items }: { title: string; items: Email[] }) {
    if (items.length === 0) return null
    return (
      <div>
        <p className="px-4 py-1.5 text-[10px] uppercase tracking-widest font-semibold text-ink/50 bg-oatmilk/30 border-b border-mushroom/20"
          style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
          {title} · {items.length}
        </p>
        {items.map(e => <EmailRow key={e.id} email={e} />)}
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-8 pt-8 pb-4 border-b border-mushroom shrink-0">
        <p className="text-[10px] uppercase tracking-[0.2em] text-ink font-semibold mb-1"
          style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Command Center</p>
        <div className="flex items-end gap-4 mb-4">
          <h1 className="text-3xl text-ink-dark"
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700 }}>
            Email
          </h1>
          {unreadCount > 0 && (
            <span className="mb-1 text-xs px-2 py-0.5 rounded-full bg-blueberry text-white font-semibold"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
              {unreadCount} unread
            </span>
          )}
          <div className="flex items-center gap-2 mb-0.5 ml-auto flex-wrap">
            {syncMsg && (
              <span className="text-xs text-ink" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{syncMsg}</span>
            )}
            {connected ? (
              <>
                <button onClick={() => {
                  setComposing(true); setSelected(null)
                  setComposeBody('')
                }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white border border-mushroom text-ink-dark rounded-lg hover:border-ink transition-colors cursor-pointer"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                  <Pencil className="w-3 h-3" /> Compose
                </button>
                <a href="https://mail.google.com" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white border border-mushroom text-ink-dark rounded-lg hover:border-ink transition-colors cursor-pointer"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                  <ExternalLink className="w-3 h-3" /> Gmail
                </a>
                <button onClick={sync} disabled={syncing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-ink-dark text-cream rounded-lg hover:bg-ink transition-colors cursor-pointer disabled:opacity-50"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                  <RefreshCw className={cn('w-3 h-3', syncing && 'animate-spin')} />
                  {syncing ? 'Syncing…' : 'Sync'}
                </button>
                <button onClick={() => setShowUsage(v => !v)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors cursor-pointer',
                    showUsage ? 'bg-blueberry-light border-blueberry/30 text-blueberry' : 'bg-white border-mushroom text-ink hover:border-ink'
                  )}
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                  <BarChart2 className="w-3 h-3" />
                  {totalAnthropicTokens > 0 ? `${(totalAnthropicTokens / 1000).toFixed(1)}k tokens` : 'API Usage'}
                </button>
                {/* Always-visible reconnect for granting new scopes */}
                <a href="/api/auth/google"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white border border-mushroom text-ink/60 rounded-lg hover:border-ink hover:text-ink-dark transition-colors cursor-pointer"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                  title="Re-authorize to grant updated permissions">
                  <RefreshCw className="w-3 h-3" /> Reconnect
                </a>
              </>
            ) : (
              <a href="/api/auth/google"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-ink-dark text-cream rounded-lg hover:bg-ink transition-colors cursor-pointer"
                style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                <Mail className="w-3 h-3" /> Connect Gmail
              </a>
            )}
          </div>
        </div>

        {/* API Usage panel */}
        {showUsage && (
          <div className="mb-4 p-4 bg-blueberry-light/40 border border-blueberry/20 rounded-xl">
            <p className="text-xs font-semibold text-blueberry mb-3" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
              API Usage
            </p>
            {!usage || (usage.anthropic.total_tokens === 0 && usage.gmail.total_calls === 0) ? (
              <p className="text-xs text-ink/50" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                No usage yet — sync emails to start tracking.
              </p>
            ) : (
              <div className="space-y-3">
                {/* Anthropic */}
                {usage.anthropic.total_tokens > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-ink/50 font-semibold mb-2"
                      style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Anthropic (AI)</p>
                    <div className="grid grid-cols-3 gap-3 mb-2">
                      <div>
                        <p className="text-[10px] text-ink/60 mb-0.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Total tokens</p>
                        <p className="text-sm font-bold text-ink-dark" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                          {usage.anthropic.total_tokens.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-ink/40" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                          {usage.anthropic.total_input_tokens.toLocaleString()} in · {usage.anthropic.total_output_tokens.toLocaleString()} out
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-ink/60 mb-0.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Est. cost</p>
                        <p className="text-sm font-bold text-ink-dark" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                          ${usage.anthropic.estimated_cost_usd.toFixed(4)}
                        </p>
                        <p className="text-[10px] text-ink/40" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>USD estimate</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-ink/60 mb-0.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>API calls</p>
                        <p className="text-sm font-bold text-ink-dark" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                          {usage.anthropic.by_operation.reduce((s, r) => s + r.call_count, 0)}
                        </p>
                        <div className="flex gap-1.5 flex-wrap mt-0.5">
                          {usage.anthropic.by_operation.map(op => (
                            <span key={`${op.operation}-${op.model}`}
                              className="text-[10px] text-ink/50"
                              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                              {op.call_count}× {op.operation}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {/* Gmail */}
                {usage.gmail.total_calls > 0 && (
                  <div className="pt-3 border-t border-blueberry/10">
                    <p className="text-[10px] uppercase tracking-wider text-ink/50 font-semibold mb-2"
                      style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Gmail API</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-[10px] text-ink/60 mb-0.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Total calls</p>
                        <p className="text-sm font-bold text-ink-dark" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                          {usage.gmail.total_calls.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-ink/40" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                          {usage.gmail.list_calls} list · {usage.gmail.get_calls} get
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-ink/60 mb-0.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Est. cost</p>
                        <p className="text-sm font-bold text-ink-dark" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>$0.00</p>
                        <p className="text-[10px] text-ink/40" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>free tier</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-ink/60 mb-0.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Quota</p>
                        <p className="text-[10px] text-ink/50 leading-relaxed" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                          Free up to 1B units/day
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Sender name fix banner — shows when Gmail settings loaded and name is wrong */}
        {gmailDisplayName && gmailDisplayName !== 'Weeknight Dinner Party' && !nameFixed && (
          <div className="mb-3 flex items-center gap-2.5 px-3 py-2.5 bg-butter-light border border-butter/60 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-ink shrink-0" />
            <p className="text-xs text-ink-dark flex-1" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
              Sender name is currently <strong>"{gmailDisplayName}"</strong> — recipients see this, not Weeknight Dinner Party.
            </p>
            <button onClick={fixDisplayName} disabled={fixingName}
              className="shrink-0 text-xs font-semibold text-ink-dark underline underline-offset-2 cursor-pointer disabled:opacity-50"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
              {fixingName ? 'Fixing…' : 'Fix now →'}
            </button>
          </div>
        )}

        {nameFixed && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-sage-light border border-sage/40 rounded-xl">
            <CheckCircle className="w-4 h-4 text-sage shrink-0" />
            <p className="text-xs text-ink-dark" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
              Sender name updated to <strong>Weeknight Dinner Party</strong>. Future emails will show this name.
            </p>
          </div>
        )}

        {/* View toggle: Inbox vs Rose Mary Queue */}
        <div className="flex gap-1.5 mb-3" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
          <button
            onClick={() => setView('inbox')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg border transition-all cursor-pointer',
              view === 'inbox' ? 'bg-ink-dark text-cream border-ink-dark' : 'bg-white text-ink border-mushroom hover:border-ink'
            )}>
            <Mail className="w-3 h-3" /> Inbox
          </button>
          <button
            onClick={() => { setView('queue'); loadQueue() }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg border transition-all cursor-pointer',
              view === 'queue' ? 'bg-[#D7FF10] text-black border-[#D7FF10]' : 'bg-white text-ink border-mushroom hover:border-ink'
            )}>
            <Bot className="w-3 h-3" /> Rose Mary Queue
            {queuedEmails.filter(e => e.status === 'pending_review').length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold leading-none bg-[#C14B3A] text-white">
                {queuedEmails.filter(e => e.status === 'pending_review').length}
              </span>
            )}
          </button>
        </div>

        {/* Category tabs — inbox only */}
        {view === 'inbox' && <div className="flex gap-1.5 flex-wrap" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
          {CATEGORIES.map(cat => {
            const count = countForTab(cat.value)
            return (
              <button key={cat.value}
                onClick={() => { setCategory(cat.value); load(cat.value) }}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 text-xs rounded-lg border transition-all cursor-pointer',
                  category === cat.value
                    ? 'bg-ink-dark text-cream border-ink-dark'
                    : 'bg-white text-ink border-mushroom hover:border-ink hover:text-ink-dark'
                )}>
                {cat.label}
                {count > 0 && (
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full font-semibold leading-none',
                    category === cat.value ? 'bg-white/20 text-cream' : 'bg-mushroom/40 text-ink'
                  )}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>}
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Rose Mary Queue view ─────────────────────────────────────── */}
        {view === 'queue' && (
          <>
            {/* Queue list */}
            <div className="border-r border-mushroom overflow-y-auto shrink-0 w-[320px]">
              {queueLoading && queuedEmails.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-xs text-ink/50" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                  Loading…
                </div>
              ) : queuedEmails.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8 py-16">
                  <Bot className="w-10 h-10 text-mushroom" />
                  <p className="text-sm font-semibold text-ink-dark" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>No queued emails</p>
                  <p className="text-xs text-ink/60" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                    When Rose Mary drafts an email, it will appear here for your review before sending.
                  </p>
                </div>
              ) : (
                queuedEmails.map(email => (
                  <div
                    key={email.id}
                    onClick={() => setSelectedQueued(email)}
                    className={cn(
                      'px-4 py-3 border-b border-mushroom/50 cursor-pointer transition-colors',
                      selectedQueued?.id === email.id ? 'bg-[#D7FF10]/20' : 'hover:bg-oatmilk'
                    )}
                  >
                    <div className="flex items-start gap-2 mb-1">
                      <Bot className="w-3.5 h-3.5 text-ink/40 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-ink-dark truncate" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                            {email.to_name || email.to_email || 'No recipient'}
                          </span>
                          <span className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 font-medium',
                            email.status === 'pending_review' ? 'bg-butter/30 text-ink border-butter/60' :
                            email.status === 'approved' ? 'bg-sage-light text-sage border-sage/30' :
                            'bg-mushroom/20 text-ink/50 border-mushroom/30'
                          )} style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                            {email.status === 'pending_review' ? 'Pending' : email.status === 'approved' ? 'Approved' : 'Dismissed'}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-ink mt-0.5 truncate" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                          {email.subject}
                        </p>
                        <p className="text-[11px] text-ink/50 mt-0.5 line-clamp-2 leading-snug" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                          {email.body.slice(0, 100)}…
                        </p>
                      </div>
                    </div>
                    <div className="text-[10px] text-ink/40 mt-1 ml-5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                      Drafted {formatDate(email.created_at)}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Queue detail */}
            <div className="flex-1 overflow-y-auto">
              {selectedQueued ? (
                <div className="p-6 max-w-2xl">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Bot className="w-4 h-4 text-ink/40" />
                        <span className="text-[10px] uppercase tracking-wider text-ink/50 font-semibold" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                          Rose Mary Draft
                        </span>
                      </div>
                      <h2 className="text-xl font-bold text-ink-dark" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
                        {selectedQueued.subject}
                      </h2>
                      <p className="text-xs text-ink/60 mt-1" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                        To: {selectedQueued.to_name ? `${selectedQueued.to_name} <${selectedQueued.to_email}>` : selectedQueued.to_email ?? 'No recipient set'}
                      </p>
                    </div>
                    <button onClick={() => setSelectedQueued(null)} className="text-ink/30 hover:text-ink cursor-pointer">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Context note */}
                  {selectedQueued.context && (
                    <div className="mb-4 px-3 py-2.5 bg-butter-light border border-butter/60 rounded-xl text-xs text-ink-dark" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                      <span className="font-semibold text-ink/60 uppercase tracking-wider text-[10px]">Context: </span>
                      {selectedQueued.context}
                    </div>
                  )}

                  {/* Email body */}
                  <div className="bg-white border border-mushroom rounded-xl p-4 mb-4 whitespace-pre-wrap text-sm text-ink-dark leading-relaxed" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                    {selectedQueued.body}
                  </div>

                  {/* Actions */}
                  {selectedQueued.status === 'pending_review' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleQueueAction(selectedQueued.id, 'approve')}
                        disabled={!!queueAction[selectedQueued.id]}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-[#D7FF10] text-black rounded-lg hover:bg-[#c8f000] transition-colors cursor-pointer disabled:opacity-50"
                        style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                        <Check className="w-3.5 h-3.5" />
                        {queueAction[selectedQueued.id] === 'approving' ? 'Approving…' : 'Approve to Send'}
                      </button>
                      <button
                        onClick={() => handleQueueAction(selectedQueued.id, 'dismiss')}
                        disabled={!!queueAction[selectedQueued.id]}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm text-ink/60 border border-mushroom rounded-lg hover:border-ink hover:text-ink transition-colors cursor-pointer disabled:opacity-50"
                        style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                        <XCircle className="w-3.5 h-3.5" />
                        {queueAction[selectedQueued.id] === 'dismissing' ? 'Dismissing…' : 'Dismiss'}
                      </button>
                      <button
                        onClick={() => handleQueueAction(selectedQueued.id, 'delete')}
                        disabled={!!queueAction[selectedQueued.id]}
                        className="ml-auto flex items-center gap-1.5 px-3 py-2 text-xs text-ink/40 hover:text-tomato transition-colors cursor-pointer disabled:opacity-50"
                        style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  )}

                  {selectedQueued.status !== 'pending_review' && (
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg',
                        selectedQueued.status === 'approved' ? 'bg-sage-light text-sage' : 'bg-mushroom/20 text-ink/50'
                      )} style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                        {selectedQueued.status === 'approved' ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                        {selectedQueued.status === 'approved' ? 'Approved' : 'Dismissed'}
                        {selectedQueued.reviewed_at && ` · ${formatDate(selectedQueued.reviewed_at)}`}
                      </div>
                      <button
                        onClick={() => handleQueueAction(selectedQueued.id, 'delete')}
                        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs text-ink/40 hover:text-tomato transition-colors cursor-pointer"
                        style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8 text-ink/40">
                  <Bot className="w-8 h-8" />
                  <p className="text-sm" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Select a draft to review</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Inbox view ───────────────────────────────────────────────── */}
        {view === 'inbox' && <>

        {/* Email list */}
        <div className="border-r border-mushroom overflow-y-auto shrink-0 w-[320px]">
          {!connected ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
              <Inbox className="w-10 h-10 text-mushroom" />
              <div>
                <p className="text-sm font-semibold text-ink-dark mb-1" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                  Connect your Gmail
                </p>
                <p className="text-xs text-ink" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                  Link hello@agoodworkstudio.com to start viewing and managing emails.
                </p>
              </div>
              <a href="/api/auth/google"
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-ink-dark text-cream rounded-xl hover:bg-ink transition-colors cursor-pointer"
                style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                <Mail className="w-4 h-4" /> Connect Gmail
              </a>
            </div>
          ) : loading ? (
            <p className="p-6 text-sm text-ink" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Loading…</p>
          ) : (
            <>
              {emails.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-8">
                  <Inbox className="w-8 h-8 text-mushroom" />
                  <p className="text-sm text-ink" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                    {category === 'all' ? 'All caught up — nothing unsorted.' : 'No emails in this bucket.'}
                  </p>
                </div>
              ) : (
                <>
                  <Section title="Urgent" items={urgent} />
                  <Section title="Normal" items={normal} />
                  <Section title="Low" items={low} />
                </>
              )}

              {/* Collapsible Sent */}
              {sent.length > 0 && (
                <div className="border-t border-mushroom/30">
                  <button
                    onClick={() => setSentExpanded(v => !v)}
                    className="w-full flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-widest font-semibold text-ink/50 bg-oatmilk/30 hover:bg-oatmilk/60 transition-colors cursor-pointer"
                    style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                  >
                    {sentExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    Sent · {sent.length}
                  </button>
                  {sentExpanded && sent.map(e => <EmailRow key={e.id} email={e} isSent />)}
                </div>
              )}
            </>
          )}
        </div>

        {/* Compose pane */}
        {composing && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-mushroom shrink-0 flex items-center gap-3">
              <h2 className="text-xl text-ink-dark flex-1"
                style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700 }}>
                New Email
              </h2>
              <button onClick={() => setComposing(false)} className="text-ink/40 hover:text-ink transition-colors cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-semibold text-ink mb-1"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>To</label>
                <input value={composeTo} onChange={e => setComposeTo(e.target.value)}
                  placeholder="recipient@example.com"
                  className="w-full px-3 py-2 text-sm bg-white border border-mushroom/60 rounded-lg outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink text-ink-dark placeholder:text-ink/40"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-semibold text-ink mb-1"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Subject</label>
                <input value={composeSubject} onChange={e => setComposeSubject(e.target.value)}
                  placeholder="Subject line"
                  className="w-full px-3 py-2 text-sm bg-white border border-mushroom/60 rounded-lg outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink text-ink-dark placeholder:text-ink/40"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-semibold text-ink mb-1"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Message</label>
                <textarea value={composeBody} onChange={e => setComposeBody(e.target.value)}
                  placeholder="Write your message…" rows={14}
                  className="w-full px-3 py-2 text-sm bg-white border border-mushroom/60 rounded-xl outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink text-ink-dark placeholder:text-ink/40 resize-none"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif", lineHeight: 1.7 }}
                />
              </div>
              <div className="flex items-center justify-between pt-1">
                <p className="text-[10px] text-ink/50" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                  {signatureHtml ? 'Your Gmail signature will be appended' : 'No signature loaded'}
                </p>
                <button onClick={sendCompose}
                  disabled={composeSending || !composeTo.trim() || !composeSubject.trim() || !composeBody.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm bg-ink-dark text-cream rounded-xl hover:bg-ink transition-colors cursor-pointer disabled:opacity-50"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                  <Send className="w-3.5 h-3.5" />
                  {composeSending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!composing && !selected && (
          <div className="flex-1 flex items-center justify-center text-center">
            <div>
              <Mail className="w-8 h-8 text-mushroom mx-auto mb-2" />
              <p className="text-sm text-ink" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                Select an email to read it
              </p>
            </div>
          </div>
        )}

        {/* Detail pane — original-style layout */}
        {!composing && selected && (
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* Header */}
            <div className="px-6 py-4 border-b border-mushroom shrink-0">
              <div className="flex items-start gap-2 mb-2">
                <h2 className="text-xl text-ink-dark flex-1 min-w-0 leading-snug"
                  style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700 }}>
                  {selected.subject}
                </h2>
                <button onClick={() => deleteEmail(selected)} title="Move to trash"
                  className="shrink-0 text-ink/40 hover:text-tomato transition-colors cursor-pointer mt-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Sender row */}
              <div className="flex items-center gap-2.5 mb-2">
                <Avatar name={selected.from_name} email={selected.from_email} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-ink-dark" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                      {selected.from_name || selected.from_email}
                    </span>
                    {selected.from_name && (
                      <span className="text-xs text-ink/50" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                        &lt;{selected.from_email}&gt;
                      </span>
                    )}
                    <span className="text-xs text-ink/50 ml-auto" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                      {formatDate(selected.date)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Meta row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded border', PRIORITY_BADGE[selected.priority] ?? PRIORITY_BADGE[2])}
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                  {PRIORITY_LABEL[selected.priority] ?? 'Normal'}
                </span>
                {!selected.is_read && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blueberry/10 text-blueberry font-semibold border border-blueberry/20"
                    style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                    Unread
                  </span>
                )}
                {!selected.is_sent && (
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-[10px] uppercase tracking-widest font-semibold text-ink"
                      style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Bucket:</span>
                    <select
                      value={selected.category}
                      onChange={e => reassignCategory(selected, e.target.value)}
                      className={cn('text-[10px] px-2 py-0.5 rounded border outline-none cursor-pointer', CATEGORY_BADGE[selected.category] ?? CATEGORY_BADGE.other)}
                      style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                    >
                      <option value="wholesale_inquiry">Wholesale</option>
                      <option value="customer_retail">Customer</option>
                      <option value="press_collab">Press & Collabs</option>
                      <option value="admin_ops">Admin & Ops</option>
                      <option value="other">Unsorted</option>
                    </select>
                  </div>
                )}
              </div>

              {/* AI summary */}
              {selected.ai_summary && !selected.is_sent && (
                <div className="mt-2 px-3 py-2 bg-blueberry-light/50 rounded-lg border border-blueberry/20 flex items-start gap-1.5">
                  <span className="text-[10px] font-bold text-blueberry shrink-0 mt-px" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>AI</span>
                  <p className="text-xs text-ink-dark" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{selected.ai_summary}</p>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Email body toggle */}
              <div>
                <button onClick={() => setShowBody(v => !v)}
                  className="flex items-center gap-1.5 text-xs text-ink hover:text-ink-dark transition-colors cursor-pointer mb-2"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                  {showBody ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {showBody ? 'Hide' : 'Show'} message
                </button>
                {showBody && (
                  selected.body_html?.trim() ? (
                    <iframe
                      key={selected.id}
                      srcDoc={selected.body_html}
                      className="w-full border border-mushroom/60 rounded-xl bg-white"
                      style={{ height: '400px' }}
                      title="Email body"
                    />
                  ) : selected.body_text?.trim() ? (
                    <div className="text-sm text-ink-dark bg-oatmilk/40 border border-mushroom/60 rounded-xl p-4 whitespace-pre-wrap max-h-72 overflow-y-auto"
                      style={{ fontFamily: "'Jost', system-ui, sans-serif", lineHeight: 1.6 }}>
                      {selected.body_text}
                    </div>
                  ) : (
                    <div className="text-sm text-ink/60 bg-oatmilk/40 border border-mushroom/60 rounded-xl p-4 italic"
                      style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                      {selected.snippet || 'No message body available — try re-syncing.'}
                    </div>
                  )
                )}
              </div>

              {/* Draft Reply section — only for received emails */}
              {!selected.is_sent && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-ink"
                      style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                      Draft Reply
                    </p>
                    <button onClick={generateDraft} disabled={generatingDraft}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs bg-blueberry-light border border-blueberry/30 text-blueberry rounded-lg hover:bg-blueberry hover:text-white transition-colors cursor-pointer disabled:opacity-50 ml-auto"
                      style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                      <Wand2 className="w-3 h-3" />
                      {generatingDraft ? 'Drafting…' : draftBody ? 'Regenerate' : 'Draft with AI'}
                    </button>
                  </div>

                  {draftBody ? (
                    <>
                      <textarea
                        value={draftBody}
                        onChange={e => setDraftBody(e.target.value)}
                        onBlur={() => saveDraft(draftBody)}
                        rows={12}
                        className="w-full px-4 py-3 text-sm bg-white border border-mushroom/60 rounded-xl outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink text-ink-dark resize-none transition-all"
                        style={{ fontFamily: "'Jost', system-ui, sans-serif", lineHeight: 1.7 }}
                      />
                      <div className="flex items-center gap-3 mt-2">
                        <p className="text-[10px] text-ink/50 flex-1"
                          style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                          {signatureHtml ? 'Your Gmail signature will be appended' : 'No signature loaded'}
                        </p>
                        <button onClick={sendEmail} disabled={sending || !draftBody.trim()}
                          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-ink-dark text-cream rounded-xl hover:bg-ink transition-colors cursor-pointer disabled:opacity-50"
                          style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                          <Send className="w-3.5 h-3.5" />
                          {sending ? 'Sending…' : 'Send'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 border border-dashed border-mushroom rounded-xl gap-2">
                      <Wand2 className="w-6 h-6 text-mushroom" />
                      <p className="text-xs text-ink" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                        Click "Draft with AI" to generate a reply
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Signature preview */}
              {signatureHtml && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-ink mb-1.5"
                    style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                    Signature <span className="normal-case tracking-normal font-normal text-ink/50">(auto-appended from Gmail)</span>
                  </p>
                  <div
                    className="px-3 py-2.5 bg-oatmilk/40 border border-mushroom/40 rounded-lg text-xs text-ink/70 pointer-events-none select-none"
                    dangerouslySetInnerHTML={{ __html: signatureHtml }}
                  />
                </div>
              )}

            </div>
          </div>
        )}
      </>}

      </div>{/* end Body */}
    </div>
  )
}
