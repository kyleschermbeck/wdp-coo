'use client'

import { useEffect, useState, useRef } from 'react'
import { Check, Plus, X, Calendar, ChevronDown, AlertCircle, Loader2 } from 'lucide-react'
import { Task, TaskStatus } from '@/lib/types'

const FONT  = "'Jost', system-ui, sans-serif"
const SERIF = "'Cormorant Garamond', Georgia, serif"

const PRIORITY_COLOR: Record<string, string> = {
  urgent: '#C14B3A',
  high:   '#B87C1A',
  medium: '#5B6FA0',
  low:    'rgba(100,100,100,0.35)',
}

const FILTERS: Array<{ v: TaskStatus | 'all'; label: string }> = [
  { v: 'all',         label: 'All' },
  { v: 'todo',        label: 'To do' },
  { v: 'in_progress', label: 'In progress' },
  { v: 'done',        label: 'Done' },
]

function fmtDate(iso: string) {
  const d = new Date(iso + 'T12:00:00')
  const now = new Date(); now.setHours(0,0,0,0)
  const isOverdue = d < now
  const isToday   = d.toDateString() === now.toDateString()
  const label = isToday ? 'Today' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return { label, isOverdue, isToday }
}

// ── Task card ────────────────────────────────────────────────────────────────
function TaskCard({ task, onToggle, onDelete }: {
  task: Task
  onToggle: (t: Task) => void
  onDelete: (id: number) => void
}) {
  const done = task.status === 'done'
  const pcolor = PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR.medium

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '14px 16px',
        background: 'var(--wdp-surface, #fff)',
        borderRadius: 12,
        border: '1px solid var(--wdp-border, rgba(0,0,0,0.08))',
        borderLeft: `3px solid ${done ? 'rgba(42,122,82,0.4)' : pcolor}`,
        opacity: done ? 0.55 : 1,
        transition: 'opacity 0.2s',
        position: 'relative',
      }}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle(task)}
        style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
          border: `2px solid ${done ? '#2A7A52' : 'var(--wdp-border, rgba(0,0,0,0.2))'}`,
          background: done ? 'rgba(42,122,82,0.12)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', marginTop: 1,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {done && <Check size={12} strokeWidth={3} style={{ color: '#2A7A52' }} />}
      </button>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: FONT, fontSize: 15, fontWeight: 500,
          color: 'var(--wdp-ink, #2C2C2C)',
          textDecoration: done ? 'line-through' : 'none',
          lineHeight: 1.3,
          marginBottom: 4,
        }}>
          {task.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {task.project_name && (
            <span style={{ fontFamily: FONT, fontSize: 11, color: 'var(--wdp-ink-mid, #747474)' }}>
              {task.project_name}
            </span>
          )}
          {task.due_date && (() => {
            const { label, isOverdue, isToday } = fmtDate(task.due_date)
            return (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontFamily: FONT, fontSize: 11,
                color: isOverdue ? '#C14B3A' : isToday ? '#B87C1A' : 'var(--wdp-ink-mid, #747474)',
                fontWeight: isOverdue || isToday ? 600 : 400,
              }}>
                <Calendar size={10} />
                {label}
              </span>
            )
          })()}
          {task.priority && task.priority !== 'medium' && (
            <span style={{
              fontFamily: FONT, fontSize: 10, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              color: pcolor,
            }}>
              {task.priority}
            </span>
          )}
        </div>
      </div>

      {/* Delete */}
      <button
        onClick={() => onDelete(task.id)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--wdp-ink-dim, rgba(44,44,44,0.28))',
          padding: 4, flexShrink: 0, display: 'flex',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <X size={14} />
      </button>
    </div>
  )
}

// ── Quick-add bar ────────────────────────────────────────────────────────────
function QuickAdd({ onAdd }: { onAdd: (title: string, priority: string) => void }) {
  const [value, setValue] = useState('')
  const [priority, setPriority] = useState('medium')
  const [showOpts, setShowOpts] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function submit() {
    const t = value.trim()
    if (!t) return
    onAdd(t, priority)
    setValue('')
  }

  return (
    <div style={{
      background: 'var(--wdp-surface, #fff)',
      border: '1px solid var(--wdp-border, rgba(0,0,0,0.1))',
      borderRadius: 14,
      padding: '10px 12px',
      marginBottom: 20,
      boxShadow: '0 1px 8px rgba(44,44,44,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Plus size={18} style={{ color: 'var(--wdp-ink-mid, #747474)', flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          placeholder="Add a task…"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontFamily: FONT, fontSize: 15, color: 'var(--wdp-ink, #2C2C2C)',
          }}
        />
        {/* Priority toggle */}
        <button
          onClick={() => setShowOpts(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: 3,
            background: 'var(--wdp-ground, #FAF9F6)',
            border: '1px solid var(--wdp-border)',
            borderRadius: 8, padding: '4px 8px', cursor: 'pointer',
            fontFamily: FONT, fontSize: 11,
            color: PRIORITY_COLOR[priority] ?? 'var(--wdp-ink-mid)',
            fontWeight: 600,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {priority}
          <ChevronDown size={10} />
        </button>
        {value.trim() && (
          <button
            onClick={submit}
            style={{
              background: 'var(--wdp-neon, #D7FF10)',
              border: 'none', borderRadius: 8,
              padding: '6px 14px', cursor: 'pointer',
              fontFamily: FONT, fontSize: 13, fontWeight: 700, color: '#111',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            Add
          </button>
        )}
      </div>

      {showOpts && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--wdp-border)' }}>
          {(['low','medium','high','urgent'] as const).map(p => (
            <button
              key={p}
              onClick={() => { setPriority(p); setShowOpts(false) }}
              style={{
                flex: 1, padding: '6px 4px', borderRadius: 8, cursor: 'pointer',
                fontFamily: FONT, fontSize: 11, fontWeight: 700,
                textTransform: 'capitalize',
                border: `1px solid ${priority === p ? PRIORITY_COLOR[p] : 'var(--wdp-border)'}`,
                background: priority === p ? `${PRIORITY_COLOR[p]}18` : 'transparent',
                color: PRIORITY_COLOR[p],
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Alert strip ──────────────────────────────────────────────────────────────
function Overdue({ tasks }: { tasks: Task[] }) {
  const now = new Date(); now.setHours(0,0,0,0)
  const count = tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date + 'T12:00:00') < now).length
  if (!count) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
      padding: '10px 14px', borderRadius: 10,
      background: 'rgba(193,75,58,0.07)',
      border: '1px solid rgba(193,75,58,0.2)',
    }}>
      <AlertCircle size={14} style={{ color: '#C14B3A', flexShrink: 0 }} />
      <span style={{ fontFamily: FONT, fontSize: 13, color: '#C14B3A', fontWeight: 600 }}>
        {count} overdue task{count > 1 ? 's' : ''}
      </span>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function TasksPage() {
  const [tasks, setTasks]   = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all')

  useEffect(() => {
    fetch('/api/tasks').then(r => r.json()).then(d => { setTasks(d); setLoading(false) })
  }, [])

  async function handleToggle(task: Task) {
    const next: TaskStatus = task.status === 'done' ? 'todo' : 'done'
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...task, status: next }),
    })
    const updated = await res.json()
    setTasks(prev => prev.map(t => t.id === updated.id ? { ...updated, project_name: t.project_name, project_color: t.project_color } : t))
  }

  async function handleDelete(id: number) {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  async function handleAdd(title: string, priority: string) {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, priority, status: 'todo' }),
    })
    if (res.ok) {
      const created = await res.json()
      setTasks(prev => [created, ...prev])
    }
  }

  const visible = tasks.filter(t => filter === 'all' || t.status === filter)
  const active  = visible.filter(t => t.status !== 'done')
  const done    = visible.filter(t => t.status === 'done')

  const activeCount = tasks.filter(t => t.status !== 'done').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        padding: '24px 20px 16px',
        borderBottom: '1px solid var(--wdp-border)',
        flexShrink: 0,
        background: 'var(--wdp-ground)',
      }}>
        <p style={{ fontFamily: FONT, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)', marginBottom: 3 }}>
          Work Tracker
        </p>
        <h1 style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 700, color: 'var(--wdp-ink)', margin: '0 0 4px', letterSpacing: '-0.3px', lineHeight: 1.1 }}>
          Tasks
        </h1>
        <p style={{ fontFamily: FONT, fontSize: 12, color: 'var(--wdp-ink-mid)', margin: 0 }}>
          {activeCount} active
        </p>

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 6, marginTop: 14, overflowX: 'auto', paddingBottom: 2 }}>
          {FILTERS.map(f => (
            <button
              key={f.v}
              onClick={() => setFilter(f.v)}
              style={{
                whiteSpace: 'nowrap',
                padding: '6px 14px', borderRadius: 99,
                fontFamily: FONT, fontSize: 12,
                fontWeight: filter === f.v ? 600 : 400,
                border: '1px solid',
                borderColor: filter === f.v ? 'var(--wdp-ink, #2C2C2C)' : 'var(--wdp-border)',
                background: filter === f.v ? 'var(--wdp-ink, #2C2C2C)' : 'transparent',
                color: filter === f.v ? 'var(--wdp-ground, #FAF9F6)' : 'var(--wdp-ink-mid)',
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 40px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--wdp-ink-mid)', fontFamily: FONT, fontSize: 13, padding: '20px 4px' }}>
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <QuickAdd onAdd={handleAdd} />
            <Overdue tasks={tasks} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {active.map(t => (
                <TaskCard key={t.id} task={t} onToggle={handleToggle} onDelete={handleDelete} />
              ))}
            </div>

            {done.length > 0 && (
              <>
                {active.length > 0 && (
                  <div style={{ height: 1, background: 'var(--wdp-border)', margin: '20px 0 16px' }} />
                )}
                <p style={{ fontFamily: FONT, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wdp-ink-dim)', marginBottom: 10 }}>
                  Completed
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {done.map(t => (
                    <TaskCard key={t.id} task={t} onToggle={handleToggle} onDelete={handleDelete} />
                  ))}
                </div>
              </>
            )}

            {visible.length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--wdp-ink-mid)', fontFamily: FONT, fontSize: 14 }}>
                No tasks here.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
