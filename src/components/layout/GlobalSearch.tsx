'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, CheckSquare, Users, Mail, LayoutGrid } from 'lucide-react'

const FONT = { fontFamily: "'Jost', system-ui, sans-serif" }

interface TaskResult {
  id: number; title: string; status: string; priority: string
  project_id: number | null; project_name: string | null; project_color: string | null
}
interface SubtaskResult {
  id: number; title: string; status: string; task_id: number
  task_title: string; project_name: string | null
}
interface ContactResult {
  id: number; shopify_id: string; name: string; email: string
  orders_count: number; total_spent: number
}
interface CampaignResult {
  id: number; name: string; status: string; send_time: string | null; klaviyo_id: string | null
}

const STATUS_LABEL: Record<string, string> = {
  todo: 'To Do', in_progress: 'In Progress', review: 'Review', done: 'Done'
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    todo: 'bg-mushroom/40 text-ink/60',
    in_progress: 'bg-butter/30 text-ink-dark',
    review: 'bg-citrus/20 text-ink-dark',
    done: 'bg-sage/20 text-sage',
    Sent: 'bg-sage/20 text-sage',
    Draft: 'bg-mushroom/40 text-ink/60',
  }
  return (
    <span className={`text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${colors[status] ?? 'bg-mushroom/40 text-ink/60'}`} style={FONT}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [tasks, setTasks] = useState<TaskResult[]>([])
  const [subtasks, setSubtasks] = useState<SubtaskResult[]>([])
  const [contacts, setContacts] = useState<ContactResult[]>([])
  const [campaigns, setCampaigns] = useState<CampaignResult[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const router = useRouter()

  const total = tasks.length + subtasks.length + contacts.length + campaigns.length

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setTasks([]); setSubtasks([]); setContacts([]); setCampaigns([])
    setActiveIdx(0)
  }, [])

  // Cmd+K / Ctrl+K to open
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [close])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (query.length < 2) {
      setTasks([]); setSubtasks([]); setContacts([]); setCampaigns([])
      setLoading(false)
      return
    }
    setLoading(true)
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setTasks(data.tasks ?? [])
        setSubtasks(data.subtasks ?? [])
        setContacts(data.contacts ?? [])
        setCampaigns(data.campaigns ?? [])
        setActiveIdx(0)
      } finally {
        setLoading(false)
      }
    }, 220)
  }, [query])

  // Flat list of all results for keyboard nav
  const allResults: Array<{ type: string; item: TaskResult | SubtaskResult | ContactResult | CampaignResult }> = [
    ...tasks.map(t => ({ type: 'task', item: t })),
    ...subtasks.map(s => ({ type: 'subtask', item: s })),
    ...contacts.map(c => ({ type: 'contact', item: c })),
    ...campaigns.map(c => ({ type: 'campaign', item: c })),
  ]

  function navigate(type: string, item: TaskResult | SubtaskResult | ContactResult | CampaignResult) {
    close()
    if (type === 'task') {
      window.location.assign(`/projects?task=${(item as TaskResult).id}`)
    } else if (type === 'subtask') {
      window.location.assign(`/projects?task=${(item as SubtaskResult).task_id}`)
    } else if (type === 'contact') {
      window.location.assign(`/contacts?customer=${(item as ContactResult).shopify_id}`)
    } else if (type === 'campaign') {
      router.push(`/marketing?tab=Content&campaign=${(item as CampaignResult).klaviyo_id ?? ''}`)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, allResults.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && allResults[activeIdx]) {
      const { type, item } = allResults[activeIdx]
      navigate(type, item)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Search (⌘K)"
        className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-ink hover:bg-cream hover:text-ink-dark transition-all group"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-mushroom shrink-0 group-hover:bg-ink/40" />
        <Search className="w-4 h-4 shrink-0" strokeWidth={1.75} />
        <span className="text-sm font-medium flex-1 text-left" style={FONT}>Search</span>
        <span className="text-[10px] text-ink/30 font-mono">⌘K</span>
      </button>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh]"
      style={{ background: 'rgba(44,44,44,0.45)', backdropFilter: 'blur(3px)' }}
      onClick={e => { if (e.target === e.currentTarget) close() }}
    >
      <div
        className="w-[560px] bg-cream rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ border: '1px solid rgba(44,44,44,0.1)', maxHeight: '70vh' }}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-mushroom/60">
          <Search className="w-4 h-4 text-ink/40 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search tasks, recipes, contacts, campaigns…"
            className="flex-1 bg-transparent text-sm text-ink-dark outline-none placeholder:text-ink/30"
            style={FONT}
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-ink/30 hover:text-ink cursor-pointer transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="text-[10px] text-ink/25 font-mono ml-1">ESC</span>
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1">
          {loading && (
            <p className="text-xs text-ink/40 px-5 py-4" style={FONT}>Searching…</p>
          )}

          {!loading && query.length >= 2 && total === 0 && (
            <p className="text-xs text-ink/40 px-5 py-4" style={FONT}>No results for &ldquo;{query}&rdquo;</p>
          )}

          {!loading && query.length < 2 && (
            <p className="text-xs text-ink/30 px-5 py-4" style={FONT}>Type at least 2 characters to search</p>
          )}

          {tasks.length > 0 && (
            <Section label="Tasks" icon={<LayoutGrid className="w-3 h-3" />}>
              {tasks.map((t, i) => {
                const idx = i
                return (
                  <ResultRow
                    key={`task-${t.id}`}
                    active={allResults[activeIdx]?.item === t}
                    onClick={() => navigate('task', t)}
                    onHover={() => setActiveIdx(idx)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink-dark truncate" style={FONT}>{t.title}</p>
                      {t.project_name && (
                        <p className="text-[10px] text-ink/40 mt-0.5" style={FONT}>{t.project_name}</p>
                      )}
                    </div>
                    <StatusPill status={t.status} />
                  </ResultRow>
                )
              })}
            </Section>
          )}

          {subtasks.length > 0 && (
            <Section label="Subtasks" icon={<CheckSquare className="w-3 h-3" />}>
              {subtasks.map((s, i) => {
                const idx = tasks.length + i
                return (
                  <ResultRow
                    key={`sub-${s.id}`}
                    active={allResults[activeIdx]?.item === s}
                    onClick={() => navigate('subtask', s)}
                    onHover={() => setActiveIdx(idx)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink-dark truncate" style={FONT}>{s.title}</p>
                      <p className="text-[10px] text-ink/40 mt-0.5 truncate" style={FONT}>in {s.task_title}</p>
                    </div>
                    <StatusPill status={s.status} />
                  </ResultRow>
                )
              })}
            </Section>
          )}

          {contacts.length > 0 && (
            <Section label="Contacts" icon={<Users className="w-3 h-3" />}>
              {contacts.map((c, i) => {
                const idx = tasks.length + subtasks.length + i
                return (
                  <ResultRow
                    key={`contact-${c.id}`}
                    active={allResults[activeIdx]?.item === c}
                    onClick={() => navigate('contact', c)}
                    onHover={() => setActiveIdx(idx)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink-dark truncate" style={FONT}>{c.name}</p>
                      <p className="text-[10px] text-ink/40 mt-0.5" style={FONT}>{c.email}</p>
                    </div>
                    <span className="text-[10px] text-ink/40 shrink-0" style={FONT}>{c.orders_count} orders</span>
                  </ResultRow>
                )
              })}
            </Section>
          )}

          {campaigns.length > 0 && (
            <Section label="Campaigns" icon={<Mail className="w-3 h-3" />}>
              {campaigns.map((c, i) => {
                const idx = tasks.length + subtasks.length + contacts.length + i
                return (
                  <ResultRow
                    key={`campaign-${c.id}`}
                    active={allResults[activeIdx]?.item === c}
                    onClick={() => navigate('campaign', c)}
                    onHover={() => setActiveIdx(idx)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink-dark truncate" style={FONT}>{c.name}</p>
                      {c.send_time && (
                        <p className="text-[10px] text-ink/40 mt-0.5" style={FONT}>
                          {new Date(c.send_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                    <StatusPill status={c.status} />
                  </ResultRow>
                )
              })}
            </Section>
          )}

          {total > 0 && (
            <p className="text-[10px] text-ink/25 px-5 py-3 border-t border-mushroom/40" style={FONT}>
              ↑↓ navigate · Enter to open · Esc to close
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-5 pt-3 pb-1.5">
        <span className="text-ink/30">{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-ink/40" style={FONT}>{label}</span>
      </div>
      {children}
    </div>
  )
}

function ResultRow({ children, active, onClick, onHover }: {
  children: React.ReactNode; active: boolean
  onClick: () => void; onHover: () => void
}) {
  return (
    <button
      className={`w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors cursor-pointer ${active ? 'bg-oatmilk' : 'hover:bg-oatmilk/60'}`}
      onClick={onClick}
      onMouseEnter={onHover}
    >
      {children}
    </button>
  )
}
