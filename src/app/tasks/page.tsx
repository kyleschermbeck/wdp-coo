'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  Check, Calendar, ExternalLink, ChevronDown, ChevronRight,
  AlertCircle, Loader2, Folder, Search, X,
} from 'lucide-react'
import { Task, Subtask, TaskStatus, TaskPriority } from '@/lib/types'
import { TaskDetailDrawer } from '@/components/projects/TaskDetailDrawer'
import { SubtaskDetailDrawer } from '@/components/projects/SubtaskDetailDrawer'

const FONT  = "'Jost', system-ui, sans-serif"
const SERIF = "'Cormorant Garamond', Georgia, serif"

// ── Priority colors (matching chat screen) ──────────────────────────────────
const PRIORITY_BORDER: Record<string, string> = {
  urgent:  '#C14B3A',
  high:    '#B87C1A',
  medium:  'var(--wdp-border)',
  low:     'var(--wdp-border)',
}
const PRIORITY_PILL: Record<string, { bg: string; text: string }> = {
  urgent:  { bg: 'rgba(193,75,58,0.12)',  text: '#C14B3A' },
  high:    { bg: 'rgba(184,124,26,0.12)', text: '#8A5E10' },
  medium:  { bg: 'rgba(80,110,180,0.10)', text: '#4A6499' },
  low:     { bg: 'rgba(100,100,100,0.08)',text: '#888'    },
}

// ── Project color dots ──────────────────────────────────────────────────────
const PROJECT_COLORS: Record<string, string> = {
  sage:       '#7A9E87',
  terracotta: '#C27A54',
  blueberry:  '#5B6FA0',
  butter:     '#C8A840',
  tomato:     '#C14B3A',
  thyme:      '#5A7A5A',
  candy:      '#C05878',
  citrus:     '#C07830',
}

function dot(color: string) {
  return PROJECT_COLORS[color] ?? '#999'
}

// ── Date pill ───────────────────────────────────────────────────────────────
function DateBadge({ date, done }: { date: string; done: boolean }) {
  const d = new Date(date + 'T12:00:00')
  const now = new Date(); now.setHours(0,0,0,0)
  const isOverdue = !done && d < now
  const isToday   = !done && d.toDateString() === now.toDateString()
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 11, fontFamily: FONT,
      color: isOverdue ? '#C14B3A' : isToday ? '#B87C1A' : 'var(--wdp-ink-mid)',
      fontWeight: isOverdue || isToday ? 600 : 400,
    }}>
      <Calendar size={10} />
      {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
    </span>
  )
}

// ── Subtask row inside expanded task ────────────────────────────────────────
function SubtaskRow({ subtask, onUpdate }: { subtask: Subtask; onUpdate: (s: Subtask) => void }) {
  const isDone = subtask.status === 'done' || subtask.completed

  async function toggle() {
    const next: TaskStatus = isDone ? 'todo' : 'done'
    const res = await fetch(`/api/subtasks/${subtask.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...subtask, status: next, completed: !isDone }),
    })
    onUpdate(await res.json())
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '5px 0', opacity: isDone ? 0.5 : 1,
    }}>
      <div onClick={toggle} style={{
        width: 14, height: 14, borderRadius: 3, flexShrink: 0, cursor: 'pointer',
        border: `1.5px solid ${isDone ? '#2A7A52' : 'var(--wdp-border)'}`,
        background: isDone ? 'rgba(42,122,82,0.15)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isDone && <Check size={8} strokeWidth={3} style={{ color: '#2A7A52' }} />}
      </div>
      <span style={{
        flex: 1, fontSize: 12, fontFamily: FONT, color: 'var(--wdp-ink)',
        textDecoration: isDone ? 'line-through' : 'none',
      }}>{subtask.title}</span>
      {subtask.due_date && <DateBadge date={subtask.due_date} done={isDone} />}
    </div>
  )
}

// ── Single task row ─────────────────────────────────────────────────────────
interface TaskRowProps {
  task: Task
  subtasks: Subtask[]
  onUpdate: (t: Task) => void
  onUpdateSubtask: (s: Subtask) => void
  onOpen: (t: Task) => void
}

function TaskRow({ task, subtasks, onUpdate, onUpdateSubtask, onOpen }: TaskRowProps) {
  const [expanded, setExpanded] = useState(false)
  const isDone = task.status === 'done'
  const pc = PRIORITY_PILL[task.priority] ?? PRIORITY_PILL.medium
  const border = PRIORITY_BORDER[task.priority] ?? 'var(--wdp-border)'
  const mySubs = subtasks.filter(s => s.task_id === task.id)
  const doneSubs = mySubs.filter(s => s.status === 'done' || s.completed).length

  async function toggleDone() {
    const next: TaskStatus = isDone ? 'todo' : 'done'
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...task, status: next }),
    })
    onUpdate(await res.json())
  }

  return (
    <div style={{
      borderRadius: 9,
      borderTop: '1px solid var(--wdp-border)',
      borderRight: '1px solid var(--wdp-border)',
      borderBottom: '1px solid var(--wdp-border)',
      borderLeft: `3px solid ${isDone ? '#2A7A52' : border}`,
      background: 'var(--wdp-surface)',
      overflow: 'hidden',
      opacity: isDone ? 0.6 : 1,
      transition: 'opacity 0.2s',
    }}>
      {/* Main row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px' }}>
        {/* Checkbox */}
        <div onClick={toggleDone} style={{
          width: 16, height: 16, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
          border: `2px solid ${isDone ? '#2A7A52' : 'var(--wdp-border)'}`,
          background: isDone ? 'rgba(42,122,82,0.15)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {isDone && <Check size={9} strokeWidth={3} style={{ color: '#2A7A52' }} />}
        </div>

        {/* Title */}
        <span
          onClick={() => mySubs.length > 0 ? setExpanded(e => !e) : onOpen(task)}
          style={{
            flex: 1, fontSize: 13, fontWeight: 500, fontFamily: FONT,
            color: isDone ? 'var(--wdp-ink-mid)' : 'var(--wdp-ink)',
            textDecoration: isDone ? 'line-through' : 'none',
            cursor: 'pointer', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >{task.title}</span>

        {/* Subtask count */}
        {mySubs.length > 0 && (
          <button onClick={() => setExpanded(e => !e)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 10, fontFamily: FONT, cursor: 'pointer',
            padding: '2px 7px', borderRadius: 99, border: '1px solid var(--wdp-border)',
            background: 'var(--wdp-ground)', color: 'var(--wdp-ink-mid)',
            flexShrink: 0,
          }}>
            {doneSubs}/{mySubs.length}
            {expanded ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
          </button>
        )}

        {/* Priority pill */}
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
          padding: '2px 7px', borderRadius: 99, background: pc.bg, color: pc.text, flexShrink: 0,
        }}>{task.priority}</span>

        {/* Due date */}
        {task.due_date && <DateBadge date={task.due_date} done={isDone} />}

        {/* Open detail */}
        <button onClick={() => onOpen(task)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--wdp-ink-mid)', padding: 2, flexShrink: 0,
          display: 'flex', alignItems: 'center',
        }}>
          <ExternalLink size={12} />
        </button>
      </div>

      {/* Expanded subtasks */}
      {expanded && mySubs.length > 0 && (
        <div style={{
          borderTop: '1px solid var(--wdp-border)',
          padding: '8px 12px 10px 40px',
          background: 'var(--wdp-ground)',
          display: 'flex', flexDirection: 'column',
        }}>
          {mySubs.map(s => (
            <SubtaskRow key={s.id} subtask={s} onUpdate={onUpdateSubtask} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Project group (collapsible) ─────────────────────────────────────────────
interface ProjectGroupProps {
  project: { id: number; name: string; color: string }
  tasks: Task[]
  subtasks: Subtask[]
  statusFilter: TaskStatus | 'all'
  search: string
  onUpdate: (t: Task) => void
  onUpdateSubtask: (s: Subtask) => void
  onOpen: (t: Task) => void
  defaultOpen?: boolean
}

function ProjectGroup({ project, tasks, subtasks, statusFilter, search, onUpdate, onUpdateSubtask, onOpen, defaultOpen = true }: ProjectGroupProps) {
  const [open, setOpen] = useState(defaultOpen)

  const filtered = useMemo(() => tasks.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [tasks, statusFilter, search])

  const active = filtered.filter(t => t.status !== 'done')
  const done   = filtered.filter(t => t.status === 'done')
  const total  = tasks.length
  const doneCount = tasks.filter(t => t.status === 'done').length
  const pct = total > 0 ? Math.round(doneCount / total * 100) : 0

  if (filtered.length === 0 && (statusFilter !== 'all' || search)) return null

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Project header */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '8px 4px', marginBottom: open ? 10 : 0,
          textAlign: 'left',
        }}
      >
        <div style={{
          width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
          background: dot(project.color),
        }} />
        <span style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 700, color: 'var(--wdp-ink)', letterSpacing: '-0.2px', flex: 1 }}>
          {project.name}
        </span>
        <span style={{ fontFamily: FONT, fontSize: 11, color: 'var(--wdp-ink-mid)' }}>
          {doneCount}/{total}
        </span>
        {/* Progress bar */}
        <div style={{ width: 60, height: 4, borderRadius: 99, background: 'var(--wdp-border)', flexShrink: 0 }}>
          <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: dot(project.color), transition: 'width 0.3s' }} />
        </div>
        {open ? <ChevronDown size={14} style={{ color: 'var(--wdp-ink-mid)', flexShrink: 0 }} />
               : <ChevronRight size={14} style={{ color: 'var(--wdp-ink-mid)', flexShrink: 0 }} />}
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {active.map(t => (
            <TaskRow key={t.id} task={t} subtasks={subtasks} onUpdate={onUpdate} onUpdateSubtask={onUpdateSubtask} onOpen={onOpen} />
          ))}
          {done.length > 0 && active.length > 0 && (
            <div style={{ height: 1, background: 'var(--wdp-border)', margin: '6px 0' }} />
          )}
          {done.map(t => (
            <TaskRow key={t.id} task={t} subtasks={subtasks} onUpdate={onUpdate} onUpdateSubtask={onUpdateSubtask} onOpen={onOpen} />
          ))}
          {filtered.length === 0 && (
            <p style={{ fontFamily: FONT, fontSize: 12, color: 'var(--wdp-ink-mid)', padding: '6px 4px' }}>No tasks match your filter.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Needs Attention: overdue + due today ────────────────────────────────────
function NeedsAttention({ tasks, onOpen }: { tasks: Task[]; onOpen: (t: Task) => void }) {
  const now = new Date(); now.setHours(0,0,0,0)
  const flagged = tasks.filter(t => {
    if (t.status === 'done' || !t.due_date) return false
    const d = new Date(t.due_date + 'T12:00:00')
    return d <= new Date(now.getTime() + 24*60*60*1000) // today or overdue
  }).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))

  if (flagged.length === 0) return null

  return (
    <div style={{
      borderRadius: 10,
      borderTop: '1px solid rgba(193,75,58,0.25)',
      borderRight: '1px solid rgba(193,75,58,0.25)',
      borderBottom: '1px solid rgba(193,75,58,0.25)',
      borderLeft: '3px solid #C14B3A',
      background: 'rgba(193,75,58,0.04)',
      padding: '12px 14px', marginBottom: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <AlertCircle size={13} style={{ color: '#C14B3A', flexShrink: 0 }} />
        <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#C14B3A' }}>
          Needs Attention · {flagged.length}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {flagged.map(t => {
          const d = new Date(t.due_date! + 'T12:00:00')
          const isOverdue = d < now
          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
              <span style={{
                fontSize: 10, fontFamily: FONT, fontWeight: 600, padding: '1px 6px', borderRadius: 99,
                background: isOverdue ? 'rgba(193,75,58,0.12)' : 'rgba(184,124,26,0.12)',
                color: isOverdue ? '#C14B3A' : '#8A5E10', flexShrink: 0,
              }}>{isOverdue ? 'Overdue' : 'Today'}</span>
              <span style={{ flex: 1, fontSize: 12, fontFamily: FONT, color: 'var(--wdp-ink)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.title}
              </span>
              {t.project_name && (
                <span style={{ fontSize: 11, color: 'var(--wdp-ink-mid)', fontFamily: FONT, flexShrink: 0 }}>{t.project_name}</span>
              )}
              <button onClick={() => onOpen(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--wdp-ink-mid)', display: 'flex', padding: 2 }}>
                <ExternalLink size={11} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Status pill filter ──────────────────────────────────────────────────────
function StatusPills({ value, onChange }: { value: TaskStatus | 'all'; onChange: (v: TaskStatus | 'all') => void }) {
  const opts: Array<{ v: TaskStatus | 'all'; label: string }> = [
    { v: 'all', label: 'All' },
    { v: 'todo', label: 'To Do' },
    { v: 'in_progress', label: 'In Progress' },
    { v: 'review', label: 'Review' },
    { v: 'done', label: 'Done' },
  ]
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {opts.map(o => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          style={{
            padding: '5px 13px', borderRadius: 99, fontSize: 12, fontFamily: FONT,
            fontWeight: value === o.v ? 600 : 400,
            border: '1px solid',
            borderColor: value === o.v ? 'var(--wdp-neon, #D7FF10)' : 'var(--wdp-border)',
            background: value === o.v ? 'var(--wdp-neon, #D7FF10)' : 'var(--wdp-surface)',
            color: value === o.v ? '#111' : 'var(--wdp-ink)',
            cursor: 'pointer', transition: 'all 0.15s',
          }}
        >{o.label}</button>
      ))}
    </div>
  )
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function AllTasksPage() {
  const [tasks,    setTasks]    = useState<Task[]>([])
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [loading,  setLoading]  = useState(true)
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [drawerTask,    setDrawerTask]    = useState<Task | null>(null)
  const [drawerSubtask, setDrawerSubtask] = useState<Subtask | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/tasks').then(r => r.json()),
      fetch('/api/subtasks').then(r => r.json()),
    ]).then(([t, s]) => {
      setTasks(t)
      setSubtasks(s)
      setLoading(false)
    })
  }, [])

  // Derive ordered project list from tasks
  const projects = useMemo(() => {
    const seen = new Map<number, { id: number; name: string; color: string }>()
    for (const t of tasks) {
      if (t.project_id && t.project_name && !seen.has(t.project_id)) {
        seen.set(t.project_id, { id: t.project_id, name: t.project_name, color: t.project_color ?? 'sage' })
      }
    }
    return Array.from(seen.values())
  }, [tasks])

  const tasksByProject = useMemo(() => {
    const map: Record<number, Task[]> = {}
    for (const t of tasks) {
      if (!t.project_id) continue
      if (!map[t.project_id]) map[t.project_id] = []
      map[t.project_id].push(t)
    }
    return map
  }, [tasks])

  const activeCount = tasks.filter(t => t.status !== 'done').length
  const overdueCount = tasks.filter(t => {
    if (t.status === 'done' || !t.due_date) return false
    const d = new Date(t.due_date + 'T12:00:00')
    const now = new Date(); now.setHours(0,0,0,0)
    return d < now
  }).length

  function handleUpdate(updated: Task) {
    setTasks(prev => prev.map(t => t.id === updated.id ? { ...updated, project_name: t.project_name, project_color: t.project_color } : t))
  }
  function handleUpdateSubtask(updated: Subtask) {
    setSubtasks(prev => prev.map(s => s.id === updated.id ? updated : s))
  }
  function handleDelete(id: number) {
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  return (
    <>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{
          padding: '28px 36px 20px',
          borderBottom: '1px solid var(--wdp-border)',
          flexShrink: 0,
        }}>
          <p style={{ fontFamily: FONT, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)', marginBottom: 4 }}>
            Work Tracker
          </p>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
            <div>
              <h1 style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 700, color: 'var(--wdp-ink)', letterSpacing: '-0.4px', lineHeight: 1.1, margin: 0 }}>
                Projects &amp; Tasks
              </h1>
              <p style={{ fontFamily: FONT, fontSize: 12, color: 'var(--wdp-ink-mid)', marginTop: 5 }}>
                {activeCount} active
                {overdueCount > 0 && <span style={{ color: '#C14B3A', fontWeight: 600 }}> · {overdueCount} overdue</span>}
              </p>
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <StatusPills value={statusFilter} onChange={setStatusFilter} />

            {/* Search */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              border: '1px solid var(--wdp-border)', borderRadius: 99,
              padding: '5px 12px', background: 'var(--wdp-surface)',
              marginLeft: 'auto',
            }}>
              <Search size={12} style={{ color: 'var(--wdp-ink-mid)', flexShrink: 0 }} />
              <input
                type="text"
                placeholder="Search tasks…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  border: 'none', outline: 'none', background: 'transparent',
                  fontFamily: FONT, fontSize: 12, color: 'var(--wdp-ink)',
                  width: 160,
                }}
              />
              {search && (
                <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--wdp-ink-mid)' }}>
                  <X size={11} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 36px 40px' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--wdp-ink-mid)', fontFamily: FONT, fontSize: 13 }}>
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : (
            <>
              {/* Needs Attention section */}
              {!search && statusFilter === 'all' && (
                <NeedsAttention tasks={tasks} onOpen={setDrawerTask} />
              )}

              {/* Project groups */}
              {projects.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 48, color: 'var(--wdp-ink-mid)' }}>
                  <Folder size={32} strokeWidth={1.5} />
                  <p style={{ fontFamily: FONT, fontSize: 14 }}>No projects yet.</p>
                </div>
              ) : (
                projects.map(p => (
                  <ProjectGroup
                    key={p.id}
                    project={p}
                    tasks={tasksByProject[p.id] ?? []}
                    subtasks={subtasks}
                    statusFilter={statusFilter}
                    search={search}
                    onUpdate={handleUpdate}
                    onUpdateSubtask={handleUpdateSubtask}
                    onOpen={setDrawerTask}
                    defaultOpen={true}
                  />
                ))
              )}
            </>
          )}
        </div>
      </div>

      <TaskDetailDrawer
        task={drawerTask}
        onClose={() => setDrawerTask(null)}
        onUpdate={updated => { handleUpdate(updated); setDrawerTask(updated) }}
        onDelete={async id => {
          await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
          handleDelete(id)
          setDrawerTask(null)
        }}
      />
      <SubtaskDetailDrawer
        subtask={drawerSubtask}
        onClose={() => setDrawerSubtask(null)}
        onUpdate={updated => { handleUpdateSubtask(updated); setDrawerSubtask(updated) }}
        onDelete={async id => {
          await fetch(`/api/subtasks/${id}`, { method: 'DELETE' })
          setSubtasks(prev => prev.filter(s => s.id !== id))
          setDrawerSubtask(null)
        }}
      />
    </>
  )
}
