'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Check, Plus, X, Calendar, GripVertical, AlertCircle, Loader2, FileText, ChevronDown, ChevronUp } from 'lucide-react'
import { Task, TaskStatus } from '@/lib/types'

const FONT  = "'Jost', system-ui, sans-serif"
const SERIF = "'Cormorant Garamond', Georgia, serif"

const PRIORITY_COLOR: Record<string, string> = {
  urgent: '#C14B3A',
  high:   '#B87C1A',
  medium: '#5B6FA0',
  low:    'rgba(100,100,100,0.28)',
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

// ── Quick-add bar ────────────────────────────────────────────────────────────
function QuickAdd({ onAdd }: { onAdd: (title: string, priority: string, due_date: string) => void }) {
  const [value, setValue] = useState('')
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate] = useState('')
  const [showOpts, setShowOpts] = useState(false)

  function submit() {
    const t = value.trim()
    if (!t) return
    onAdd(t, priority, dueDate)
    setValue('')
    setDueDate('')
    setPriority('medium')
    setShowOpts(false)
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
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: showOpts ? 10 : 0 }}>
        <Plus size={18} style={{ color: 'var(--wdp-ink-mid, #747474)', flexShrink: 0 }} />
        <input
          type="text"
          placeholder="Add a task…"
          value={value}
          onChange={e => { setValue(e.target.value); if (!showOpts && e.target.value) setShowOpts(true) }}
          onKeyDown={e => e.key === 'Enter' && submit()}
          onFocus={() => setShowOpts(true)}
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontFamily: FONT, fontSize: 16, color: 'var(--wdp-ink, #2C2C2C)',
          }}
        />
        {value.trim() && (
          <button
            onClick={submit}
            style={{
              background: 'var(--wdp-neon, #D7FF10)',
              border: 'none', borderRadius: 8,
              padding: '6px 16px', cursor: 'pointer',
              fontFamily: FONT, fontSize: 13, fontWeight: 700, color: '#111',
              WebkitTapHighlightColor: 'transparent', flexShrink: 0,
            }}
          >Add</button>
        )}
      </div>

      {/* Options row */}
      {showOpts && (
        <div style={{ borderTop: '1px solid var(--wdp-border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Date picker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={13} style={{ color: 'var(--wdp-ink-mid)', flexShrink: 0 }} />
            <span style={{ fontFamily: FONT, fontSize: 12, color: 'var(--wdp-ink-mid)', flexShrink: 0 }}>Due</span>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              style={{
                flex: 1, border: '1px solid var(--wdp-border)', borderRadius: 8,
                padding: '5px 10px', fontFamily: FONT, fontSize: 16,
                color: 'var(--wdp-ink)', background: 'var(--wdp-ground)',
                outline: 'none',
              }}
            />
            {dueDate && (
              <button onClick={() => setDueDate('')} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--wdp-ink-mid)', display: 'flex' }}>
                <X size={12} />
              </button>
            )}
          </div>

          {/* Priority pills */}
          <div style={{ display: 'flex', gap: 6 }}>
            {(['low','medium','high','urgent'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                style={{
                  flex: 1, padding: '5px 4px', borderRadius: 8, cursor: 'pointer',
                  fontFamily: FONT, fontSize: 11, fontWeight: 600,
                  textTransform: 'capitalize',
                  border: `1px solid ${priority === p ? PRIORITY_COLOR[p] : 'var(--wdp-border)'}`,
                  background: priority === p ? `${PRIORITY_COLOR[p]}18` : 'transparent',
                  color: priority === p ? PRIORITY_COLOR[p] : 'var(--wdp-ink-mid)',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >{p}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Draggable task card ──────────────────────────────────────────────────────
interface TaskCardProps {
  task: Task
  index: number
  isDragging: boolean
  isDragOver: boolean
  onToggle: (t: Task) => void
  onDelete: (id: number) => void
  onEdit: (id: number, title: string) => void
  onUpdateNotes: (id: number, notes: string) => void
  onDragStart: (index: number) => void
  onDragOver: (index: number) => void
  onDragEnd: () => void
  onTouchStart: (e: React.TouchEvent, index: number) => void
}

function TaskCard({ task, index, isDragging, isDragOver, onToggle, onDelete, onEdit, onUpdateNotes, onDragStart, onDragOver, onDragEnd, onTouchStart }: TaskCardProps) {
  const done = task.status === 'done'
  const pcolor = PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR.medium
  const canDragRef = useRef(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(task.title)
  const [showNotes, setShowNotes] = useState(false)
  const [notesValue, setNotesValue] = useState(task.notes ?? '')
  const editInputRef = useRef<HTMLInputElement>(null)

  // Sync external title changes
  useEffect(() => { setEditValue(task.title) }, [task.title])
  useEffect(() => { setNotesValue(task.notes ?? '') }, [task.notes])

  function commitEdit() {
    const val = editValue.trim() || task.title
    setIsEditing(false)
    if (val !== task.title) onEdit(task.id, val)
  }

  function commitNotes() {
    onUpdateNotes(task.id, notesValue)
  }

  return (
    <div
      draggable
      onDragStart={(e) => {
        if (!canDragRef.current) { e.preventDefault(); return }
        onDragStart(index)
      }}
      onDragOver={e => { e.preventDefault(); onDragOver(index) }}
      onDragEnd={() => { canDragRef.current = false; onDragEnd() }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--wdp-surface, #fff)',
        borderRadius: 12,
        border: `1px solid ${isDragOver ? 'var(--wdp-neon, #D7FF10)' : 'var(--wdp-border, rgba(0,0,0,0.08))'}`,
        borderLeft: `3px solid ${isDragOver ? 'var(--wdp-neon, #D7FF10)' : done ? 'rgba(42,122,82,0.35)' : pcolor}`,
        opacity: isDragging ? 0.4 : done ? 0.55 : 1,
        transform: isDragOver ? 'scale(1.01)' : 'scale(1)',
        transition: 'opacity 0.15s, transform 0.1s, border-color 0.15s',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 12px 12px 10px' }}>
        {/* Drag handle — drag only triggers from here */}
        <div
          onMouseDown={() => { canDragRef.current = true }}
          onTouchStart={e => { canDragRef.current = true; onTouchStart(e, index) }}
          style={{ flexShrink: 0, marginTop: 4, cursor: 'grab', touchAction: 'none', padding: '2px 0' }}
        >
          <GripVertical size={14} style={{ color: 'var(--wdp-ink-dim, rgba(44,44,44,0.25))', display: 'block' }} />
        </div>

        {/* Checkbox */}
        <button
          onClick={e => { e.stopPropagation(); onToggle(task) }}
          style={{
            width: 20, height: 20, borderRadius: 5, flexShrink: 0,
            border: `2px solid ${done ? '#2A7A52' : 'var(--wdp-border, rgba(0,0,0,0.2))'}`,
            background: done ? 'rgba(42,122,82,0.12)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', marginTop: 2,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {done && <Check size={11} strokeWidth={3} style={{ color: '#2A7A52' }} />}
        </button>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {isEditing ? (
            <input
              ref={editInputRef}
              autoFocus
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={e => {
                if (e.key === 'Enter') commitEdit()
                if (e.key === 'Escape') { setEditValue(task.title); setIsEditing(false) }
              }}
              style={{
                width: '100%', border: 'none', borderBottom: '1.5px solid var(--wdp-accent, #C27A54)',
                outline: 'none', background: 'transparent',
                fontFamily: FONT, fontSize: 16, fontWeight: 500,
                color: 'var(--wdp-ink, #2C2C2C)', padding: '0 0 2px', marginBottom: 3,
              }}
            />
          ) : (
            <div
              onClick={() => { if (!done) setIsEditing(true) }}
              style={{
                fontFamily: FONT, fontSize: 14, fontWeight: 500,
                color: 'var(--wdp-ink, #2C2C2C)',
                textDecoration: done ? 'line-through' : 'none',
                lineHeight: 1.35, marginBottom: 3,
                cursor: done ? 'default' : 'text',
              }}
            >
              {task.title}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
            {/* Notes toggle */}
            <button
              onClick={() => setShowNotes(p => !p)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontFamily: FONT, fontSize: 11, fontWeight: 500,
                color: (task.notes || notesValue) ? 'var(--wdp-ink-mid)' : 'var(--wdp-ink-dim, rgba(44,44,44,0.3))',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <FileText size={10} />
              {showNotes ? 'Hide notes' : (task.notes ? 'Notes' : 'Add notes')}
            </button>
          </div>
        </div>

        {/* Delete */}
        <button
          onClick={e => { e.stopPropagation(); onDelete(task.id) }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--wdp-ink-dim, rgba(44,44,44,0.22))',
            padding: 4, flexShrink: 0, display: 'flex', marginTop: 1,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <X size={13} />
        </button>
      </div>

      {/* Notes area */}
      {showNotes && (
        <div style={{
          borderTop: '1px solid var(--wdp-border)',
          padding: '10px 12px 12px 42px',
        }}>
          <textarea
            value={notesValue}
            onChange={e => setNotesValue(e.target.value)}
            onBlur={commitNotes}
            placeholder="Add notes, links, or context…"
            rows={3}
            style={{
              width: '100%', border: '1px solid var(--wdp-border)',
              borderRadius: 8, padding: '8px 10px',
              fontFamily: FONT, fontSize: 14,
              color: 'var(--wdp-ink)', background: 'var(--wdp-ground)',
              outline: 'none', resize: 'vertical', lineHeight: 1.5,
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}
    </div>
  )
}

// ── Overdue strip ────────────────────────────────────────────────────────────
function Overdue({ tasks }: { tasks: Task[] }) {
  const now = new Date(); now.setHours(0,0,0,0)
  const count = tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date + 'T12:00:00') < now).length
  if (!count) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
      padding: '9px 13px', borderRadius: 10,
      background: 'rgba(193,75,58,0.07)', border: '1px solid rgba(193,75,58,0.2)',
    }}>
      <AlertCircle size={13} style={{ color: '#C14B3A', flexShrink: 0 }} />
      <span style={{ fontFamily: FONT, fontSize: 13, color: '#C14B3A', fontWeight: 600 }}>
        {count} overdue task{count > 1 ? 's' : ''}
      </span>
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function TasksPage() {
  const [tasks, setTasks]     = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState<TaskStatus | 'all'>('all')

  // Drag state
  const [dragIndex, setDragIndex]   = useState<number | null>(null)
  const [dragOver, setDragOver]     = useState<number | null>(null)
  // Touch drag state
  const touchDragIndex = useRef<number | null>(null)
  const touchStartY    = useRef(0)
  const listRef        = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/tasks').then(r => r.json()).then((d: Task[]) => { setTasks(d); setLoading(false) })
  }, [])

  // ── Persist reorder ──────────────────────────────────────────────────────
  const saveOrder = useCallback((ordered: Task[]) => {
    const payload = ordered.map((t, i) => ({ id: t.id, sort_order: i }))
    fetch('/api/tasks/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: payload }),
    }).catch(() => {})
  }, [])

  // ── HTML5 drag handlers ──────────────────────────────────────────────────
  function handleDragStart(index: number) {
    setDragIndex(index)
  }
  function handleDragOver(index: number) {
    if (dragIndex === null || dragIndex === index) return
    setDragOver(index)
  }
  function handleDragEnd() {
    if (dragIndex !== null && dragOver !== null && dragIndex !== dragOver) {
      const next = [...active]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(dragOver, 0, moved)
      const newTasks = [...next, ...done]
      setTasks(newTasks)
      saveOrder(newTasks)
    }
    setDragIndex(null)
    setDragOver(null)
  }

  // ── Touch drag handlers ──────────────────────────────────────────────────
  function handleTouchStart(e: React.TouchEvent, index: number) {
    touchDragIndex.current = index
    touchStartY.current = e.touches[0].clientY
  }

  useEffect(() => {
    function onTouchMove(e: TouchEvent) {
      if (touchDragIndex.current === null) return
      e.preventDefault()
      const y = e.touches[0].clientY
      if (!listRef.current) return
      const cards = listRef.current.querySelectorAll('[data-task-card]')
      let overIndex: number | null = null
      cards.forEach((el, i) => {
        const rect = el.getBoundingClientRect()
        if (y >= rect.top && y <= rect.bottom) overIndex = i
      })
      if (overIndex !== null) setDragOver(overIndex)
      setDragIndex(touchDragIndex.current)
    }
    function onTouchEnd() {
      if (touchDragIndex.current !== null) handleDragEnd()
      touchDragIndex.current = null
    }
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
    return () => {
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragIndex, dragOver, tasks])

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

  async function handleAdd(title: string, priority: string, due_date: string) {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, priority, status: 'todo', due_date: due_date || null }),
    })
    if (res.ok) {
      const created = await res.json()
      setTasks(prev => [created, ...prev])
    }
  }

  async function handleEdit(id: number, title: string) {
    const task = tasks.find(t => t.id === id)
    if (!task || task.title === title) return
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...task, title }),
    })
    if (res.ok) {
      const updated = await res.json()
      setTasks(prev => prev.map(t => t.id === updated.id ? { ...updated, project_name: t.project_name, project_color: t.project_color } : t))
    }
  }

  async function handleUpdateNotes(id: number, notes: string) {
    const task = tasks.find(t => t.id === id)
    if (!task) return
    await fetch(`/api/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...task, notes }),
    })
    setTasks(prev => prev.map(t => t.id === id ? { ...t, notes } : t))
  }

  const visible = tasks.filter(t => filter === 'all' || t.status === filter)
  const active  = visible.filter(t => t.status !== 'done')
  const done    = visible.filter(t => t.status === 'done')
  const activeCount = tasks.filter(t => t.status !== 'done').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        padding: '20px 16px 14px',
        borderBottom: '1px solid var(--wdp-border)',
        flexShrink: 0,
        background: 'var(--wdp-ground)',
      }}>
        <p style={{ fontFamily: FONT, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)', marginBottom: 3 }}>
          Work Tracker
        </p>
        <h1 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, color: 'var(--wdp-ink)', margin: '0 0 4px', letterSpacing: '-0.3px', lineHeight: 1.1 }}>
          Tasks
        </h1>
        <p style={{ fontFamily: FONT, fontSize: 12, color: 'var(--wdp-ink-mid)', margin: 0 }}>
          {activeCount > 0 ? `${activeCount} active` : 'All clear'}
        </p>

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 5, marginTop: 12, overflowX: 'auto', paddingBottom: 2 }}>
          {FILTERS.map(f => (
            <button
              key={f.v}
              onClick={() => setFilter(f.v)}
              style={{
                whiteSpace: 'nowrap', padding: '5px 13px', borderRadius: 99,
                fontFamily: FONT, fontSize: 12,
                fontWeight: filter === f.v ? 600 : 400,
                border: '1px solid',
                borderColor: filter === f.v ? 'var(--wdp-ink, #2C2C2C)' : 'var(--wdp-border)',
                background: filter === f.v ? 'var(--wdp-ink, #2C2C2C)' : 'transparent',
                color: filter === f.v ? 'var(--wdp-ground, #FAF9F6)' : 'var(--wdp-ink-mid)',
                cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              }}
            >{f.label}</button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 40px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--wdp-ink-mid)', fontFamily: FONT, fontSize: 13, padding: '20px 4px' }}>
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <QuickAdd onAdd={handleAdd} />
            <Overdue tasks={tasks} />

            <div ref={listRef} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {active.map((t, i) => (
                <div key={t.id} data-task-card>
                  <TaskCard
                    task={t} index={i}
                    isDragging={dragIndex === i}
                    isDragOver={dragOver === i}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                    onEdit={handleEdit}
                    onUpdateNotes={handleUpdateNotes}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={handleDragEnd}
                    onTouchStart={handleTouchStart}
                  />
                </div>
              ))}
            </div>

            {done.length > 0 && (
              <>
                <div style={{ height: 1, background: 'var(--wdp-border)', margin: '18px 0 14px' }} />
                <p style={{ fontFamily: FONT, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wdp-ink-dim)', marginBottom: 8 }}>
                  Completed · {done.length}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {done.map((t, i) => (
                    <div key={t.id} data-task-card>
                      <TaskCard
                        task={t} index={active.length + i}
                        isDragging={false} isDragOver={false}
                        onToggle={handleToggle}
                        onDelete={handleDelete}
                        onEdit={handleEdit}
                        onUpdateNotes={handleUpdateNotes}
                        onDragStart={() => {}}
                        onDragOver={() => {}}
                        onDragEnd={() => {}}
                        onTouchStart={() => {}}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}

            {visible.length === 0 && !loading && (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--wdp-ink-mid)', fontFamily: FONT, fontSize: 14 }}>
                {activeCount === 0 ? 'Add your first task above.' : 'No tasks match this filter.'}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
