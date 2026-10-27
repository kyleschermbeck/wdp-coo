'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  MessageCircle, LayoutDashboard, ClipboardList, FlaskConical,
  BookOpen, DollarSign, Package, Megaphone, Trophy, Mail, Users,
  Settings, Send, Paperclip, X, Loader2, RefreshCw,
  TrendingUp, TrendingDown, AlertTriangle, CheckSquare, Inbox, FolderOpen,
  AlertCircle, Flag, Zap, Activity, BarChart2, Calendar,
  Plus, Check, CircleDashed, Trash2, FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { marked } from 'marked'
import type { BriefData, BriefSection } from '@/app/api/morning-brief/route'
import type { Nudge } from '@/app/api/nudges/route'
import type { Recommendation } from '@/app/api/recommendations/route'

marked.setOptions({ breaks: true })

// ── Types ──────────────────────────────────────────────────────────────────────
interface Agent { id: number; name: string; description: string | null; active: number }

// Nudge icon map
const NUDGE_ICONS: Record<string, React.ElementType> = {
  AlertCircle, Package, Flag, Mail, Inbox, TrendingDown, Zap, CheckSquare, AlertTriangle,
}

const NUDGE_COLORS: Record<Nudge['type'], { bg: string; border: string; icon: string }> = {
  alert:      { bg: 'rgba(193,75,58,0.08)',   border: 'rgba(193,75,58,0.25)',  icon: '#C14B3A' },
  warning:    { bg: 'rgba(194,122,84,0.10)',  border: 'rgba(194,122,84,0.28)', icon: '#C27A54' },
  suggestion: { bg: 'rgba(215,255,16,0.07)',  border: 'rgba(215,255,16,0.22)', icon: '#8AA800' },
  info:       { bg: 'rgba(120,183,197,0.10)', border: 'rgba(120,183,197,0.28)', icon: '#4A7C8A' },
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  imagePreview?: string
}
interface ImageAttachment { data: string; mediaType: string; preview: string }

// ── Nav rail ───────────────────────────────────────────────────────────────────
const NAV = [
  { icon: MessageCircle,   label: 'Chat',        href: '/chat',       active: true },
  { icon: LayoutDashboard, label: 'Dashboard',   href: '/dashboard' },
  { icon: ClipboardList,   label: 'Projects',    href: '/projects' },
  { icon: FlaskConical,    label: 'Recipe Lab',  href: '/recipes' },
  { icon: BookOpen,        label: 'Knowledge',   href: '/knowledge' },
  { icon: DollarSign,      label: 'Financials',  href: '/financials' },
  { icon: Package,         label: 'Inventory',   href: '/inventory' },
  { icon: FileText,        label: 'Docs',        href: '/docs' },
  { icon: Megaphone,       label: 'Marketing',   href: '/marketing' },
  { icon: Trophy,          label: 'Competitive', href: '/competitive' },
  { icon: Users,           label: 'Contacts',    href: '/contacts' },
]

const STORAGE_KEY = (id: number) => `chat_history_agent_${id}`

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3)
}

// ── Brief section icon + color map ─────────────────────────────────────────────
const ICON_MAP: Record<BriefSection['icon'] | 'info' | 'meta', React.ElementType> = {
  revenue: TrendingUp,
  inventory: Package,
  task: CheckSquare,
  email: Inbox,
  campaign: Megaphone,
  project: FolderOpen,
  info: AlertCircle,
  meta: Megaphone,
}

const COLOR_MAP: Record<BriefSection['color'] | 'info', { bg: string; text: string; icon: string }> = {
  positive: { bg: 'rgba(128,230,166,0.18)', text: '#2A7A52', icon: '#2A7A52' },
  warning:  { bg: 'rgba(194,122,84,0.12)',  text: '#C27A54', icon: '#C27A54' },
  alert:    { bg: 'rgba(193,75,58,0.10)',   text: '#C14B3A', icon: '#C14B3A' },
  neutral:  { bg: 'rgba(120,183,197,0.15)', text: '#4A7C8A', icon: '#4A7C8A' },
  info:     { bg: 'rgba(180,180,180,0.12)', text: '#6B6B6B', icon: '#8A8A8A' },
}

// ── Parse COO notes markdown into icon-tagged cards ───────────────────────────
type BriefNoteCard = { icon: BriefSection['icon'] | 'info'; text: string; chip?: string }
function parseCooNotes(text: string): BriefNoteCard[] {
  const cards: BriefNoteCard[] = []
  const lines = text.split('\n')
  for (const raw of lines) {
    // Strip leading markdown list markers, bold labels, hashes
    const line = raw.replace(/^#+\s*/, '').replace(/^[-*•]\s*/, '').replace(/\*\*([^*]+)\*\*:?\s*/, '').trim()
    if (!line || line.length < 8) continue
    const lower = line.toLowerCase()
    const icon: BriefNoteCard['icon'] = lower.match(/task|complete|finish|deadline|due/) ? 'task'
      : lower.match(/inventory|stock|reorder|units|sku/) ? 'inventory'
      : lower.match(/email|klaviyo|campaign|subscriber|open rate|click/) ? 'email'
      : lower.match(/revenue|order|sale|gmv|\$|gross/) ? 'revenue'
      : lower.match(/market|content|post|instagram|launch|promo/) ? 'campaign'
      : lower.match(/project|milestone|phase|build/) ? 'project'
      : 'info'
    // Extract anything that looks like an action verb as a chip
    const chipMatch = line.match(/^(?:consider|should|need to|recommend|suggest)[^—–:]+[—–:](.+)$/i)
    const chip = chipMatch ? chipMatch[1].trim().slice(0, 60) : undefined
    cards.push({ icon, text: line, chip })
  }
  return cards
}

// ── Task Proposal Card ────────────────────────────────────────────────────────
interface TaskProposal {
  title: string
  project_id?: number
  project_name?: string
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  start_date?: string
  due_date?: string
  description?: string
  notes?: string
}

interface StatTile { label: string; value: string; sub?: string; color?: 'positive' | 'warning' | 'alert' | 'neutral' }

type ParsedSegment =
  | { type: 'text'; value: string }
  | { type: 'proposal'; value: TaskProposal }
  | { type: 'task-list'; value: TaskItem[] }
  | { type: 'stat-grid'; value: StatTile[] }

interface TaskItem {
  id: number
  title: string
  status: string
  priority: string
  start_date?: string
  due_date?: string
  project_name?: string
  notes?: string
  subtasks?: Array<{ id: number; title: string; status: string; completed: number }>
}

function parseTaskProposals(content: string): ParsedSegment[] {
  const regex = /```(task-proposal|task-list|stat-grid)\n([\s\S]*?)\n?```/g
  const segments: ParsedSegment[] = []
  let last = 0
  let match
  while ((match = regex.exec(content)) !== null) {
    if (match.index > last) segments.push({ type: 'text', value: content.slice(last, match.index) })
    try {
      if (match[1] === 'task-proposal') {
        segments.push({ type: 'proposal', value: JSON.parse(match[2]) })
      } else if (match[1] === 'stat-grid') {
        segments.push({ type: 'stat-grid', value: JSON.parse(match[2]) })
      } else {
        segments.push({ type: 'task-list', value: JSON.parse(match[2]) })
      }
    } catch { segments.push({ type: 'text', value: match[0] }) }
    last = match.index + match[0].length
  }
  if (last < content.length) segments.push({ type: 'text', value: content.slice(last) })
  return segments
}

// ── StatGrid — visual metric tile row ─────────────────────────────────────────
function StatGrid({ tiles }: { tiles: StatTile[] }) {
  const FONT = "'Jost', system-ui, sans-serif"
  const TILE_COLORS: Record<string, { bg: string; text: string; sub: string; border: string }> = {
    positive: { bg: 'rgba(128,230,166,0.12)', text: '#2A7A52', sub: '#3A9A62', border: 'rgba(128,230,166,0.30)' },
    warning:  { bg: 'rgba(194,122,84,0.10)',  text: '#C27A54', sub: '#A06040', border: 'rgba(194,122,84,0.28)' },
    alert:    { bg: 'rgba(193,75,58,0.09)',   text: '#C14B3A', sub: '#A03020', border: 'rgba(193,75,58,0.25)' },
    neutral:  { bg: 'rgba(120,183,197,0.10)', text: '#4A7C8A', sub: '#3A6070', border: 'rgba(120,183,197,0.25)' },
  }
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${Math.min(tiles.length, 3)}, 1fr)`,
      gap: 8,
      margin: '10px 0',
    }}>
      {tiles.map((tile, i) => {
        const c = TILE_COLORS[tile.color ?? 'neutral']
        return (
          <div key={i} style={{
            background: c.bg,
            border: `1px solid ${c.border}`,
            borderRadius: 10,
            padding: '11px 14px',
          }}>
            <div style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.sub, marginBottom: 5 }}>
              {tile.label}
            </div>
            <div style={{ fontFamily: FONT, fontSize: 20, fontWeight: 700, color: c.text, lineHeight: 1.1, marginBottom: 3 }}>
              {tile.value}
            </div>
            {tile.sub && (
              <div style={{ fontFamily: FONT, fontSize: 10, color: c.sub, lineHeight: 1.3 }}>
                {tile.sub}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const PRIORITY_COLORS: Record<string, { bg: string; text: string }> = {
  urgent: { bg: 'rgba(193,75,58,0.12)', text: '#C14B3A' },
  high:   { bg: 'rgba(194,122,84,0.12)', text: '#C27A54' },
  medium: { bg: 'rgba(215,255,16,0.10)', text: '#7A8A00' },
  low:    { bg: 'rgba(120,183,197,0.12)', text: '#4A7C8A' },
}

function TaskProposalCard({ proposal, onCreated }: { proposal: TaskProposal; onCreated: (taskId: number, title: string) => void }) {
  const FONT = "'Jost', system-ui, sans-serif"
  const [subtaskInput, setSubtaskInput] = useState('')
  const [subtasks, setSubtasks] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [done, setDone] = useState(false)
  const [createdTaskId, setCreatedTaskId] = useState<number | null>(null)
  const [addingSubtask, setAddingSubtask] = useState(false)

  const prio = proposal.priority ?? 'medium'
  const pc = PRIORITY_COLORS[prio] ?? PRIORITY_COLORS.medium

  async function handleCreate() {
    setCreating(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: proposal.title,
          project_id: proposal.project_id,
          priority: prio,
          start_date: proposal.start_date,
          due_date: proposal.due_date,
          description: proposal.description,
          notes: proposal.notes,
        }),
      })
      const data = await res.json() as { id: number }
      const taskId = data.id
      setCreatedTaskId(taskId)
      // create subtasks
      for (const st of subtasks) {
        await fetch('/api/tasks/subtasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task_id: taskId, title: st }),
        })
      }
      setDone(true)
      onCreated(taskId, proposal.title)
    } catch { /* silently handle */ }
    setCreating(false)
  }

  function addSubtask() {
    const t = subtaskInput.trim()
    if (t) { setSubtasks(prev => [...prev, t]); setSubtaskInput('') }
  }

  if (done) {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '8px 14px', borderRadius: 9,
        background: 'rgba(128,230,166,0.14)',
        border: '1px solid rgba(128,230,166,0.3)',
        fontFamily: FONT, fontSize: 13,
        color: '#2A7A52', marginTop: 8,
      }}>
        <Check size={14} strokeWidth={2.5} />
        Task created — <strong>#{createdTaskId} {proposal.title}</strong>
      </div>
    )
  }

  return (
    <div style={{
      borderTop: '1px solid var(--wdp-border)',
      borderRight: '1px solid var(--wdp-border)',
      borderBottom: '1px solid var(--wdp-border)',
      borderLeft: '3px solid var(--wdp-neon, #D7FF10)',
      borderRadius: 10,
      background: 'var(--wdp-surface)',
      padding: '14px 16px',
      marginTop: 10, fontFamily: FONT,
    }}>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <CircleDashed size={14} style={{ color: 'var(--wdp-ink-mid)', flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--wdp-ink)' }}>{proposal.title}</span>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
          padding: '2px 8px', borderRadius: 99,
          background: pc.bg, color: pc.text, flexShrink: 0,
        }}>{prio}</span>
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--wdp-ink-mid)', marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {proposal.project_name && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10 }}>📁</span>
            <span style={{ fontWeight: 500, color: 'var(--wdp-ink)' }}>{proposal.project_name}</span>
          </span>
        )}
        {(proposal.start_date || proposal.due_date) && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Calendar size={11} />
            {proposal.start_date ? new Date(proposal.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
            {proposal.start_date && proposal.due_date ? ' → ' : ''}
            {proposal.due_date ? new Date(proposal.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
          </span>
        )}
        {proposal.description && <span style={{ color: 'var(--wdp-ink-mid)', lineHeight: 1.5 }}>{proposal.description}</span>}
      </div>

      {/* Subtasks */}
      {subtasks.length > 0 && (
        <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {subtasks.map((st, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 12, color: 'var(--wdp-ink)',
              padding: '4px 0',
            }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, border: '1.5px solid var(--wdp-border)', flexShrink: 0 }} />
              {st}
              <button onClick={() => setSubtasks(prev => prev.filter((_, j) => j !== i))}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--wdp-ink-mid)', padding: 0 }}>
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add subtask input */}
      {addingSubtask ? (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input
            autoFocus
            value={subtaskInput}
            onChange={e => setSubtaskInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addSubtask(); if (e.key === 'Escape') setAddingSubtask(false) }}
            placeholder="Subtask title…"
            style={{
              flex: 1, border: '1px solid var(--wdp-border)', borderRadius: 6,
              padding: '5px 10px', fontSize: 12, background: 'var(--wdp-ground)',
              color: 'var(--wdp-ink)', outline: 'none', fontFamily: FONT,
            }}
          />
          <button onClick={addSubtask} style={{
            padding: '5px 10px', borderRadius: 6, fontSize: 12, fontFamily: FONT,
            background: 'var(--wdp-surface)', border: '1px solid var(--wdp-border)',
            cursor: 'pointer', color: 'var(--wdp-ink)',
          }}>Add</button>
        </div>
      ) : (
        <button onClick={() => setAddingSubtask(true)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 12, color: 'var(--wdp-ink-mid)', background: 'none', border: 'none',
          cursor: 'pointer', padding: '2px 0', marginBottom: 12, fontFamily: FONT,
        }}>
          <Plus size={11} /> Add subtask
        </button>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          onClick={handleCreate}
          disabled={creating}
          style={{
            padding: '7px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600,
            background: 'var(--wdp-neon, #D7FF10)', color: '#111110',
            border: 'none', cursor: creating ? 'default' : 'pointer',
            fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 6,
            opacity: creating ? 0.7 : 1,
          }}
        >
          {creating ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} strokeWidth={2.5} />}
          {creating ? 'Creating…' : 'Create Task'}
        </button>
      </div>
    </div>
  )
}

// ── Task List Cards ────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', review: 'Review', done: 'Done' }
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  todo:        { bg: 'rgba(180,180,180,0.12)', text: '#888' },
  in_progress: { bg: 'rgba(120,183,197,0.15)', text: '#4A7C8A' },
  review:      { bg: 'rgba(194,122,84,0.12)',  text: '#C27A54' },
  done:        { bg: 'rgba(128,230,166,0.18)', text: '#2A7A52' },
}

interface TaskItemCardProps { task: TaskItem; onUpdated: (id: number, patch: Record<string, string>) => void; onDeleted: (id: number) => void }
function TaskItemCard({ task, onUpdated, onDeleted }: TaskItemCardProps) {
  const FONT = "'Jost', system-ui, sans-serif"
  const [expanded, setExpanded] = useState(false)
  const [status, setStatus] = useState(task.status)
  const [priority, setPriority] = useState(task.priority)
  const [startDate, setStartDate] = useState(task.start_date ?? '')
  const [dueDate, setDueDate] = useState(task.due_date ?? '')
  const [notes, setNotes] = useState(task.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' })
    onDeleted(task.id)
  }

  const isOverdue = task.due_date && task.status !== 'done' && new Date(task.due_date + 'T23:59:59') < new Date()
  const pc = PRIORITY_COLORS[priority] ?? PRIORITY_COLORS.medium
  const sc = STATUS_COLORS[status] ?? STATUS_COLORS.todo

  async function save() {
    setSaving(true)
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, priority, start_date: startDate || null, due_date: dueDate || null, notes: notes || null }),
    })
    setSaving(false)
    setSaved(true)
    onUpdated(task.id, { status, priority, start_date: startDate, due_date: dueDate, notes })
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div style={{
      borderTop: '1px solid var(--wdp-border)',
      borderRight: '1px solid var(--wdp-border)',
      borderBottom: '1px solid var(--wdp-border)',
      borderLeft: isOverdue ? '3px solid #C14B3A' : status === 'done' ? '3px solid #2A7A52' : '1px solid var(--wdp-border)',
      borderRadius: 9, background: 'var(--wdp-surface)',
      overflow: 'hidden', fontFamily: FONT,
    }}>
      {/* Summary row — always visible, clickable to expand */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 13px', cursor: 'pointer' }}
      >
        {/* Status dot */}
        <div style={{
          width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
          background: sc.bg, border: `1.5px solid ${sc.text}`,
        }} />

        {/* Title */}
        <span style={{
          flex: 1, fontSize: 13, fontWeight: 600,
          color: status === 'done' ? 'var(--wdp-ink-mid)' : 'var(--wdp-ink)',
          textDecoration: status === 'done' ? 'line-through' : 'none',
        }}>{task.title}</span>

        {/* Priority */}
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
          padding: '2px 7px', borderRadius: 99, background: pc.bg, color: pc.text, flexShrink: 0,
        }}>{priority}</span>

        {/* Date range */}
        {(task.start_date || task.due_date) && (
          <span style={{ fontSize: 11, color: isOverdue ? '#C14B3A' : 'var(--wdp-ink-mid)', flexShrink: 0, whiteSpace: 'nowrap' }}>
            {isOverdue ? '⚠ ' : ''}
            {task.start_date ? new Date(task.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
            {task.start_date && task.due_date ? ' → ' : ''}
            {task.due_date ? new Date(task.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
          </span>
        )}

        {/* Expand chevron */}
        <span style={{ fontSize: 10, color: 'var(--wdp-ink-mid)', flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Expanded edit panel */}
      {expanded && (
        <div style={{ padding: '0 13px 13px', borderTop: '1px solid var(--wdp-border)' }}>
          {/* Subtasks */}
          {task.subtasks && task.subtasks.length > 0 && (
            <div style={{ padding: '9px 0 9px', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {task.subtasks.map(st => (
                <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: st.completed ? 'var(--wdp-ink-mid)' : 'var(--wdp-ink)' }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, border: '1.5px solid var(--wdp-border)', flexShrink: 0,
                    background: st.completed ? 'rgba(128,230,166,0.25)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {st.completed ? <Check size={8} strokeWidth={3} style={{ color: '#2A7A52' }} /> : null}
                  </div>
                  <span style={{ textDecoration: st.completed ? 'line-through' : 'none' }}>{st.title}</span>
                </div>
              ))}
            </div>
          )}

          {/* Edit fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: task.subtasks?.length ? 0 : 10 }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)', marginBottom: 4 }}>Status</div>
              <select value={status} onChange={e => setStatus(e.target.value)} style={{
                width: '100%', padding: '5px 8px', borderRadius: 6, fontSize: 12,
                border: '1px solid var(--wdp-border)', background: 'var(--wdp-ground)',
                color: 'var(--wdp-ink)', fontFamily: FONT,
              }}>
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="review">Review</option>
                <option value="done">Done</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)', marginBottom: 4 }}>Priority</div>
              <select value={priority} onChange={e => setPriority(e.target.value)} style={{
                width: '100%', padding: '5px 8px', borderRadius: 6, fontSize: 12,
                border: '1px solid var(--wdp-border)', background: 'var(--wdp-ground)',
                color: 'var(--wdp-ink)', fontFamily: FONT,
              }}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)', marginBottom: 4 }}>Start Date</div>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{
                width: '100%', padding: '5px 8px', borderRadius: 6, fontSize: 12, boxSizing: 'border-box',
                border: '1px solid var(--wdp-border)', background: 'var(--wdp-ground)',
                color: 'var(--wdp-ink)', fontFamily: FONT,
              }} />
            </div>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)', marginBottom: 4 }}>Due Date</div>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{
                width: '100%', padding: '5px 8px', borderRadius: 6, fontSize: 12, boxSizing: 'border-box',
                border: '1px solid var(--wdp-border)', background: 'var(--wdp-ground)',
                color: 'var(--wdp-ink)', fontFamily: FONT,
              }} />
            </div>
          </div>

          {task.project_name && (
            <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--wdp-ink-mid)' }}>📁 {task.project_name}</div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <button
              onClick={save}
              disabled={saving}
              style={{
                padding: '6px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                background: saved ? 'rgba(128,230,166,0.2)' : 'var(--wdp-neon, #D7FF10)',
                color: saved ? '#2A7A52' : '#111110',
                border: 'none', cursor: saving ? 'default' : 'pointer', fontFamily: FONT,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : saved ? <Check size={11} strokeWidth={3} /> : null}
              {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
            </button>

            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                title="Delete task"
                style={{
                  padding: '6px 10px', borderRadius: 7, fontSize: 12, fontFamily: FONT,
                  background: 'transparent', border: '1px solid var(--wdp-border)',
                  cursor: 'pointer', color: 'var(--wdp-ink-mid)',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                <Trash2 size={11} /> Delete
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--wdp-ink-mid)', fontFamily: FONT }}>Sure?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    padding: '5px 10px', borderRadius: 7, fontSize: 12, fontFamily: FONT,
                    background: '#C14B3A', border: 'none', cursor: 'pointer', color: '#fff',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  {deleting ? <Loader2 size={10} className="animate-spin" /> : null}
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </button>
                <button onClick={() => setConfirmDelete(false)} style={{
                  padding: '5px 8px', borderRadius: 7, fontSize: 12, fontFamily: FONT,
                  background: 'transparent', border: '1px solid var(--wdp-border)', cursor: 'pointer', color: 'var(--wdp-ink-mid)',
                }}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TaskListCards({ tasks }: { tasks: TaskItem[] }) {
  const [items, setItems] = useState(tasks)
  function handleUpdated(id: number, patch: Record<string, string>) {
    setItems(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
  }
  function handleDeleted(id: number) {
    setItems(prev => prev.filter(t => t.id !== id))
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
      {items.map(t => <TaskItemCard key={t.id} task={t} onUpdated={handleUpdated} onDeleted={handleDeleted} />)}
    </div>
  )
}

// ── Sparkline mini chart ───────────────────────────────────────────────────────
// ── Campaign expandable row (used inside MetaAdsCard) ─────────────────────────
function CampaignRow({ c, font }: { c: MetaCampaign; font: string }) {
  const [expanded, setExpanded] = useState(false)
  const [insight, setInsight] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const effectiveStatus = c.effective_status ?? c.status
  const isActive = effectiveStatus === 'ACTIVE'
  const isCompleted = effectiveStatus === 'COMPLETED'
  const statusLabel = effectiveStatus === 'ACTIVE' ? 'Active'
    : effectiveStatus === 'COMPLETED' ? 'Completed'
    : effectiveStatus === 'PAUSED' ? 'Paused'
    : effectiveStatus?.toLowerCase().replace(/_/g, ' ') ?? 'Unknown'

  const avgCPC = c.cpc ?? (c.clicks > 0 ? c.spend / c.clicks : null)
  const avgCPM = c.cpm ?? (c.impressions > 0 ? (c.spend / c.impressions) * 1000 : null)

  async function loadInsight() {
    setLoading(true)
    try {
      const res = await fetch('/api/meta-ads/insights/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign: c }),
      })
      const d = await res.json() as { insights?: string; error?: string }
      setInsight(d.insights ?? d.error ?? 'No insight available')
    } catch {
      setInsight('Failed to load insight.')
    }
    setLoading(false)
  }

  return (
    <div style={{ borderRadius: 8, overflow: 'hidden', background: 'var(--wdp-surface)' }}>
      {/* Row header — always visible */}
      <button
        onClick={(e) => { e.stopPropagation(); setExpanded(v => !v) }}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 8px', background: 'transparent', border: 'none',
          cursor: 'pointer', textAlign: 'left' as const,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: font, fontSize: 11.5, fontWeight: 600, color: 'var(--wdp-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {c.name}
          </div>
          {c.ctr != null && (
            <div style={{ fontFamily: font, fontSize: 9.5, color: 'var(--wdp-ink-mid)', marginTop: 1 }}>
              {c.ctr.toFixed(2)}% CTR
            </div>
          )}
        </div>
        <div style={{ fontFamily: font, fontSize: 12, fontWeight: 700, color: 'var(--wdp-ink)', flexShrink: 0 }}>
          ${c.spend.toFixed(2)}
        </div>
        <div style={{
          padding: '2px 7px', borderRadius: 20,
          fontFamily: font, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const,
          background: isActive ? 'rgba(215,255,16,0.18)' : isCompleted ? 'rgba(120,183,197,0.15)' : 'rgba(150,150,150,0.12)',
          color: isActive ? '#8AA800' : isCompleted ? '#4A7C8A' : 'var(--wdp-ink-mid)',
          flexShrink: 0,
        }}>
          {statusLabel}
        </div>
        <span style={{ fontFamily: font, fontSize: 10, color: 'var(--wdp-ink-mid)', flexShrink: 0 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {/* Expanded detail panel */}
      {expanded && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            padding: '8px 10px 10px',
            borderTop: '1px solid var(--wdp-border)',
          }}
        >
          {/* Stat chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 5, marginBottom: 10 }}>
            {[
              { label: 'Spend',       value: `$${c.spend.toFixed(2)}` },
              { label: 'Impressions', value: c.impressions >= 1000 ? `${(c.impressions/1000).toFixed(1)}k` : String(c.impressions) },
              { label: 'Clicks',      value: String(c.clicks) },
              { label: 'CTR',         value: c.ctr != null ? `${c.ctr.toFixed(2)}%` : '—' },
              { label: 'CPC',         value: avgCPC != null ? `$${avgCPC.toFixed(2)}` : '—' },
              { label: 'CPM',         value: avgCPM != null ? `$${avgCPM.toFixed(2)}` : '—' },
            ].map(s => (
              <div key={s.label} style={{
                padding: '3px 8px', borderRadius: 6,
                background: 'var(--wdp-ground)',
                border: '1px solid var(--wdp-border)',
              }}>
                <span style={{ fontFamily: font, fontSize: 8.5, color: 'var(--wdp-ink-mid)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{s.label} </span>
                <span style={{ fontFamily: font, fontSize: 11, fontWeight: 700, color: 'var(--wdp-ink)' }}>{s.value}</span>
              </div>
            ))}
            {c.stop_time && (
              <div style={{ padding: '3px 8px', borderRadius: 6, background: 'var(--wdp-ground)', border: '1px solid var(--wdp-border)' }}>
                <span style={{ fontFamily: font, fontSize: 8.5, color: 'var(--wdp-ink-mid)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Ended </span>
                <span style={{ fontFamily: font, fontSize: 11, fontWeight: 700, color: 'var(--wdp-ink)' }}>
                  {new Date(c.stop_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            )}
          </div>

          {/* AI insight */}
          {!insight && !loading && (
            <button
              onClick={loadInsight}
              style={{
                width: '100%', padding: '6px 10px', borderRadius: 7,
                background: 'var(--wdp-neon, #D7FF10)', color: '#000',
                border: 'none', fontFamily: font, fontSize: 11, fontWeight: 700,
                cursor: 'pointer', letterSpacing: '-0.1px',
              }}
            >
              ✦ Get AI insights
            </button>
          )}
          {loading && (
            <div style={{ fontFamily: font, fontSize: 11, color: 'var(--wdp-ink-mid)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Loader2 size={11} className="animate-spin" /> Generating insight…
            </div>
          )}
          {insight && (
            <div style={{
              fontFamily: font, fontSize: 11.5, lineHeight: 1.6,
              color: 'var(--wdp-ink)', marginTop: 2,
              padding: '8px 10px', borderRadius: 7,
              background: 'var(--wdp-ground)',
              border: '1px solid var(--wdp-border)',
            }}>
              {insight}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CampaignList({ campaigns, font }: { campaigns: MetaCampaign[]; font: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {campaigns.map(c => <CampaignRow key={c.id} c={c} font={font} />)}
    </div>
  )
}

// ── Meta Ads Card (rich tile in Today's Snapshot) ──────────────────────────────
interface MetaCampaign {
  id: string; name: string; status: string; effective_status?: string
  spend: number; impressions: number; clicks: number
  cpc: number | null; cpm: number | null; ctr: number | null
  stop_time?: string | null
}

function MetaAdsCard({
  section, campaigns, accountName, onSend,
}: {
  section: { label: string; value: string; meta?: string }
  campaigns: MetaCampaign[]
  accountName: string | null
  onSend: (prompt: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  const FONT = "'Jost', system-ui, sans-serif"

  const totalSpend      = campaigns.reduce((s, c) => s + (c.spend ?? 0), 0)
  const totalClicks     = campaigns.reduce((s, c) => s + (c.clicks ?? 0), 0)
  const totalImpressions = campaigns.reduce((s, c) => s + (c.impressions ?? 0), 0)
  const avgCPC = totalClicks > 0 ? totalSpend / totalClicks : null
  const avgCPM = totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : null
  // Use effective_status (true delivery state) if available, fall back to status
  const activeCount = campaigns.filter(c => (c.effective_status ?? c.status) === 'ACTIVE').length

  const prompt = 'Show me our Meta Ads performance — campaigns, spend, and what\'s working.'

  const KpiCell = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div style={{
      background: 'var(--wdp-ground)',
      borderRadius: 8,
      padding: '8px 10px',
    }}>
      <div style={{ fontFamily: FONT, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, color: 'var(--wdp-ink)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: FONT, fontSize: 9.5, color: 'var(--wdp-ink-mid)', marginTop: 3 }}>{sub}</div>}
    </div>
  )

  return (
    <div
      onClick={() => onSend(prompt)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'var(--wdp-surface)' : 'var(--wdp-ground)',
        borderTop: hovered ? '1px solid var(--wdp-neon, #D7FF10)' : '1px solid var(--wdp-border)',
        borderRight: hovered ? '1px solid var(--wdp-neon, #D7FF10)' : '1px solid var(--wdp-border)',
        borderBottom: hovered ? '1px solid var(--wdp-neon, #D7FF10)' : '1px solid var(--wdp-border)',
        borderLeft: '3px solid #1877F2',
        borderRadius: 10,
        padding: '12px 13px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 18, height: 18, borderRadius: 4,
              background: '#1877F2',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg viewBox="0 0 24 24" width={10} height={10} fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            </div>
            <span style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)' }}>
              Meta Ads · {activeCount} active campaign{activeCount !== 1 ? 's' : ''}
            </span>
          </div>
          {accountName && (
            <div style={{ fontFamily: FONT, fontSize: 9.5, color: 'var(--wdp-ink-mid)', marginTop: 2, paddingLeft: 24 }}>
              Account · {accountName}
            </div>
          )}
        </div>
        {hovered && <span style={{ fontSize: 10, color: 'var(--wdp-neon, #D7FF10)', fontWeight: 700, fontFamily: FONT }}>→</span>}
      </div>

      {/* 2×2 KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10, background: 'var(--wdp-surface)', borderRadius: 8, padding: 6 }}>
        <KpiCell label="30D Spend" value={`$${totalSpend.toFixed(2)}`} />
        <KpiCell label="ROAS" value="—" sub="Not tracked" />
        <KpiCell
          label="Clicks"
          value={totalClicks.toLocaleString()}
          sub={avgCPC != null ? `$${avgCPC.toFixed(2)} CPC` : undefined}
        />
        <KpiCell
          label="Impressions"
          value={totalImpressions >= 1000 ? `${(totalImpressions / 1000).toFixed(1)}k` : totalImpressions.toString()}
          sub={avgCPM != null ? `$${avgCPM.toFixed(2)} CPM` : undefined}
        />
      </div>

      {/* Campaign list — click to expand with AI insights */}
      <CampaignList campaigns={campaigns} font={FONT} />

      {hovered && (
        <div style={{
          marginTop: 8, paddingTop: 7, borderTop: '1px solid var(--wdp-border)',
          fontFamily: FONT, fontSize: 10, color: 'var(--wdp-ink-mid)',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <MessageCircle size={9} /> Ask Rose Mary about Meta performance
        </div>
      )}
    </div>
  )
}

// ── Klaviyo types + expandable rows ───────────────────────────────────────────
interface KlaviyoCampaign {
  klaviyo_id: string; name: string; status: string; subject?: string | null
  send_time?: string | null; recipients?: number | null; opens?: number | null
  clicks?: number | null; open_rate?: number | null; click_rate?: number | null
  revenue?: number | null; unsubscribes?: number | null
}
interface KlaviyoFlow {
  klaviyo_id: string; name: string; status: string
  trigger_type?: string | null; updated?: string | null
}

function KlaviyoCampaignRow({ c, font }: { c: KlaviyoCampaign; font: string }) {
  const [expanded, setExpanded] = useState(false)
  const [insight, setInsight] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isLive = c.status === 'Sent'
  const isDraft = c.status === 'Draft'
  const openRatePct = c.open_rate != null ? c.open_rate.toFixed(1) + '%' : '—'
  const clickRatePct = c.click_rate != null ? c.click_rate.toFixed(1) + '%' : '—'

  async function loadInsight() {
    setLoading(true)
    try {
      const res = await fetch('/api/klaviyo/insights/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign: c }),
      })
      const d = await res.json() as { insights?: string; error?: string }
      setInsight(d.insights ?? d.error ?? 'No insight available')
    } catch { setInsight('Failed to load insight.') }
    setLoading(false)
  }

  return (
    <div style={{ borderRadius: 8, overflow: 'hidden', background: 'var(--wdp-surface)' }}>
      <button
        onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' as const }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: font, fontSize: 11, fontWeight: 600, color: 'var(--wdp-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {c.name}
          </div>
          {c.send_time && (
            <div style={{ fontFamily: font, fontSize: 9, color: 'var(--wdp-ink-mid)', marginTop: 1 }}>
              {new Date(c.send_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          )}
        </div>
        <div style={{
          padding: '2px 7px', borderRadius: 20,
          fontFamily: font, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const,
          background: isLive ? 'rgba(215,255,16,0.15)' : isDraft ? 'rgba(150,150,150,0.1)' : 'rgba(74,124,138,0.15)',
          color: isLive ? '#8AA800' : isDraft ? 'var(--wdp-ink-mid)' : '#4A7C8A',
          flexShrink: 0,
        }}>
          {c.status}
        </div>
        <span style={{ fontFamily: font, fontSize: 10, color: 'var(--wdp-ink-mid)', flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div onClick={e => e.stopPropagation()} style={{ padding: '8px 10px 10px', borderTop: '1px solid var(--wdp-border)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 5, marginBottom: 10 }}>
            {[
              { label: 'Opens',   value: openRatePct },
              { label: 'Clicks',  value: clickRatePct },
              { label: 'Recipients', value: c.recipients?.toLocaleString() ?? '—' },
              ...(c.revenue && c.revenue > 0 ? [{ label: 'Revenue', value: `$${c.revenue.toFixed(0)}` }] : []),
            ].map(s => (
              <div key={s.label} style={{ padding: '3px 8px', borderRadius: 6, background: 'var(--wdp-ground)', border: '1px solid var(--wdp-border)' }}>
                <span style={{ fontFamily: font, fontSize: 8.5, color: 'var(--wdp-ink-mid)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{s.label} </span>
                <span style={{ fontFamily: font, fontSize: 11, fontWeight: 700, color: 'var(--wdp-ink)' }}>{s.value}</span>
              </div>
            ))}
          </div>
          {!insight && !loading && (
            <button onClick={loadInsight} style={{ width: '100%', padding: '6px 10px', borderRadius: 7, background: 'var(--wdp-neon, #D7FF10)', color: '#000', border: 'none', fontFamily: font, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              ✦ Get AI insights
            </button>
          )}
          {loading && <div style={{ fontFamily: font, fontSize: 11, color: 'var(--wdp-ink-mid)', display: 'flex', alignItems: 'center', gap: 5 }}><Loader2 size={11} className="animate-spin" /> Generating insight…</div>}
          {insight && <div style={{ fontFamily: font, fontSize: 11.5, lineHeight: 1.6, color: 'var(--wdp-ink)', padding: '8px 10px', borderRadius: 7, background: 'var(--wdp-ground)', border: '1px solid var(--wdp-border)' }}>{insight}</div>}
        </div>
      )}
    </div>
  )
}

function KlaviyoFlowRow({ f, font }: { f: KlaviyoFlow; font: string }) {
  const [expanded, setExpanded] = useState(false)
  const [insight, setInsight] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isLive = f.status === 'live'

  async function loadInsight() {
    setLoading(true)
    try {
      const res = await fetch('/api/klaviyo/insights/flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flow: f }),
      })
      const d = await res.json() as { insights?: string; error?: string }
      setInsight(d.insights ?? d.error ?? 'No insight available')
    } catch { setInsight('Failed to load insight.') }
    setLoading(false)
  }

  return (
    <div style={{ borderRadius: 8, overflow: 'hidden', background: 'var(--wdp-surface)' }}>
      <button
        onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' as const }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: font, fontSize: 11, fontWeight: 600, color: 'var(--wdp-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {f.name}
          </div>
          {f.trigger_type && (
            <div style={{ fontFamily: font, fontSize: 9, color: 'var(--wdp-ink-mid)', marginTop: 1 }}>
              Trigger: {f.trigger_type}
            </div>
          )}
        </div>
        <div style={{
          padding: '2px 7px', borderRadius: 20,
          fontFamily: font, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const,
          background: isLive ? 'rgba(215,255,16,0.15)' : 'rgba(150,150,150,0.1)',
          color: isLive ? '#8AA800' : 'var(--wdp-ink-mid)',
          flexShrink: 0,
        }}>
          {f.status}
        </div>
        <span style={{ fontFamily: font, fontSize: 10, color: 'var(--wdp-ink-mid)', flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div onClick={e => e.stopPropagation()} style={{ padding: '8px 10px 10px', borderTop: '1px solid var(--wdp-border)' }}>
          {f.updated && (
            <div style={{ fontFamily: font, fontSize: 9.5, color: 'var(--wdp-ink-mid)', marginBottom: 8 }}>
              Last updated: {new Date(f.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          )}
          {!insight && !loading && (
            <button onClick={loadInsight} style={{ width: '100%', padding: '6px 10px', borderRadius: 7, background: 'var(--wdp-neon, #D7FF10)', color: '#000', border: 'none', fontFamily: font, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              ✦ Get AI insights
            </button>
          )}
          {loading && <div style={{ fontFamily: font, fontSize: 11, color: 'var(--wdp-ink-mid)', display: 'flex', alignItems: 'center', gap: 5 }}><Loader2 size={11} className="animate-spin" /> Generating insight…</div>}
          {insight && <div style={{ fontFamily: font, fontSize: 11.5, lineHeight: 1.6, color: 'var(--wdp-ink)', padding: '8px 10px', borderRadius: 7, background: 'var(--wdp-ground)', border: '1px solid var(--wdp-border)' }}>{insight}</div>}
        </div>
      )}
    </div>
  )
}

// ── Klaviyo Card ───────────────────────────────────────────────────────────────
interface KlaviyoData {
  campaigns: KlaviyoCampaign[]
  flows: KlaviyoFlow[]
  lists: Array<{ klaviyo_id: string; name: string; profile_count: number }>
}

function KlaviyoCard({ data, onSend }: { data: KlaviyoData; onSend: (p: string) => void }) {
  const [hovered, setHovered] = useState(false)
  const [tab, setTab] = useState<'campaigns' | 'flows'>('campaigns')
  const FONT = "'Jost', system-ui, sans-serif"

  const totalSubscribers = data.lists.reduce((s, l) => s + l.profile_count, 0)
  const sentCampaigns = data.campaigns.filter(c => c.status === 'Sent')
  const liveCampaigns = data.campaigns.filter(c => c.status !== 'Draft')
  const liveFlows = data.flows.filter(f => f.status === 'live')

  const prompt = 'How is our email marketing performing? Break down our Klaviyo campaigns and flows.'

  // Klaviyo pink/purple brand color
  const KCOLOR = '#9B59B6'

  return (
    <div
      onClick={() => onSend(prompt)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'var(--wdp-surface)' : 'var(--wdp-ground)',
        borderTop: hovered ? '1px solid var(--wdp-neon, #D7FF10)' : '1px solid var(--wdp-border)',
        borderRight: hovered ? '1px solid var(--wdp-neon, #D7FF10)' : '1px solid var(--wdp-border)',
        borderBottom: hovered ? '1px solid var(--wdp-neon, #D7FF10)' : '1px solid var(--wdp-border)',
        borderLeft: `3px solid ${KCOLOR}`,
        borderRadius: 10,
        padding: '12px 13px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 18, height: 18, borderRadius: 4, background: KCOLOR, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg viewBox="0 0 24 24" width={10} height={10} fill="white"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
          </div>
          <span style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)' }}>
            Email · {totalSubscribers.toLocaleString()} subscribers
          </span>
        </div>
        {hovered && <span style={{ fontSize: 10, color: 'var(--wdp-neon, #D7FF10)', fontWeight: 700, fontFamily: FONT }}>→</span>}
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, marginBottom: 10, background: 'var(--wdp-surface)', borderRadius: 8, padding: 6 }}>
        {[
          { label: 'Lists', value: data.lists.length.toString() },
          { label: 'Campaigns', value: sentCampaigns.length.toString(), sub: `${liveCampaigns.length} live` },
          { label: 'Flows', value: data.flows.length.toString(), sub: `${liveFlows.length} live` },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--wdp-ground)', borderRadius: 8, padding: '7px 9px' }}>
            <div style={{ fontFamily: FONT, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)', marginBottom: 3 }}>{k.label}</div>
            <div style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, color: 'var(--wdp-ink)', lineHeight: 1 }}>{k.value}</div>
            {k.sub && <div style={{ fontFamily: FONT, fontSize: 9, color: 'var(--wdp-ink-mid)', marginTop: 2 }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {(['campaigns', 'flows'] as const).map(t => (
          <button
            key={t}
            onClick={e => { e.stopPropagation(); setTab(t) }}
            style={{
              padding: '3px 9px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontFamily: FONT, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'capitalize',
              background: tab === t ? KCOLOR : 'var(--wdp-surface)',
              color: tab === t ? '#fff' : 'var(--wdp-ink-mid)',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* List */}
      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {tab === 'campaigns'
          ? data.campaigns.slice(0, 5).map(c => <KlaviyoCampaignRow key={c.klaviyo_id} c={c} font={FONT} />)
          : data.flows.slice(0, 6).map(f => <KlaviyoFlowRow key={f.klaviyo_id} f={f} font={FONT} />)
        }
      </div>

      {hovered && (
        <div style={{ marginTop: 8, paddingTop: 7, borderTop: '1px solid var(--wdp-border)', fontFamily: FONT, fontSize: 10, color: 'var(--wdp-ink-mid)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <MessageCircle size={9} /> Ask Rose Mary about email performance
        </div>
      )}
    </div>
  )
}

// ── Google Analytics summary card ──────────────────────────────────────────────
interface GAData {
  summary: {
    sessions: number; newUsers: number; pageViews: number
    bounceRate: number; avgSessionDurationFmt: string
  }
  sources: Array<{ channel: string; sessions: number; pct: number }>
  pages: Array<{ path: string; title: string; views: number; avgDurationFmt?: string }>
}

function GASummaryCard({ data, onSend }: { data: GAData; onSend: (p: string) => void }) {
  const [hovered, setHovered] = useState(false)
  const FONT = "'Jost', system-ui, sans-serif"
  const GA_COLOR = '#E37400'  // GA4 orange

  const topChannel = data.sources[0]?.channel ?? '—'
  const topChannelPct = data.sources[0]?.pct ?? 0
  const topPage = data.pages[0]
  const topPageTitle = topPage?.title
    ? (topPage.title.split('|')[0] ?? topPage.title).trim().replace(/\s*[–—-]\s*Weeknight.*$/i, '').trim()
    : topPage?.path ?? '—'

  const prompt = 'What does my website traffic look like? Break down sessions, sources, and top pages from Google Analytics.'

  return (
    <div
      onClick={() => onSend(prompt)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'var(--wdp-surface)' : 'var(--wdp-ground)',
        borderTop: hovered ? '1px solid var(--wdp-neon, #D7FF10)' : '1px solid var(--wdp-border)',
        borderRight: hovered ? '1px solid var(--wdp-neon, #D7FF10)' : '1px solid var(--wdp-border)',
        borderBottom: hovered ? '1px solid var(--wdp-neon, #D7FF10)' : '1px solid var(--wdp-border)',
        borderLeft: `3px solid ${GA_COLOR}`,
        borderRadius: 10,
        padding: '12px 13px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 18, height: 18, borderRadius: 4, background: GA_COLOR, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg viewBox="0 0 24 24" width={10} height={10} fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
          </div>
          <span style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)' }}>
            Website · Last 7 days
          </span>
        </div>
        {hovered && <span style={{ fontSize: 10, color: 'var(--wdp-neon, #D7FF10)', fontWeight: 700, fontFamily: FONT }}>→</span>}
      </div>

      {/* 2×2 KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 10, background: 'var(--wdp-surface)', borderRadius: 8, padding: 6 }}>
        {[
          { label: 'Sessions',   value: data.summary.sessions.toLocaleString(), sub: `${data.summary.newUsers.toLocaleString()} new users` },
          { label: 'Page Views', value: data.summary.pageViews.toLocaleString() },
          { label: 'Bounce Rate', value: `${data.summary.bounceRate.toFixed(0)}%` },
          { label: 'Avg Session', value: data.summary.avgSessionDurationFmt },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--wdp-ground)', borderRadius: 8, padding: '7px 9px' }}>
            <div style={{ fontFamily: FONT, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)', marginBottom: 3 }}>{k.label}</div>
            <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: 'var(--wdp-ink)', lineHeight: 1 }}>{k.value}</div>
            {k.sub && <div style={{ fontFamily: FONT, fontSize: 9, color: 'var(--wdp-ink-mid)', marginTop: 2 }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* Top channel + top page */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 7, background: 'var(--wdp-surface)' }}>
          <div style={{ width: 4, height: 4, borderRadius: '50%', background: GA_COLOR, flexShrink: 0 }} />
          <span style={{ fontFamily: FONT, fontSize: 9.5, color: 'var(--wdp-ink-mid)' }}>Top channel</span>
          <span style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 700, color: 'var(--wdp-ink)', marginLeft: 'auto' }}>
            {topChannel} · {topChannelPct}%
          </span>
        </div>
        {topPage && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 7, background: 'var(--wdp-surface)' }}>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: GA_COLOR, flexShrink: 0 }} />
            <span style={{ fontFamily: FONT, fontSize: 9.5, color: 'var(--wdp-ink-mid)' }}>Top page</span>
            <span style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 700, color: 'var(--wdp-ink)', marginLeft: 'auto', maxWidth: 160, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {topPageTitle} · {topPage.views}v
            </span>
          </div>
        )}
      </div>

      {hovered && (
        <div style={{ marginTop: 8, paddingTop: 7, borderTop: '1px solid var(--wdp-border)', fontFamily: FONT, fontSize: 10, color: 'var(--wdp-ink-mid)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <MessageCircle size={9} /> Ask Rose Mary about website traffic
        </div>
      )}
    </div>
  )
}

// ── Revenue Card (expandable: line chart + jars by product) ───────────────────
interface SalesData {
  daily: Array<{ date: string; revenue: number; orders: number }>
  byProduct: Array<{ title: string; jars: number }>
}

function RevenueLineChart({ daily }: { daily: SalesData['daily'] }) {
  const FONT = "'Jost', system-ui, sans-serif"
  const [tooltip, setTooltip] = useState<{ x: number; y: number; d: SalesData['daily'][0] } | null>(null)
  const W = 310, H = 80, PAD_L = 36, PAD_R = 8, PAD_T = 8, PAD_B = 22

  const values = daily.map(d => d.revenue)
  const maxV = Math.max(...values, 1)
  const minV = 0

  const pts = daily.map((d, i) => {
    const x = PAD_L + (i / (daily.length - 1)) * (W - PAD_L - PAD_R)
    const y = PAD_T + (1 - (d.revenue - minV) / (maxV - minV)) * (H - PAD_T - PAD_B)
    return { x, y, d }
  })

  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const areaD = `${pathD} L ${pts[pts.length-1].x.toFixed(1)} ${(H - PAD_B).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(H - PAD_B).toFixed(1)} Z`

  // Y axis labels
  const yTicks = [0, maxV * 0.5, maxV].map(v => ({
    v,
    y: PAD_T + (1 - (v - minV) / (maxV - minV)) * (H - PAD_T - PAD_B),
    label: v >= 1000 ? `$${(v/1000).toFixed(1)}k` : `$${v.toFixed(0)}`,
  }))

  // X axis — show first, mid, last
  const xTicks = [0, Math.floor((daily.length-1)/2), daily.length-1].map(i => ({
    x: pts[i]?.x ?? 0,
    label: daily[i] ? new Date(daily[i].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
  }))

  return (
    <div style={{ position: 'relative', marginBottom: 6 }}>
      <svg
        width={W} height={H} viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Grid lines */}
        {yTicks.map((t, i) => (
          <line key={i} x1={PAD_L} x2={W - PAD_R} y1={t.y} y2={t.y} stroke="var(--wdp-border)" strokeWidth={0.5} />
        ))}
        {/* Y axis labels */}
        {yTicks.map((t, i) => (
          <text key={i} x={PAD_L - 3} y={t.y + 3.5} textAnchor="end" style={{ fontFamily: FONT, fontSize: 8, fill: 'var(--wdp-ink-dim)' }}>{t.label}</text>
        ))}
        {/* X axis labels */}
        {xTicks.map((t, i) => (
          <text key={i} x={t.x} y={H - 4} textAnchor="middle" style={{ fontFamily: FONT, fontSize: 8, fill: 'var(--wdp-ink-dim)' }}>{t.label}</text>
        ))}
        {/* Area fill */}
        <path d={areaD} fill="#D7FF10" opacity={0.08} />
        {/* Line */}
        <path d={pathD} fill="none" stroke="#D7FF10" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        {/* Hover zones */}
        {pts.map((p, i) => (
          <rect
            key={i}
            x={i === 0 ? p.x - 6 : (pts[i-1].x + p.x) / 2}
            y={PAD_T}
            width={i === 0 ? 12 : (i === pts.length-1 ? (W - PAD_R) - (pts[i-1].x + p.x)/2 : (pts[i+1] ? (pts[i+1].x + p.x)/2 : p.x + 6) - (pts[i-1].x + p.x)/2)}
            height={H - PAD_T - PAD_B}
            fill="transparent"
            onMouseEnter={() => setTooltip({ x: p.x, y: p.y, d: p.d })}
          />
        ))}
        {/* Tooltip dot */}
        {tooltip && <circle cx={tooltip.x} cy={tooltip.y} r={3} fill="#D7FF10" />}
      </svg>
      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute',
          left: Math.min(tooltip.x / W * 100, 70) + '%',
          top: 0,
          background: 'var(--wdp-ground)',
          border: '1px solid var(--wdp-border)',
          borderRadius: 7,
          padding: '5px 9px',
          fontFamily: FONT,
          fontSize: 10.5,
          pointerEvents: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          whiteSpace: 'nowrap',
          zIndex: 10,
        }}>
          <div style={{ fontWeight: 700, color: 'var(--wdp-ink)' }}>
            {new Date(tooltip.d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
          <div style={{ color: '#D7FF10', fontWeight: 700 }}>${tooltip.d.revenue.toFixed(2)}</div>
          <div style={{ color: 'var(--wdp-ink-mid)' }}>{tooltip.d.orders} order{tooltip.d.orders !== 1 ? 's' : ''}</div>
        </div>
      )}
    </div>
  )
}

function RevenueCard({
  section, salesData, onSend,
}: {
  section: { label: string; value: string; meta?: string; color: string }
  salesData: SalesData | null
  onSend: (p: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [hovered, setHovered] = useState(false)
  const FONT = "'Jost', system-ui, sans-serif"

  const colors = COLOR_MAP[section.color as keyof typeof COLOR_MAP] ?? COLOR_MAP.neutral
  const trend: 'up' | 'down' | 'flat' = section.color === 'positive' ? 'up' : section.color === 'alert' ? 'down' : 'flat'

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'var(--wdp-surface)' : 'var(--wdp-ground)',
        border: hovered ? '1px solid var(--wdp-neon, #D7FF10)' : '1px solid var(--wdp-border)',
        borderRadius: 10,
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
        overflow: 'hidden',
      }}
    >
      {/* Header — click to toggle or send */}
      <div
        style={{ padding: '11px 13px' }}
        onClick={() => expanded ? setExpanded(false) : onSend('Walk me through the revenue numbers — what\'s driving the change and what should I focus on?')}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: colors.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <TrendingUp size={12} style={{ color: colors.icon }} strokeWidth={2} />
            </div>
            <span style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)' }}>
              {section.label}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkline trend={trend} color={colors.icon} />
            <button
              onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: FONT, fontSize: 10, color: 'var(--wdp-ink-mid)', padding: '0 2px' }}
            >
              {expanded ? '▲' : '▼'}
            </button>
          </div>
        </div>
        <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: 'var(--wdp-ink)', lineHeight: 1.3 }}
          dangerouslySetInnerHTML={{ __html: section.value
            .replace(/↑\s*([\d]+%)/g, '<span style="color:#2A7A52;font-weight:700">↑ $1</span>')
            .replace(/↓\s*([\d]+%)/g, '<span style="color:#C14B3A;font-weight:700">↓ $1</span>')
          }}
        />
        {section.meta && <div style={{ fontFamily: FONT, fontSize: 10.5, color: 'var(--wdp-ink-mid)', marginTop: 3 }}>{section.meta}</div>}
      </div>

      {/* Expanded detail */}
      {expanded && salesData && (
        <div onClick={e => e.stopPropagation()} style={{ borderTop: '1px solid var(--wdp-border)', padding: '12px 13px' }}>
          {/* Line chart */}
          <div style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)', marginBottom: 8 }}>
            Daily Revenue · Last 30 days
          </div>
          <RevenueLineChart daily={salesData.daily} />

          {/* Jars by product table */}
          {salesData.byProduct.length > 0 && (
            <>
              <div style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)', marginBottom: 7, marginTop: 12 }}>
                Jars Sold by Product · Last 30 days
              </div>
              <div style={{ border: '1px solid var(--wdp-border)', borderRadius: 8, overflow: 'hidden' }}>
                {salesData.byProduct.map((p, i) => {
                  const maxJars = salesData.byProduct[0]?.jars ?? 1
                  const barPct = (p.jars / maxJars) * 100
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px',
                      borderBottom: i < salesData.byProduct.length - 1 ? '1px solid var(--wdp-border)' : 'none',
                      background: i % 2 === 0 ? 'var(--wdp-ground)' : 'var(--wdp-surface)',
                      position: 'relative',
                    }}>
                      {/* Bar bg */}
                      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${barPct}%`, background: '#D7FF10', opacity: 0.06, pointerEvents: 'none' }} />
                      <div style={{ flex: 1, fontFamily: FONT, fontSize: 11, fontWeight: 600, color: 'var(--wdp-ink)', position: 'relative', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.title}
                      </div>
                      <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: 'var(--wdp-ink)', position: 'relative', flexShrink: 0 }}>
                        {p.jars}
                        <span style={{ fontFamily: FONT, fontSize: 9.5, fontWeight: 400, color: 'var(--wdp-ink-mid)', marginLeft: 3 }}>jars</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Sparkline({ trend, color }: { trend: 'up' | 'down' | 'flat'; color: string }) {
  const raw = trend === 'up'
    ? [10, 8, 12, 9, 13, 8, 5, 3]
    : trend === 'down'
    ? [3, 5, 6, 4, 8, 10, 12, 14]
    : [8, 7, 10, 8, 9, 7, 9, 8]
  const max = Math.max(...raw)
  const min = Math.min(...raw)
  const nh = (v: number) => (20 - ((v - min) / (max - min + 1)) * 16).toFixed(1)
  const pts = raw.map((v, i) => `${i * 7},${nh(v)}`).join(' ')
  const lx = 7 * 7, ly = parseFloat(nh(raw[7]))
  return (
    <svg width={56} height={24} viewBox="0 0 49 24" fill="none" style={{ flexShrink: 0 }}>
      <polyline points={pts} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
      <circle cx={lx} cy={ly} r="2.5" fill={color} opacity="0.9" />
    </svg>
  )
}

// ── BriefCard rendered inside chat feed ────────────────────────────────────────
function BriefCard({ data, date, onChip, onDismiss }: { data: BriefData; date: string | null; onChip: (text: string) => void; onDismiss?: () => void }) {
  const [hoveredChip, setHoveredChip] = useState<number | null>(null)
  const FONT  = "'Jost', system-ui, sans-serif"
  const SERIF = "'Cormorant Garamond', Georgia, serif"

  const dayName = date
    ? new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })
    : new Date().toLocaleDateString('en-US', { weekday: 'long' })
  const dateShort = date
    ? new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div style={{
      background: 'var(--wdp-surface, #FFFFFF)',
      borderTop: '1px solid var(--wdp-border)',
      borderRight: '1px solid var(--wdp-border)',
      borderBottom: '1px solid var(--wdp-border)',
      borderLeft: '3px solid var(--wdp-neon, #D7FF10)',
      borderRadius: 11,
      overflow: 'hidden',
      marginTop: 8,
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--wdp-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 700, color: 'var(--wdp-ink)', letterSpacing: '-0.3px' }}>
          {dayName} Brief
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: FONT, fontSize: 10, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)' }}>
            {dateShort}
          </span>
          {onDismiss && (
            <button
              onClick={onDismiss}
              title="Collapse brief"
              style={{
                width: 20, height: 20, borderRadius: 5,
                background: 'transparent', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'var(--wdp-ink-mid)', opacity: 0.4,
                fontSize: 16, lineHeight: 1, fontFamily: FONT,
              }}
              className="hover:opacity-100"
            >×</button>
          )}
        </div>
      </div>

      {/* Sections */}
      {data.sections.map((s, i) => {
        const IconComp = ICON_MAP[s.icon] ?? TrendingUp
        const colors = COLOR_MAP[s.color]
        const isLast = i === data.sections.length - 1
        return (
          <div
            key={i}
            style={{
              padding: '10px 16px',
              borderBottom: isLast && !data.question ? 'none' : '1px solid var(--wdp-border)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
            }}
          >
            {/* Colored icon box */}
            <div style={{
              width: 28, height: 28,
              borderRadius: 7,
              background: colors.bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              marginTop: 1,
            }}>
              <IconComp size={13} style={{ color: colors.icon }} strokeWidth={2} />
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: FONT,
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--wdp-ink-mid)',
                marginBottom: 3,
              }}>
                {s.label}
              </div>
              <div
                style={{
                  fontFamily: FONT,
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--wdp-ink)',
                  lineHeight: 1.45,
                }}
                dangerouslySetInnerHTML={{ __html: s.value
                  .replace(/↑\s*([\d]+%)/g, '<span style="color:#2A7A52;font-weight:600">↑ $1</span>')
                  .replace(/↓\s*([\d]+%)/g, '<span style="color:#C14B3A;font-weight:600">↓ $1</span>')
                }}
              />
              {s.meta && (
                <div style={{ fontFamily: FONT, fontSize: 11, color: 'var(--wdp-ink-mid)', marginTop: 2 }}>
                  {s.meta}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {/* COO question */}
      {data.question && (
        <div style={{
          padding: '11px 16px',
          background: 'rgba(215,255,16,0.06)',
          borderTop: '1px solid rgba(215,255,16,0.18)',
          fontFamily: FONT,
          fontSize: 13,
          color: 'var(--wdp-ink)',
          lineHeight: 1.6,
        }}
          dangerouslySetInnerHTML={{ __html: marked.parseInline(data.question) as string }}
        />
      )}

      {/* Action chips */}
      {data.chips.length > 0 && (
        <div style={{
          padding: '10px 16px',
          display: 'flex',
          gap: 7,
          flexWrap: 'wrap',
          borderTop: '1px solid var(--wdp-border)',
        }}>
          {data.chips.map((chip, ci) => {
            const isPrimary = ci === 0
            const isHov = hoveredChip === ci
            return (
              <button
                key={ci}
                onClick={() => onChip(chip)}
                onMouseEnter={() => setHoveredChip(ci)}
                onMouseLeave={() => setHoveredChip(null)}
                style={{
                  padding: '6px 13px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  fontFamily: "'Jost', system-ui, sans-serif",
                  transition: 'background 0.12s, border-color 0.12s, color 0.12s, box-shadow 0.12s',
                  ...(isPrimary ? {
                    background: isHov ? '#c8f000' : 'var(--wdp-neon, #D7FF10)',
                    color: '#000',
                    border: '1.5px solid transparent',
                    boxShadow: isHov ? '0 2px 10px rgba(215,255,16,0.45)' : 'none',
                  } : {
                    background: isHov ? 'var(--wdp-ink, #111110)' : 'transparent',
                    color: isHov ? '#fff' : 'var(--wdp-ink)',
                    border: `1.5px solid ${isHov ? 'var(--wdp-ink)' : 'var(--wdp-border)'}`,
                  }),
                }}
              >
                {chip}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function ChatPage() {
  // Fixed COO agent — no switching
  const COO_ID = 1
  const [cooAgent, setCooAgent] = useState<Agent | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [streaming, setStreaming] = useState(false)
  const [imageAttachment, setImageAttachment] = useState<ImageAttachment | null>(null)

  // Brief state
  const [briefData, setBriefData]       = useState<BriefData | null>(null)
  const [briefText, setBriefText]       = useState<string | null>(null)
  const [briefDate, setBriefDate]       = useState<string | null>(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const [briefGenerating, setBriefGenerating] = useState(false)

  // Meta Ads campaign data for rich tile
  const [metaCampaigns, setMetaCampaigns]     = useState<MetaCampaign[]>([])
  const [metaAccountName, setMetaAccountName] = useState<string | null>(null)

  // Sales analytics (revenue line chart + jars by product)
  const [salesData, setSalesData] = useState<SalesData | null>(null)

  // Klaviyo data for email card
  const [klaviyoData, setKlaviyoData] = useState<KlaviyoData | null>(null)

  // Google Analytics data for website card
  const [gaData, setGaData] = useState<GAData | null>(null)

  // Nudges + dismissed set
  const [nudges, setNudges] = useState<Nudge[]>([])
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [dismissedNudgeIds, setDismissedNudgeIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('wdp_dismissed_nudges')
      return saved ? new Set(JSON.parse(saved) as string[]) : new Set()
    } catch { return new Set() }
  })

  const bottomRef    = useRef<HTMLDivElement>(null)
  const textareaRef  = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load COO agent info + chat history
  useEffect(() => {
    fetch('/api/agents')
      .then(r => r.json())
      .then((data: Agent[]) => {
        const coo = data.find(a => a.id === COO_ID) ?? data[0] ?? null
        setCooAgent(coo)
        if (coo) {
          try {
            const saved = localStorage.getItem(STORAGE_KEY(coo.id))
            if (saved) setMessages(JSON.parse(saved))
          } catch { /* ignore */ }
        }
      })
    // Load nudges
    fetch('/api/nudges')
      .then(r => r.json())
      .then((d: { nudges: Nudge[] }) => setNudges(d.nudges ?? []))
      .catch(() => {/* ignore */})
    // Load recommended actions
    fetch('/api/recommendations')
      .then(r => r.json())
      .then((d: { recommendations: Recommendation[] }) => setRecommendations(d.recommendations ?? []))
      .catch(() => {/* ignore */})
  }, [])

  // Load brief
  useEffect(() => {
    setBriefLoading(true)
    fetch('/api/morning-brief')
      .then(r => r.json())
      .then(d => {
        setBriefData(d.briefData ?? null)
        setBriefText(d.brief ?? null)
        setBriefDate(d.date ?? null)
        setBriefLoading(false)
      })
      .catch(() => setBriefLoading(false))
    // Load Meta Ads campaigns for the rich tile — use live analytics so data is always fresh
    fetch('/api/meta-ads/analytics?days=30')
      .then(r => r.json())
      .then((d: { campaigns?: MetaCampaign[]; account_name?: string | null; error?: string }) => {
        if (d.error || !d.campaigns) return
        setMetaCampaigns(d.campaigns)
        setMetaAccountName(d.account_name ?? null)
      })
      .catch(() => {/* ignore if Meta not connected */})
    // Load sales analytics
    fetch('/api/shopify/sales-analytics')
      .then(r => r.json())
      .then((d: SalesData) => { if (d.daily?.length) setSalesData(d) })
      .catch(() => {})
    // Load Klaviyo data
    fetch('/api/klaviyo/data')
      .then(r => r.json())
      .then((d: KlaviyoData) => {
        if ((d.campaigns?.length ?? 0) + (d.flows?.length ?? 0) + (d.lists?.length ?? 0) > 0) {
          setKlaviyoData(d)
        }
      })
      .catch(() => {/* ignore if Klaviyo not connected */})
    // Load Google Analytics data (7-day window)
    fetch('/api/google-analytics/data?days=7')
      .then(r => r.json())
      .then((d: GAData) => {
        if (d.summary?.sessions != null) setGaData(d)
      })
      .catch(() => {/* ignore if GA not connected */})
  }, [])

  // Persist messages
  useEffect(() => {
    if (!cooAgent) return
    try {
      localStorage.setItem(STORAGE_KEY(cooAgent.id), JSON.stringify(
        messages.map(({ imagePreview: _, ...m }) => m)
      ))
    } catch { /* ignore */ }
  }, [messages, cooAgent])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setImageAttachment({ data: result.split(',')[1], mediaType: result.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg', preview: result })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function send(text?: string) {
    const msg = (text ?? input).trim()
    if ((!msg && !imageAttachment) || streaming || !cooAgent) return

    const newMsg: Message = { role: 'user', content: msg, ...(imageAttachment ? { imagePreview: imageAttachment.preview } : {}) }
    const next = [...messages, newMsg]
    setMessages(next)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    const capturedImage = imageAttachment
    setImageAttachment(null)
    setStreaming(true)

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: cooAgent.id,
        messages: next.map(({ imagePreview: _, ...m }) => m),
        ...(capturedImage ? { image: { data: capturedImage.data, media_type: capturedImage.mediaType } } : {}),
      }),
    })

    if (!res.ok || !res.body) { setStreaming(false); return }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let assistantText = ''
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      assistantText += decoder.decode(value, { stream: true })
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: assistantText }
        return updated
      })
    }
    setStreaming(false)
  }

  async function generateBrief() {
    setBriefGenerating(true)
    try {
      const d = await fetch('/api/morning-brief', { method: 'POST' }).then(r => r.json())
      setBriefData(d.briefData ?? null)
      setBriefText(d.brief ?? null)
      setBriefDate(d.date ?? null)
    } finally {
      setBriefGenerating(false)
    }
  }

  function clearChat() {
    setMessages([])
    setBriefHidden(false)
    if (cooAgent) try { localStorage.removeItem(STORAGE_KEY(cooAgent.id)) } catch { /* ignore */ }
  }

  async function openClearModal() {
    if (messages.length === 0) { clearChat(); return }
    setShowClearModal(true)
    setClearSummary(null)
    setClearMemories([])
    setClearLoading(true)
    setSavedMemoryIds(new Set())
    try {
      const res = await fetch('/api/chat/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      })
      const data = await res.json() as { summary: string; memories: Array<{ text: string; type: string }> }
      setClearSummary(data.summary ?? null)
      setClearMemories((data.memories ?? []).map(m => ({ ...m, checked: true })))
    } catch {
      setClearSummary('Unable to summarize — conversation will be cleared.')
    } finally {
      setClearLoading(false)
    }
  }

  function confirmClearChat() {
    clearChat()
    setShowClearModal(false)
    setClearSummary(null)
    setClearMemories([])
  }

  function dismissNudge(id: string) {
    setDismissedNudgeIds(prev => {
      const next = new Set(prev)
      next.add(id)
      try { localStorage.setItem('wdp_dismissed_nudges', JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }

  function sendAndDismiss(text: string, nudgeId: string) {
    dismissNudge(nudgeId)
    send(text)
  }

  const [hoveredCard, setHoveredCard] = useState<number | null>(null)
  const [briefHidden, setBriefHidden] = useState(false)

  // Clear chat modal
  const [showClearModal, setShowClearModal] = useState(false)
  const [clearSummary, setClearSummary] = useState<string | null>(null)
  const [clearMemories, setClearMemories] = useState<Array<{ text: string; type: string; checked: boolean }>>([])
  const [clearLoading, setClearLoading] = useState(false)
  const [savedMemoryIds, setSavedMemoryIds] = useState<Set<number>>(new Set())

  const agentInit = cooAgent ? initials(cooAgent.name) : 'COO'
  const FONT      = "'Jost', system-ui, sans-serif"
  const SERIF     = "'Cormorant Garamond', Georgia, serif"

  // briefHidden kept for legacy clear-chat reset; showBriefInFeed removed — brief now lives only in right panel

  return (
    <div className="flex h-full overflow-hidden" style={{ background: 'var(--wdp-ground, #FFFFFF)' }}>

      {/* ── Left nav rail ────────────────────────────────────────────────── */}
      <nav
        className="hidden md:flex"
        style={{
          width: 48,
          background: 'var(--wdp-ground, #FFFFFF)',
          borderRight: '1px solid var(--wdp-border, rgba(0,0,0,0.08))',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '14px 0',
          gap: 2,
          flexShrink: 0,
        }}
      >
        {/* W neon logo */}
        <Link href="/chat" style={{ marginBottom: 14 }} title="WDP Command Center">
          <div style={{
            width: 28, height: 28,
            background: 'var(--wdp-neon, #D7FF10)',
            borderRadius: 7,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: SERIF,
            fontSize: 13, fontWeight: 700, color: '#000',
            letterSpacing: '-0.5px',
            flexShrink: 0,
          }}>W</div>
        </Link>

        {/* Nav icons */}
        {NAV.map(item => (
          <div key={item.href} style={{ position: 'relative', width: 36 }}>
            <Link
              href={item.href}
              title={item.label}
              style={{
                width: 36, height: 36,
                borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background 0.12s, color 0.12s',
                ...(item.active ? {
                  background: 'var(--wdp-neon, #D7FF10)',
                  color: '#000',
                } : {
                  color: 'var(--wdp-rail-icon, rgba(44,44,44,0.42))',
                }),
              }}
              className={cn(!item.active && 'hover:bg-black/5')}
            >
              <item.icon size={16} strokeWidth={1.75} />
            </Link>
            {/* Tooltip */}
            <div style={{
              position: 'absolute',
              left: '100%',
              top: '50%',
              transform: 'translateY(-50%)',
              marginLeft: 8,
              padding: '4px 8px',
              borderRadius: 6,
              background: 'var(--wdp-ink, #111110)',
              color: '#FFFFFF',
              fontFamily: FONT,
              fontSize: 11,
              fontWeight: 500,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              opacity: 0,
              transition: 'opacity 0.1s',
              zIndex: 50,
            }}
              className="group-hover:opacity-100"
            >{item.label}</div>
          </div>
        ))}

        <div style={{ flex: 1 }} />

        {/* Settings */}
        <Link
          href="/settings"
          title="Settings"
          style={{
            width: 36, height: 36,
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--wdp-rail-icon, rgba(44,44,44,0.42))',
          }}
          className="hover:bg-black/5"
        >
          <Settings size={16} strokeWidth={1.75} />
        </Link>
      </nav>

      {/* ── Chat column ──────────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRight: '1px solid var(--wdp-border, rgba(0,0,0,0.08))',
      }}>

        {/* Header */}
        <div style={{
          padding: '12px 20px',
          borderBottom: '1px solid var(--wdp-border)',
          background: 'var(--wdp-ground)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Terracotta COO avatar */}
            <div style={{
              width: 28, height: 28,
              background: '#C27A54',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 800, color: '#fff',
              letterSpacing: '-0.5px', flexShrink: 0, fontFamily: FONT,
            }}>
              {agentInit}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: 'var(--wdp-ink)', letterSpacing: '-0.2px' }}>
                {cooAgent?.name ?? 'Rose Mary'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: FONT, fontSize: 10.5, color: 'var(--wdp-ink-mid)' }}>
                <span style={{ width: 5, height: 5, background: 'var(--wdp-neon, #D7FF10)', borderRadius: '50%', boxShadow: '0 0 4px var(--wdp-neon)', display: 'inline-block', flexShrink: 0 }} />
                Your COO · all systems synced
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: FONT, fontSize: 11, color: 'var(--wdp-ink-mid)' }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            {messages.length > 0 && (
              <button onClick={openClearModal} style={{ fontFamily: FONT, fontSize: 11, color: 'var(--wdp-ink-mid)', cursor: 'pointer', background: 'none', border: 'none' }}>
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Feed */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px 20px',
        }}>
          {/* Constrained inner column */}
          <div style={{ maxWidth: 620, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Entry point — always shown when chat is empty */}
          {messages.length === 0 && (
            <div style={{ paddingTop: 8 }}>
              {/* Rose Mary greeting */}
              <div style={{ textAlign: 'center', paddingBottom: 28 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 16,
                  background: '#C27A54',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 800, color: '#fff',
                  fontFamily: FONT, margin: '0 auto 16px',
                  boxShadow: '0 4px 28px rgba(194,122,84,0.28)',
                }}>
                  {agentInit}
                </div>
                <h1 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, color: 'var(--wdp-ink)', marginBottom: 8, letterSpacing: '-0.4px', lineHeight: 1.15 }}>
                  Good {getTimeOfDay()}, Kyle.
                </h1>
                <p style={{ fontFamily: FONT, fontSize: 13.5, color: 'var(--wdp-ink-mid)', lineHeight: 1.5, maxWidth: 380, margin: '0 auto' }}>
                  {cooAgent?.description ?? "I'm Rose Mary, your COO. What would you like to tackle today?"}
                </p>
              </div>

              {/* Quick action card grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginBottom: 24 }}>
                {([
                  { icon: TrendingUp,  color: '#2A7A52', bg: 'rgba(128,230,166,0.15)', title: 'Sales Snapshot',    desc: 'How are orders tracking this week?',             prompt: 'How are orders tracking this week?' },
                  { icon: Package,     color: '#C27A54', bg: 'rgba(194,122,84,0.12)',  title: 'Inventory Check',   desc: "What's running low or needs replenishment?",       prompt: "What's the inventory status? Flag anything running low or at risk." },
                  { icon: Mail,        color: '#4A7C8A', bg: 'rgba(120,183,197,0.15)', title: 'Draft an Email',    desc: 'Klaviyo campaign, customer reply, or pitch',        prompt: 'Help me draft a Klaviyo email campaign for our next promotion.' },
                  { icon: Zap,         color: '#C14B3A', bg: 'rgba(193,75,58,0.10)',   title: 'Priority Queue',    desc: "What's most urgent and needs my attention?",        prompt: "What's most urgent and needs my attention today?" },
                  { icon: Megaphone,   color: '#8AA800', bg: 'rgba(215,255,16,0.12)',  title: 'Marketing Plan',    desc: 'Upcoming campaigns and seasonal windows',           prompt: 'What marketing campaigns should I be planning for the next 6 weeks?' },
                  { icon: Zap,         color: '#6B4CC0', bg: 'rgba(107,76,192,0.10)',  title: 'Daily Brief',       desc: 'Generate your morning brief now',                   prompt: '__daily_brief__' },
                ] as Array<{ icon: React.ElementType; color: string; bg: string; title: string; desc: string; prompt: string }>).map((card, ci) => (
                  <button
                    key={ci}
                    onClick={() => card.prompt === '__daily_brief__' ? generateBrief() : send(card.prompt)}
                    onMouseEnter={() => setHoveredCard(ci)}
                    onMouseLeave={() => setHoveredCard(null)}
                    style={{
                      textAlign: 'left', padding: '14px 15px', borderRadius: 11,
                      border: `1.5px solid ${hoveredCard === ci ? card.color + '55' : 'var(--wdp-border)'}`,
                      background: hoveredCard === ci ? card.bg : 'var(--wdp-surface, #FFFFFF)',
                      cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 9,
                      transition: 'background 0.14s ease, border-color 0.14s ease, box-shadow 0.14s ease',
                      boxShadow: hoveredCard === ci ? `0 2px 12px ${card.color}22` : 'none',
                    }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: hoveredCard === ci ? card.color + '22' : card.bg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      transition: 'background 0.14s ease',
                    }}>
                      <card.icon size={15} style={{ color: card.color }} strokeWidth={2} />
                    </div>
                    <div>
                      <div style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: hoveredCard === ci ? card.color : 'var(--wdp-ink)', marginBottom: 3, transition: 'color 0.14s' }}>{card.title}</div>
                      <div style={{ fontFamily: FONT, fontSize: 11, color: 'var(--wdp-ink-mid)', lineHeight: 1.45 }}>{card.desc}</div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Brief CTA — generate if not loaded, or show "in right panel" note */}
              <div style={{ textAlign: 'center' }}>
                {briefData ? (
                  <p style={{ fontFamily: FONT, fontSize: 11.5, color: 'var(--wdp-ink-mid)', letterSpacing: 0 }}>
                    Your brief is ready — check the <strong>right panel</strong> for today's KPIs and recommended actions.
                  </p>
                ) : (
                  <button
                    onClick={generateBrief}
                    disabled={briefGenerating}
                    style={{
                      padding: '9px 22px',
                      background: 'var(--wdp-neon, #D7FF10)', color: '#000',
                      border: 'none', borderRadius: 8, fontFamily: FONT, fontSize: 12.5, fontWeight: 700,
                      cursor: 'pointer', opacity: briefGenerating ? 0.5 : 1,
                      letterSpacing: '-0.1px',
                    }}
                  >
                    {briefGenerating ? 'Generating brief…' : '✦ Generate Morning Brief'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Chat messages */}
          {messages.map((m, i) => {
            const isUser = m.role === 'user'
            const isLast = i === messages.length - 1
            return (
              <div key={i} style={{ display: 'flex', gap: 10, ...(isUser ? { flexDirection: 'row-reverse' } as React.CSSProperties : {}) }}>
                {/* Avatar */}
                <div style={{
                  width: 24, height: 24, borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 800, flexShrink: 0, marginTop: 20,
                  fontFamily: FONT,
                  background: isUser ? 'var(--wdp-ink, #111110)' : '#C27A54',
                  color: '#fff',
                }}>
                  {isUser ? 'K' : agentInit}
                </div>

                <div style={{ flex: 1, minWidth: 0, ...(isUser ? { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' } as React.CSSProperties : {}) }}>
                  {/* Name + time row */}
                  <div style={{
                    fontFamily: FONT, fontSize: 9.5, fontWeight: 700,
                    letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: 'var(--wdp-ink-mid)', marginBottom: 6,
                    textAlign: isUser ? 'right' : 'left',
                  }}>
                    {isUser ? 'Kyle' : (cooAgent?.name ?? 'Rose Mary')}
                  </div>

                  {isUser ? (
                    /* User bubble — dark, right-aligned, max 72% width */
                    <div style={{
                      background: 'var(--wdp-ink, #111110)',
                      color: 'var(--wdp-ground, #FFFFFF)',
                      borderRadius: '12px 4px 12px 12px',
                      padding: '10px 14px',
                      fontSize: 13, lineHeight: 1.65,
                      fontFamily: FONT, maxWidth: '72%', wordBreak: 'break-word',
                    }}>
                      {m.imagePreview && <img src={m.imagePreview} alt="Attached" style={{ borderRadius: 7, marginBottom: 8, maxHeight: 200, maxWidth: '100%', display: 'block' }} />}
                      {m.content && <span style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span>}
                    </div>
                  ) : (
                    /* Agent reply — light, full width, no bubble cap */
                    <div className="chat-prose" style={{
                      fontSize: 13, lineHeight: 1.7,
                      fontFamily: FONT,
                      color: 'var(--wdp-ink, #111110)',
                      wordBreak: 'break-word',
                    }}>
                      {m.content
                        ? (() => {
                            const segments = parseTaskProposals(m.content)
                            return (
                              <>
                                {segments.map((seg, si) =>
                                  seg.type === 'text'
                                    ? seg.value.trim()
                                      ? <div key={si} dangerouslySetInnerHTML={{ __html: marked.parse(seg.value) as string }} />
                                      : null
                                    : seg.type === 'proposal'
                                    ? <TaskProposalCard
                                        key={si}
                                        proposal={seg.value}
                                        onCreated={(taskId, title) => {
                                          setMessages(prev => [...prev, {
                                            role: 'assistant',
                                            content: `✓ Task created: **${title}** (ID #${taskId})`,
                                          }])
                                        }}
                                      />
                                    : seg.type === 'stat-grid'
                                    ? <StatGrid key={si} tiles={seg.value} />
                                    : <TaskListCards key={si} tasks={seg.value} />
                                )}
                              </>
                            )
                          })()
                        : streaming && isLast
                          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--wdp-ink-mid)' }}>
                              <Loader2 size={12} className="animate-spin" /> Thinking…
                            </span>
                          : null
                      }
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          <div ref={bottomRef} />
          </div>{/* end inner constrained column */}
        </div>

        {/* Input */}
        <div
          className="chat-compose-wrap"
          style={{
            padding: '12px 20px 16px',
            borderTop: '1px solid var(--wdp-border)',
            background: 'var(--wdp-ground)',
            flexShrink: 0,
          }}
        >
          {/* Constrained inner — matches feed width */}
          <div style={{ maxWidth: 620, margin: '0 auto' }}>

          {/* Image preview */}
          {imageAttachment && (
            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img src={imageAttachment.preview} alt="Attached" style={{ maxHeight: 64, maxWidth: 96, display: 'block', objectFit: 'cover', borderRadius: 8, border: '1px solid var(--wdp-border)' }} />
                <button onClick={() => setImageAttachment(null)} style={{ position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: '50%', background: 'var(--wdp-ink)', color: 'var(--wdp-ground)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: 'none' }}>
                  <X size={10} />
                </button>
              </div>
            </div>
          )}

          {/* Quick chips — only when conversation is active and input is empty */}
          {messages.length > 0 && !input && !streaming && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 9, flexWrap: 'wrap' }}>
              {['What should I prioritize?', 'Summarize that', 'Draft a follow-up', 'What else needs attention?'].map(s => (
                <button key={s} onClick={() => send(s)} style={{
                  padding: '4px 11px', borderRadius: 999,
                  border: '1px solid var(--wdp-border)',
                  fontSize: 11, color: 'var(--wdp-ink-mid)',
                  cursor: 'pointer', background: 'transparent', fontFamily: FONT, whiteSpace: 'nowrap',
                  transition: 'border-color 0.1s, color 0.1s',
                }}>
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input row */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 9,
            background: 'var(--wdp-surface, #F7F7F5)',
            border: '1.5px solid var(--wdp-border)',
            borderRadius: 11,
            padding: '9px 13px',
          }}>
            <input ref={fileInputRef as React.RefObject<HTMLInputElement>} type="file" accept="image/jpeg,image/png,image/gif,image/webp" style={{ display: 'none' }} onChange={handleFileChange} />
            <button onClick={() => fileInputRef.current?.click()} disabled={streaming} style={{ color: 'var(--wdp-ink-mid)', opacity: 0.45, cursor: 'pointer', display: 'flex', alignItems: 'center', background: 'none', border: 'none', flexShrink: 0 }}>
              <Paperclip size={14} strokeWidth={1.75} />
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px' }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Ask anything or give an instruction…"
              rows={1}
              style={{
                flex: 1, background: 'transparent', outline: 'none', resize: 'none', border: 'none',
                fontFamily: FONT, fontSize: 13, color: 'var(--wdp-ink)',
                minHeight: 22, maxHeight: 120,
              }}
            />

            <div style={{
              fontFamily: FONT, fontSize: 10, color: 'var(--wdp-ink-dim)',
              background: 'var(--wdp-surface)', border: '1px solid var(--wdp-border)',
              borderRadius: 4, padding: '2px 5px', letterSpacing: '0.05em', flexShrink: 0,
            }}>⌘K</div>

            <button
              onClick={() => send()}
              disabled={(!input.trim() && !imageAttachment) || streaming}
              style={{
                width: 30, height: 30,
                background: 'var(--wdp-neon, #D7FF10)',
                border: 'none', borderRadius: 7,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
                opacity: (!input.trim() && !imageAttachment) || streaming ? 0.35 : 1,
                transition: 'opacity 0.12s',
              }}
            >
              {streaming ? <Loader2 size={13} strokeWidth={2.5} style={{ color: '#000' }} className="animate-spin" /> : <Send size={13} strokeWidth={2.5} style={{ color: '#000' }} />}
            </button>
          </div>
          </div>{/* end inner constrained */}
        </div>
      </div>

      {/* ── Right context panel ── Command Center ──────────────────────────── */}
      <aside
        className="hidden md:flex flex-col shrink-0 overflow-hidden"
        style={{ width: 360, background: 'var(--wdp-panel-bg, #F7F7F5)', borderLeft: '1px solid var(--wdp-border)' }}
      >
        {/* Panel header */}
        <div style={{
          padding: '14px 16px 12px',
          borderBottom: '1px solid var(--wdp-border)',
          flexShrink: 0,
          background: 'var(--wdp-ground)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)', marginBottom: 2 }}>
                Command Center
              </div>
              <div style={{ fontFamily: FONT, fontSize: 11, color: 'var(--wdp-ink-dim)' }}>
                {briefDate
                  ? new Date(briefDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
                  : new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
                }
              </div>
            </div>
            <button
              onClick={generateBrief}
              disabled={briefGenerating}
              title="Refresh brief"
              style={{
                width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 7, background: 'var(--wdp-surface, #F0F0EE)',
                border: '1px solid var(--wdp-border)', color: 'var(--wdp-ink-mid)',
                cursor: 'pointer', opacity: briefGenerating ? 0.4 : 1, flexShrink: 0,
              }}
            >
              <RefreshCw size={12} className={briefGenerating ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* System status pills */}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {([
              { label: 'Orders',    icon: BarChart2, status: nudges.some(n => n.type === 'alert') ? 'alert' : 'ok' },
              { label: 'Inventory', icon: Package,   status: nudges.some(n => n.icon === 'Package') ? 'warn' : 'ok' },
              { label: 'Tasks',     icon: CheckSquare, status: nudges.some(n => n.icon === 'CheckSquare') ? 'warn' : 'ok' },
              { label: 'Email',     icon: Mail,      status: 'ok' },
            ] as Array<{ label: string; icon: React.ElementType; status: 'ok' | 'warn' | 'alert' }>).map(s => {
              const sc = s.status === 'alert'
                ? { bg: 'rgba(193,75,58,0.10)', text: '#C14B3A', dot: '#C14B3A' }
                : s.status === 'warn'
                ? { bg: 'rgba(194,122,84,0.10)', text: '#C27A54', dot: '#C27A54' }
                : { bg: 'rgba(42,122,82,0.09)', text: '#2A7A52', dot: '#2A7A52' }
              return (
                <div key={s.label} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '3px 8px', borderRadius: 999, background: sc.bg,
                }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: sc.dot, flexShrink: 0 }} />
                  <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, color: sc.text }}>{s.label}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Nudge cards */}
          {nudges.filter(n => !dismissedNudgeIds.has(n.id)).length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#C14B3A', flexShrink: 0 }} />
                <span style={{ fontFamily: FONT, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)' }}>
                  Needs Attention
                </span>
                <span style={{
                  marginLeft: 'auto', background: '#C14B3A', color: '#fff',
                  borderRadius: 99, fontSize: 9, fontWeight: 700, fontFamily: FONT,
                  padding: '1px 5px', lineHeight: 1.4,
                }}>
                  {nudges.filter(n => !dismissedNudgeIds.has(n.id)).length}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {nudges.filter(n => !dismissedNudgeIds.has(n.id)).map(n => {
                  const colors = NUDGE_COLORS[n.type]
                  const IconComp = NUDGE_ICONS[n.icon] ?? AlertCircle
                  return (
                    <div key={n.id} style={{
                      background: 'var(--wdp-ground)',
                      borderTop: `1px solid ${colors.border}`,
                      borderRight: `1px solid ${colors.border}`,
                      borderBottom: `1px solid ${colors.border}`,
                      borderLeft: `3px solid ${colors.icon}`,
                      borderRadius: 9,
                      padding: '10px 12px',
                      position: 'relative',
                    }}>
                      {/* Dismiss × */}
                      <button
                        onClick={() => dismissNudge(n.id)}
                        title="Dismiss"
                        style={{
                          position: 'absolute', top: 7, right: 7,
                          width: 18, height: 18, borderRadius: 4,
                          background: 'transparent', border: 'none',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', color: 'var(--wdp-ink-mid)', opacity: 0.4,
                          fontSize: 13, lineHeight: 1, fontFamily: FONT,
                        }}
                        className="hover:opacity-100"
                      >×</button>

                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: n.chip ? 8 : 0, paddingRight: 14 }}>
                        <div style={{
                          width: 26, height: 26, borderRadius: 7,
                          background: colors.bg,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
                        }}>
                          <IconComp size={13} style={{ color: colors.icon }} strokeWidth={2} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: 700, color: 'var(--wdp-ink)', marginBottom: 3 }}>
                            {n.title}
                          </div>
                          <div className="chat-prose" style={{ fontFamily: FONT, fontSize: 11, color: 'var(--wdp-ink-mid)', lineHeight: 1.5 }}
                            dangerouslySetInnerHTML={{ __html: marked.parse(n.body) as string }}
                          />
                        </div>
                      </div>
                      {n.chip && (
                        <button onClick={() => sendAndDismiss(n.chip!, n.id)} style={{
                          width: '100%', padding: '5px 10px', borderRadius: 6,
                          border: `1px solid ${colors.border}`,
                          background: 'var(--wdp-surface)', fontFamily: FONT, fontSize: 11, fontWeight: 600,
                          color: 'var(--wdp-ink)', cursor: 'pointer', textAlign: 'left' as const,
                        }}>
                          {n.chip} →
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* KPI snapshot tiles */}
          {briefLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: FONT, fontSize: 12, color: 'var(--wdp-ink-mid)', padding: '12px 0' }}>
              <Loader2 size={13} className="animate-spin" /> Loading brief…
            </div>
          ) : briefData && briefData.sections.length > 0 ? (
            <div>
              <div style={{ fontFamily: FONT, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)', marginBottom: 8 }}>
                Today's Snapshot
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {briefData.sections.map((s, i) => {
                  // Skip generic "Website · Last 7 days" row if we have the rich GASummaryCard
                  if (s.label.startsWith('Website') && gaData) return null

                  // Revenue — render expandable card with line chart + jars table
                  if (s.icon === 'revenue') {
                    return (
                      <RevenueCard
                        key={i}
                        section={s}
                        salesData={salesData}
                        onSend={send}
                      />
                    )
                  }

                  // Meta Ads — render rich card with KPI grid + campaign list
                  if (s.icon === 'meta' && metaCampaigns.length > 0) {
                    return (
                      <MetaAdsCard
                        key={i}
                        section={s}
                        campaigns={metaCampaigns.filter(c => (c.effective_status ?? c.status) !== 'ARCHIVED')}
                        accountName={metaAccountName}
                        onSend={send}
                      />
                    )
                  }

                  const colors = COLOR_MAP[s.color]
                  const IconComp = ICON_MAP[s.icon] ?? TrendingUp
                  const trend: 'up' | 'down' | 'flat' = s.color === 'positive' ? 'up' : s.color === 'alert' ? 'down' : 'flat'
                  const kpiPrompts: Record<string, string> = {
                    revenue:   'Walk me through the revenue numbers — what\'s driving the change and what should I focus on?',
                    task:      'Show me all open and overdue tasks, sorted by urgency. What needs attention first?',
                    inventory: 'Which products are low on stock or approaching their reorder threshold? What should I restock?',
                    email:     'Break down email performance — open rate, click rate, and what I can do to improve them.',
                    campaign:  'How are our marketing campaigns performing? What\'s working and what needs adjustment?',
                    project:   'Give me a project status update — what\'s on track, what\'s at risk, and what\'s next?',
                    meta:      'Show me our Meta Ads performance — campaigns, spend, and what\'s working.',
                  }
                  const prompt = kpiPrompts[s.icon] ?? `Tell me more about ${s.label.toLowerCase()}`
                  const isHovered = hoveredCard === 200 + i
                  return (
                    <div
                      key={i}
                      onClick={() => send(prompt)}
                      onMouseEnter={() => setHoveredCard(200 + i)}
                      onMouseLeave={() => setHoveredCard(null)}
                      style={{
                        background: isHovered ? 'var(--wdp-surface)' : 'var(--wdp-ground)',
                        border: isHovered ? '1px solid var(--wdp-neon, #D7FF10)' : '1px solid var(--wdp-border)',
                        borderRadius: 10,
                        padding: '11px 13px',
                        cursor: 'pointer',
                        transition: 'border-color 0.15s, background 0.15s',
                        position: 'relative',
                      }}>
                      {/* Row 1: icon + label + sparkline */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <div style={{
                            width: 26, height: 26, borderRadius: 7,
                            background: colors.bg,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>
                            <IconComp size={12} style={{ color: colors.icon }} strokeWidth={2} />
                          </div>
                          <span style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)' }}>
                            {s.label}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Sparkline trend={trend} color={colors.icon} />
                          {isHovered && (
                            <span style={{ fontSize: 10, color: 'var(--wdp-neon, #D7FF10)', fontWeight: 700, fontFamily: FONT }}>→</span>
                          )}
                        </div>
                      </div>
                      {/* Row 2: value */}
                      <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: 'var(--wdp-ink)', lineHeight: 1.3 }}
                        dangerouslySetInnerHTML={{ __html: s.value
                          .replace(/↑\s*([\d]+%)/g, '<span style="color:#2A7A52;font-weight:700">↑ $1</span>')
                          .replace(/↓\s*([\d]+%)/g, '<span style="color:#C14B3A;font-weight:700">↓ $1</span>')
                        }}
                      />
                      {s.meta && (
                        <div style={{ fontFamily: FONT, fontSize: 10.5, color: 'var(--wdp-ink-mid)', marginTop: 3 }}>{s.meta}</div>
                      )}
                      {isHovered && (
                        <div style={{
                          marginTop: 8, paddingTop: 7, borderTop: '1px solid var(--wdp-border)',
                          fontFamily: FONT, fontSize: 10, color: 'var(--wdp-ink-mid)',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                          <MessageCircle size={9} /> Ask Rose Mary about this
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Klaviyo card — email campaigns + flows */}
                {klaviyoData && (
                  <KlaviyoCard data={klaviyoData} onSend={send} />
                )}

                {/* Google Analytics card — 7-day website snapshot */}
                {gaData && (
                  <GASummaryCard data={gaData} onSend={send} />
                )}
              </div>

              {/* Recommended Actions — from /api/recommendations (specific action items, distinct from KPI snapshot) */}
              {recommendations.length > 0 && (() => {
                const REC_ICON_MAP: Record<string, React.ElementType> = {
                  CheckSquare, Zap, Package, Mail, AlertCircle, Megaphone,
                  TrendingUp, FolderOpen, Inbox,
                }
                const typeColors: Record<string, keyof typeof COLOR_MAP> = {
                  task: 'alert', inventory: 'warning', marketing: 'neutral',
                  revenue: 'warning', system: 'neutral',
                }
                return (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontFamily: FONT, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Zap size={9} style={{ color: 'var(--wdp-ink-mid)' }} /> Recommended Actions
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {recommendations.map((rec, ci) => {
                        const colorKey = typeColors[rec.type] ?? 'neutral'
                        const colors = COLOR_MAP[colorKey]
                        const IconComp = REC_ICON_MAP[rec.icon] ?? AlertCircle
                        return (
                          <button key={rec.id ?? ci} onClick={() => send(rec.prompt)} style={{
                            background: colors.bg,
                            borderTop: `1px solid ${colors.bg.replace(/[\d.]+\)$/, '0.28)')}`,
                            borderRight: `1px solid ${colors.bg.replace(/[\d.]+\)$/, '0.28)')}`,
                            borderBottom: `1px solid ${colors.bg.replace(/[\d.]+\)$/, '0.28)')}`,
                            borderLeft: `3px solid ${colors.icon}`,
                            borderRadius: 9,
                            padding: '9px 11px',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                            cursor: 'pointer',
                            textAlign: 'left' as const,
                            width: '100%',
                          }}>
                            <div style={{
                              width: 22, height: 22, borderRadius: 6,
                              background: 'rgba(255,255,255,0.10)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
                            }}>
                              <IconComp size={11} style={{ color: colors.icon }} strokeWidth={2} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 700, color: colors.text, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {rec.title}
                              </div>
                              <div style={{ fontFamily: FONT, fontSize: 10, color: 'var(--wdp-ink-mid)', lineHeight: 1.4 }}>
                                {rec.detail}
                              </div>
                            </div>
                            <span style={{ fontSize: 10, color: colors.icon, fontWeight: 700, flexShrink: 0, alignSelf: 'center' }}>→</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '24px 12px' }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: 'rgba(215,255,16,0.10)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 12px',
              }}>
                <Activity size={20} style={{ color: 'var(--wdp-ink-mid)' }} strokeWidth={1.5} />
              </div>
              <p style={{ fontFamily: FONT, fontSize: 12, color: 'var(--wdp-ink-mid)', marginBottom: 14, lineHeight: 1.5 }}>
                Generate your morning brief to see KPIs, inventory status, and campaign health.
              </p>
              <button onClick={generateBrief} disabled={briefGenerating} style={{
                padding: '8px 18px', background: 'var(--wdp-neon)', color: '#000',
                border: 'none', borderRadius: 8, fontFamily: FONT, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>
                {briefGenerating ? 'Generating…' : '✦ Generate Brief'}
              </button>
            </div>
          )}
        </div>

        {/* Suggested actions footer */}
        <div style={{
          borderTop: '1px solid var(--wdp-border)',
          padding: '12px 14px',
          background: 'var(--wdp-ground)',
          flexShrink: 0,
        }}>
          <div style={{ fontFamily: FONT, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)', marginBottom: 7 }}>
            Quick Actions
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[
              { label: 'How are orders tracking?',   icon: TrendingUp, color: '#2A7A52', bg: 'rgba(128,230,166,0.12)' },
              { label: 'What needs attention today?', icon: Zap,        color: '#C14B3A', bg: 'rgba(193,75,58,0.08)'   },
              { label: 'Draft a Klaviyo email',       icon: Mail,       color: '#4A7C8A', bg: 'rgba(120,183,197,0.12)' },
            ].map((s, qi) => {
              const qKey = `qa-${qi}`
              const isHov = hoveredCard === (100 + qi)
              return (
                <button
                  key={s.label}
                  onClick={() => send(s.label)}
                  onMouseEnter={() => setHoveredCard(100 + qi)}
                  onMouseLeave={() => setHoveredCard(null)}
                  style={{
                    textAlign: 'left' as const, padding: '7px 10px', borderRadius: 7,
                    border: `1px solid ${isHov ? s.color + '44' : 'var(--wdp-border)'}`,
                    background: isHov ? s.bg : 'transparent',
                    fontFamily: FONT, fontSize: 11.5,
                    color: isHov ? s.color : 'var(--wdp-ink-mid)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8,
                    transition: 'background 0.12s, border-color 0.12s, color 0.12s',
                  }}
                >
                  <s.icon size={12} strokeWidth={2} style={{ flexShrink: 0, color: isHov ? s.color : 'inherit', opacity: isHov ? 1 : 0.5 }} />
                  <span style={{ flex: 1 }}>{s.label}</span>
                  <span style={{ opacity: isHov ? 0.7 : 0.3, fontSize: 11 }}>→</span>
                </button>
              )
            })}
          </div>
        </div>
      </aside>

      {/* ── Clear Chat Modal ──────────────────────────────────────── */}
      {showClearModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}
          onClick={e => { if (e.target === e.currentTarget) setShowClearModal(false) }}
        >
          <div style={{
            background: 'var(--wdp-surface)',
            border: '1px solid var(--wdp-border)',
            borderRadius: 16,
            padding: '28px 28px 24px',
            width: '100%', maxWidth: 520,
            boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ fontFamily: FONT, fontSize: 16, fontWeight: 700, color: 'var(--wdp-ink)' }}>
                Clear conversation
              </div>
              <button onClick={() => setShowClearModal(false)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--wdp-ink-mid)', display: 'flex', alignItems: 'center',
              }}>
                <X size={18} />
              </button>
            </div>

            {/* Summary */}
            <div style={{
              background: 'var(--wdp-ground)',
              border: '1px solid var(--wdp-border)',
              borderRadius: 10, padding: '14px 16px', marginBottom: 18,
            }}>
              <div style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)', marginBottom: 8 }}>
                Conversation Summary
              </div>
              {clearLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontSize: 12.5, color: 'var(--wdp-ink-mid)' }}>
                  <Loader2 size={13} className="animate-spin" /> Summarizing…
                </div>
              ) : (
                <p style={{ fontFamily: FONT, fontSize: 12.5, color: 'var(--wdp-ink)', lineHeight: 1.6, margin: 0 }}>
                  {clearSummary ?? 'No summary available.'}
                </p>
              )}
            </div>

            {/* Memories */}
            {!clearLoading && clearMemories.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)', marginBottom: 10 }}>
                  Save to Rose Mary&apos;s Memory
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {clearMemories.map((m, mi) => (
                    <label key={mi} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                      background: m.checked ? 'rgba(215,255,16,0.06)' : 'var(--wdp-ground)',
                      border: `1px solid ${m.checked ? 'rgba(215,255,16,0.2)' : 'var(--wdp-border)'}`,
                      borderRadius: 9, padding: '9px 12px',
                      transition: 'background 0.12s, border-color 0.12s',
                    }}>
                      <input
                        type="checkbox"
                        checked={m.checked}
                        onChange={() => setClearMemories(prev => prev.map((item, i) => i === mi ? { ...item, checked: !item.checked } : item))}
                        style={{ width: 14, height: 14, marginTop: 2, accentColor: '#D7FF10', flexShrink: 0 }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: FONT, fontSize: 11.5, color: 'var(--wdp-ink)', lineHeight: 1.5 }}>{m.text}</div>
                        <div style={{ fontFamily: FONT, fontSize: 9.5, color: 'var(--wdp-ink-mid)', marginTop: 2, textTransform: 'capitalize' }}>{m.type}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowClearModal(false)} style={{
                padding: '9px 18px', background: 'transparent',
                border: '1px solid var(--wdp-border)', borderRadius: 9,
                fontFamily: FONT, fontSize: 13, fontWeight: 600, color: 'var(--wdp-ink-mid)', cursor: 'pointer',
              }}>
                Cancel
              </button>
              <button onClick={confirmClearChat} style={{
                padding: '9px 20px', background: 'var(--wdp-neon)',
                border: 'none', borderRadius: 9,
                fontFamily: FONT, fontSize: 13, fontWeight: 700, color: '#000', cursor: 'pointer',
              }}>
                Clear Chat
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

function getTimeOfDay() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
