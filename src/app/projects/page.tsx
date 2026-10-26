'use client'

import { useEffect, useState, useMemo, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, LayoutGrid, List, ArrowLeft, Trash2, ExternalLink, Check, GripVertical, Calendar } from 'lucide-react'
import { Project, Task, Subtask } from '@/lib/types'
import { ProjectCard } from '@/components/projects/ProjectCard'
import { NewProjectModal } from '@/components/projects/NewProjectModal'
import { TaskDetailDrawer } from '@/components/projects/TaskDetailDrawer'
import { SubtaskDetailDrawer } from '@/components/projects/SubtaskDetailDrawer'
import { GanttChart } from '@/components/projects/GanttChart'
import { STATUS_SELECT_BG, PRIORITY_SELECT_BG } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { format, parseISO, isPast, isToday } from 'date-fns'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusRail } from '@/components/ui/StatusRail'

// ─── Color / style maps ────────────────────────────────────────────────────────

const COLOR_HEX: Record<string, string> = {
  sage: '#9BAE9A', terracotta: '#C27A54', butter: '#F0D77A', tomato: '#C14B3A',
  blueberry: '#78B7C5', thyme: '#A0C66D', candy: '#F8AFA8', citrus: '#F5A623',
}

const PRIORITY_STYLE: Record<string, { bg: string; color: string }> = {
  urgent: { bg: 'rgba(193,75,58,0.12)', color: '#C14B3A' },
  high:   { bg: 'rgba(193,75,58,0.09)', color: '#C14B3A' },
  medium: { bg: 'rgba(194,122,84,0.12)', color: '#C27A54' },
  low:    { bg: 'rgba(155,174,154,0.15)', color: '#6B8F6A' },
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  todo:        { bg: 'rgba(216,210,198,0.5)', color: '#747474', label: 'To Do' },
  in_progress: { bg: 'rgba(120,183,197,0.15)', color: '#3d7684', label: 'In Progress' },
  review:      { bg: 'rgba(240,215,122,0.25)', color: '#8a6f00', label: 'Review' },
  done:        { bg: 'rgba(155,174,154,0.2)', color: '#4a6e49', label: 'Done' },
}

const PROJECT_STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  planning:  { bg: 'rgba(120,183,197,0.15)', color: '#3d7684', label: 'Planning' },
  active:    { bg: 'rgba(155,174,154,0.2)', color: '#4a6e49', label: 'Active' },
  on_hold:   { bg: 'rgba(240,215,122,0.25)', color: '#8a6f00', label: 'On Hold' },
  complete:  { bg: 'rgba(155,174,154,0.3)', color: '#2e5c2d', label: 'Complete' },
  completed: { bg: 'rgba(155,174,154,0.3)', color: '#2e5c2d', label: 'Complete' },
}

const COLOR_OPTIONS = ['sage', 'terracotta', 'butter', 'tomato', 'blueberry', 'thyme', 'candy', 'citrus']

const FONT: React.CSSProperties = { fontFamily: "'Jost', system-ui, sans-serif" }
const SERIF: React.CSSProperties = { fontFamily: "'Cormorant Garamond', Georgia, serif" }

const PILL_BASE: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
  padding: '3px 9px', borderRadius: 999, flexShrink: 0,
}

const SELECT_BASE: React.CSSProperties = {
  ...FONT, fontSize: 11, borderRadius: 7, padding: '5px 8px',
  border: '1px solid #D8D2C6', outline: 'none', cursor: 'pointer', background: '#fff',
}

// ─── GanttRow ─────────────────────────────────────────────────────────────────

function GanttRow({ project, onClick }: { project: Project; onClick: () => void }) {
  const now = Date.now()
  const start = new Date(project.created_at).getTime()
  const end = project.due_date ? new Date(project.due_date + 'T00:00:00').getTime() : now + 30 * 86400000
  const span = Math.max(end - start, 1)
  const elapsed = Math.min(Math.max((now - start) / span, 0), 1)

  const taskCount = project.task_count ?? 0
  const doneCount = project.completed_task_count ?? 0
  const progress = taskCount > 0 ? doneCount / taskCount : 0
  const color = COLOR_HEX[project.color] ?? '#9BAE9A'
  const ps = PROJECT_STATUS_STYLE[project.status] ?? PROJECT_STATUS_STYLE.active
  const dueLabel = project.due_date
    ? new Date(project.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'No date'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
        <button
          onClick={onClick}
          style={{ fontSize: 12.5, fontWeight: 600, color: '#2C2C2C', cursor: 'pointer', background: 'none', border: 'none', padding: 0, ...FONT, textAlign: 'left' }}
        >
          {project.name}
        </button>
        <span style={{ fontSize: 11, color: '#747474', ...FONT }}>Due {dueLabel}</span>
      </div>
      <div style={{ position: 'relative', height: 16, background: '#FBF0E3', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${elapsed * 100}%`, background: 'rgba(216,210,198,0.8)', borderRadius: 999 }} />
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${progress * 100}%`, background: color, borderRadius: 999, opacity: 0.85 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 10.5, color: '#747474', ...FONT }}>{doneCount}/{taskCount} tasks · {Math.round(progress * 100)}%</span>
        <span style={{ ...PILL_BASE, background: ps.bg, color: ps.color, fontSize: 9 }}>{ps.label}</span>
      </div>
    </div>
  )
}

// ─── GroupCreator ─────────────────────────────────────────────────────────────

function GroupCreator({ onAdd }: { onAdd: (name: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function commit() {
    const trimmed = name.trim()
    if (trimmed) { onAdd(trimmed); setName('') }
    setEditing(false)
  }

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#747474', fontSize: 12, ...FONT, opacity: 0.6 }}
      >
        <Plus size={12} /> New Group
      </button>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
        ref={inputRef}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setName('') } }}
        placeholder="Group name…"
        style={{ flex: 1, ...FONT, fontSize: 12.5, border: '1px solid #D8D2C6', borderRadius: 7, padding: '6px 10px', outline: 'none', background: '#FAFAF8', color: '#2C2C2C' }}
      />
      <button onClick={commit} style={{ ...FONT, fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 7, border: 'none', background: name.trim() ? '#2C2C2C' : '#D8D2C6', color: '#FAF9F6', cursor: name.trim() ? 'pointer' : 'default' }}>
        Create
      </button>
      <button onClick={() => { setEditing(false); setName('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#747474', fontSize: 18, lineHeight: 1, padding: '0 2px' }}>×</button>
    </div>
  )
}

// ─── ProjectAccordion ─────────────────────────────────────────────────────────

function ProjectAccordion({
  project, tasks, subtasks, openCount, overdueCount, color, ps, onOpenTask, onUpdateTask, onOpenProject, onToggleSubtask, onUpdateSubtaskDate, onOpenSubtask,
}: {
  project: Project
  tasks: Task[]
  subtasks: Subtask[]
  openCount: number
  overdueCount: number
  color: string
  ps: { bg: string; color: string; label: string }
  onOpenTask: (t: Task) => void
  onUpdateTask: (id: number, patch: Partial<Task>) => void
  onOpenProject: () => void
  onToggleSubtask: (s: Subtask) => void
  onUpdateSubtaskDate: (s: Subtask, date: string) => void
  onOpenSubtask: (s: Subtask) => void
}) {
  const [open, setOpen] = useState(true)
  const [hideDone, setHideDone] = useState(true)
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<number>>(new Set())

  function toggleTaskExpanded(taskId: number) {
    setExpandedTaskIds(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId)
      return next
    })
  }

  const sortFn = (a: Task, b: Task) => {
    const po: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
    if (a.status === 'done' && b.status !== 'done') return 1
    if (b.status === 'done' && a.status !== 'done') return -1
    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
    if (a.due_date) return -1
    if (b.due_date) return 1
    return (po[a.priority] ?? 3) - (po[b.priority] ?? 3)
  }
  // Build child map from ALL tasks (including done ones, for the map)
  const childrenByParent = new Map<number, Task[]>()
  tasks.forEach(t => {
    if (t.parent_task_id) {
      const kids = childrenByParent.get(t.parent_task_id) ?? []
      kids.push(t)
      childrenByParent.set(t.parent_task_id, kids)
    }
  })
  // Only show top-level tasks in the main list
  const visibleTasks = (hideDone ? tasks.filter(t => t.status !== 'done') : tasks).filter(t => !t.parent_task_id)
  const sortedTasks = [...visibleTasks].sort(sortFn)
  const doneCount = tasks.filter(t => t.status === 'done' && !t.parent_task_id).length

  return (
    <div style={{ border: '1px solid rgba(216,210,198,0.7)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
      {/* Header */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer', borderBottom: open ? '1px solid rgba(216,210,198,0.5)' : 'none', transition: 'background 0.1s' }}
        onClick={() => setOpen(o => !o)}
      >
        <div style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: '#2C2C2C', flex: 1, ...FONT }}>{project.name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {overdueCount > 0 && (
            <span style={{ fontSize: 11, fontWeight: 600, color: '#C14B3A', background: 'rgba(193,75,58,0.1)', padding: '2px 8px', borderRadius: 999, ...FONT }}>
              {overdueCount} overdue
            </span>
          )}
          <span style={{ fontSize: 11.5, color: '#747474', ...FONT }}>{openCount} open · {doneCount} done</span>
          <span style={{ ...PILL_BASE, background: ps.bg, color: ps.color }}>{ps.label}</span>
          <button
            onClick={e => { e.stopPropagation(); onOpenProject() }}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#747474', padding: 2, display: 'flex', opacity: 0.5 }}
            title="Open project"
          >
            <ExternalLink size={13} />
          </button>
        </div>
        <span style={{ fontSize: 11, color: 'rgba(116,116,116,0.5)', marginLeft: 2, transition: 'transform 0.2s', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
      </div>

      {/* Task rows */}
      {open && (
        <div style={{ padding: '4px 18px 10px' }}>
          {sortedTasks.length === 0 ? (
            <p style={{ fontSize: 12.5, color: '#747474', padding: '10px 0', margin: 0, ...FONT }}>
              {tasks.length === 0 ? 'No tasks yet.' : 'All done! 🎉'}
            </p>
          ) : (() => {
            // Shared per-task row renderer (used for both flat and grouped paths)
            function renderRows(list: Task[]) {
              return list.flatMap((t, i) => {
                const isDone = t.status === 'done'
                const dueInfo = t.due_date ? (() => {
                  const parsed = parseISO(t.due_date)
                  return { text: format(parsed, 'MMM d'), overdue: isPast(parsed) && !isToday(parsed) && !isDone, today: isToday(parsed) }
                })() : null
                const ss = STATUS_STYLE[t.status] ?? STATUS_STYLE.todo
                const ps2 = PRIORITY_STYLE[t.priority] ?? PRIORITY_STYLE.low
                const allTaskSubs = subtasks.filter(s => s.task_id === t.id)
                const totalSubs = allTaskSubs.length
                const doneSubs = allTaskSubs.filter(s => s.completed).length
                const taskSubs = allTaskSubs.filter(s => hideDone ? !s.completed : true)
                const hasSubtasks = totalSubs > 0
                const isExpanded = hasSubtasks ? expandedTaskIds.has(t.id) : true
                const isLast = i === list.length - 1 && (!hasSubtasks || !isExpanded || taskSubs.length === 0)
                const taskRow = (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: isLast ? 'none' : '1px solid rgba(216,210,198,0.35)', opacity: isDone ? 0.55 : 1 }}>
                    <div onClick={() => onUpdateTask(t.id, { status: isDone ? 'todo' : 'done' })}
                      style={{ width: 15, height: 15, borderRadius: 3, flexShrink: 0, cursor: 'pointer', border: `1.5px solid ${isDone ? '#2C2C2C' : '#D8D2C6'}`, background: isDone ? '#2C2C2C' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s' }}>
                      {isDone && <Check style={{ width: 9, height: 9, color: '#FAF9F6', strokeWidth: 3 }} />}
                    </div>
                    {hasSubtasks && (
                      <button onClick={e => { e.stopPropagation(); toggleTaskExpanded(t.id) }}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#9BA69A', fontSize: 9, flexShrink: 0, display: 'flex', alignItems: 'center', transition: 'transform 0.15s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                        title={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}>▶</button>
                    )}
                    <span onClick={() => onOpenTask(t)} style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#2C2C2C', ...FONT, cursor: 'pointer', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: isDone ? 'line-through' : 'none' }}>
                      {t.title}
                    </span>
                    {hasSubtasks && (
                      <span style={{ ...FONT, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99, flexShrink: 0, background: doneSubs === totalSubs ? 'rgba(120,183,197,0.15)' : 'rgba(44,44,44,0.06)', color: doneSubs === totalSubs ? '#3d7684' : '#747474', border: `1px solid ${doneSubs === totalSubs ? 'rgba(120,183,197,0.3)' : 'rgba(44,44,44,0.12)'}` }}>
                        {doneSubs}/{totalSubs}
                      </span>
                    )}
                    <span style={{ ...PILL_BASE, background: ps2.bg, color: ps2.color, flexShrink: 0 }}>{t.priority}</span>
                    <select value={t.status} onChange={e => { e.stopPropagation(); onUpdateTask(t.id, { status: e.target.value as Task['status'] }) }} onClick={e => e.stopPropagation()}
                      style={{ ...FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', padding: '3px 6px', borderRadius: 6, border: `1px solid ${ss.color}50`, background: ss.bg, color: ss.color, outline: 'none', cursor: 'pointer', flexShrink: 0 }}>
                      <option value="todo">To Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="review">Review</option>
                      <option value="done">Done</option>
                    </select>
                    {dueInfo && (
                      <span style={{ fontSize: 11, flexShrink: 0, ...FONT, color: dueInfo.overdue ? '#C14B3A' : dueInfo.today ? '#C27A54' : '#747474', fontWeight: (dueInfo.overdue || dueInfo.today) ? 600 : 400 }}>
                        {dueInfo.text}
                      </span>
                    )}
                  </div>
                )
                const subtaskRows = (hasSubtasks && isExpanded) ? taskSubs.map((s, si) => {
                  const subDone = !!s.completed
                  const isLastSub = i === list.length - 1 && si === taskSubs.length - 1
                  const subDueDate = s.due_date
                  const subOverdue = subDueDate && !subDone && new Date(subDueDate + 'T00:00:00') < new Date(new Date().toDateString())
                  return (
                    <div key={`sub-${s.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', paddingLeft: 18, borderBottom: isLastSub ? 'none' : '1px solid rgba(216,210,198,0.25)', opacity: subDone ? 0.45 : 1 }}>
                      <span style={{ color: 'rgba(216,210,198,0.9)', fontSize: 10, flexShrink: 0, marginLeft: -10, marginRight: -2 }}>└</span>
                      <div onClick={() => onToggleSubtask(s)} style={{ width: 13, height: 13, borderRadius: 3, flexShrink: 0, cursor: 'pointer', border: `1.5px solid ${subDone ? '#2C2C2C' : '#D8D2C6'}`, background: subDone ? '#2C2C2C' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s' }}>
                        {subDone && <Check style={{ width: 8, height: 8, color: '#FAF9F6', strokeWidth: 3 }} />}
                      </div>
                      <span onClick={() => onOpenSubtask(s)} style={{ flex: 1, fontSize: 12, fontWeight: 400, color: '#2C2C2C', ...FONT, cursor: 'pointer', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: subDone ? 'line-through' : 'none' }}>
                        {s.title}
                      </span>
                      <label style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', flexShrink: 0 }} title={subDueDate ? 'Change due date' : 'Set due date'}>
                        <Calendar style={{ width: 11, height: 11, color: subOverdue ? '#C14B3A' : subDueDate ? '#9BA69A' : 'rgba(44,44,44,0.2)' }} />
                        {subDueDate && <span style={{ fontSize: 10, fontWeight: 600, color: subOverdue ? '#C14B3A' : '#747474', ...FONT }}>{format(parseISO(subDueDate), 'MMM d')}</span>}
                        <input type="date" value={subDueDate || ''} onChange={e => { e.stopPropagation(); onUpdateSubtaskDate(s, e.target.value) }}
                          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }} tabIndex={-1} />
                      </label>
                    </div>
                  )
                }) : []
                return [taskRow, ...subtaskRows]
              })
            }

            // Flat render when no groups exist
            const hasAnyGroup = sortedTasks.some(t => t.task_group)
            if (!hasAnyGroup) return renderRows(sortedTasks)

            // Grouped render
            const groupOrder: string[] = []
            const byGroup: Record<string, Task[]> = {}
            for (const t of sortedTasks) {
              const g = t.task_group ?? ''
              if (!byGroup[g]) { byGroup[g] = []; if (g) groupOrder.push(g) }
              byGroup[g].push(t)
            }
            const sections: string[] = [...new Set(groupOrder)]
            if (byGroup['']) sections.push('')

            return sections.flatMap(g => {
              const gtasks = byGroup[g] ?? []
              if (gtasks.length === 0) return []
              const header = g ? (
                <div key={`gh-${g}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 0 4px', borderTop: '1px solid rgba(216,210,198,0.4)' }}>
                  <div style={{ width: 6, height: 6, borderRadius: 2, background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#747474', ...FONT }}>{g}</span>
                  <span style={{ fontSize: 10, color: '#D8D2C6', ...FONT }}>{gtasks.length}</span>
                </div>
              ) : (sections.length > 1 ? (
                <div key="gh-ungrouped" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 0 4px', borderTop: '1px solid rgba(216,210,198,0.4)' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#D8D2C6', ...FONT }}>Ungrouped</span>
                </div>
              ) : null)
              return [header, ...renderRows(gtasks)]
            })
          })()}
          {/* Footer: show/hide done toggle */}
          {doneCount > 0 && (
            <button
              onClick={() => setHideDone(h => !h)}
              style={{ marginTop: 6, fontSize: 11, color: '#747474', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', ...FONT }}
            >
              {hideDone ? `Show ${doneCount} completed` : `Hide completed`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── TabBtn ───────────────────────────────────────────────────────────────────

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...FONT, fontSize: 13, fontWeight: active ? 600 : 500,
        padding: '10px 18px', background: 'transparent', border: 'none',
        borderBottom: active ? '2px solid #2C2C2C' : '2px solid transparent',
        color: active ? '#2C2C2C' : '#747474',
        cursor: 'pointer', transition: 'all 0.15s', marginBottom: -1,
      }}
    >
      {label}
    </button>
  )
}

// ─── TaskRow ──────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  onUpdate,
  onDelete,
  onOpen,
  showProject = true,
  draggable = false,
  onDragStart,
  onDragEnter,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging = false,
  isDragOver = false,
}: {
  task: Task
  onUpdate: (id: number, patch: Partial<Task>) => void
  onDelete: (id: number) => void
  onOpen: (t: Task) => void
  showProject?: boolean
  draggable?: boolean
  onDragStart?: () => void
  onDragEnter?: () => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: () => void
  onDragEnd?: () => void
  isDragging?: boolean
  isDragOver?: boolean
}) {
  const color = COLOR_HEX[task.project_color ?? ''] ?? '#D8D2C6'
  const isDone = task.status === 'done'

  const dueInfo = task.due_date ? (() => {
    const parsed = parseISO(task.due_date)
    return {
      text: format(parsed, 'MMM d'),
      overdue: isPast(parsed) && !isToday(parsed) && !isDone,
      today: isToday(parsed),
    }
  })() : null

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragOver={e => { e.preventDefault(); onDragOver?.(e) }}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '9px 0',
        borderTop: isDragOver ? '2px solid #C27A54' : '1px solid rgba(216,210,198,0.4)',
        opacity: isDragging ? 0.35 : isDone ? 0.65 : 1,
        cursor: draggable ? 'default' : undefined,
        transition: 'border-color 0.1s',
      }}
    >
      {draggable && (
        <GripVertical size={13} style={{ color: '#D8D2C6', flexShrink: 0, cursor: 'grab' }} />
      )}
      {/* Checkbox */}
      <div
        onClick={() => onUpdate(task.id, { status: isDone ? 'todo' : 'done' })}
        style={{
          width: 16, height: 16, borderRadius: 4, flexShrink: 0, cursor: 'pointer',
          border: `2px solid ${isDone ? '#2C2C2C' : '#D8D2C6'}`,
          background: isDone ? '#2C2C2C' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s',
        }}
      >
        {isDone && <Check style={{ width: 9, height: 9, color: '#FAF9F6', strokeWidth: 3 }} />}
      </div>

      <span style={{ width: 7, height: 7, borderRadius: 999, flexShrink: 0, background: color, display: 'inline-block' }} />

      <span
        style={{ flex: 1, fontSize: 12.5, fontWeight: 500, color: '#2C2C2C', ...FONT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, textDecoration: isDone ? 'line-through' : 'none' }}
        onClick={() => onOpen(task)}
        title="Open details"
      >
        {task.title}
      </span>

      {(task.subtask_count ?? 0) > 0 && (
        <span style={{
          ...FONT, fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99, flexShrink: 0,
          background: (task.completed_subtask_count ?? 0) === (task.subtask_count ?? 0) ? 'rgba(120,183,197,0.15)' : 'rgba(44,44,44,0.06)',
          color: (task.completed_subtask_count ?? 0) === (task.subtask_count ?? 0) ? '#3d7684' : '#747474',
          border: `1px solid ${(task.completed_subtask_count ?? 0) === (task.subtask_count ?? 0) ? 'rgba(120,183,197,0.3)' : 'rgba(44,44,44,0.12)'}`,
        }}>
          {task.completed_subtask_count ?? 0}/{task.subtask_count}
        </span>
      )}

      {showProject && task.project_name && (
        <span style={{ fontSize: 11, color: '#747474', ...FONT, flexShrink: 0, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.project_name}
        </span>
      )}

      {/* Status — colored select */}
      <select
        value={task.status}
        onChange={e => onUpdate(task.id, { status: e.target.value as Task['status'] })}
        style={{
          ...FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          borderRadius: 999, padding: '3px 8px', flexShrink: 0,
          border: `1px solid ${STATUS_STYLE[task.status]?.color ?? '#D8D2C6'}50`,
          background: STATUS_STYLE[task.status]?.bg ?? 'rgba(216,210,198,0.4)',
          color: STATUS_STYLE[task.status]?.color ?? '#747474',
          cursor: 'pointer', outline: 'none',
        }}
      >
        <option value="todo">To Do</option>
        <option value="in_progress">In Progress</option>
        <option value="review">Review</option>
        <option value="done">Done</option>
      </select>

      {/* Priority — colored select */}
      <select
        value={task.priority}
        onChange={e => onUpdate(task.id, { priority: e.target.value as Task['priority'] })}
        style={{
          ...FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          borderRadius: 999, padding: '3px 8px', flexShrink: 0,
          border: `1px solid ${PRIORITY_STYLE[task.priority]?.color ?? '#D8D2C6'}50`,
          background: PRIORITY_STYLE[task.priority]?.bg ?? 'rgba(216,210,198,0.3)',
          color: PRIORITY_STYLE[task.priority]?.color ?? '#747474',
          cursor: 'pointer', outline: 'none',
        }}
      >
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>

      {/* Due date */}
      {dueInfo && (
        <span style={{
          fontSize: 11, flexShrink: 0, ...FONT,
          color: dueInfo.overdue ? '#C14B3A' : dueInfo.today ? '#C27A54' : '#747474',
          fontWeight: (dueInfo.overdue || dueInfo.today) ? 600 : 400,
        }}>
          {dueInfo.text}
        </span>
      )}

      <button
        onClick={() => onOpen(task)}
        style={{ padding: '3px', border: 'none', background: 'none', cursor: 'pointer', color: '#747474', opacity: 0.5, display: 'flex', alignItems: 'center', flexShrink: 0 }}
        title="Open details"
      >
        <ExternalLink size={13} />
      </button>

      <button
        onClick={() => onDelete(task.id)}
        style={{ padding: '3px', border: 'none', background: 'none', cursor: 'pointer', color: '#C14B3A', opacity: 0.5, display: 'flex', alignItems: 'center', flexShrink: 0 }}
        title="Delete task"
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}

// ─── Constants ────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'projects' | 'gantt'
const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'planning', label: 'Planning' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'complete', label: 'Complete' },
]

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WorkTrackingPage() {
  return <Suspense><WorkTrackingInner /></Suspense>
}

function WorkTrackingInner() {
  const searchParams = useSearchParams()
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('overview')
  const [showNew, setShowNew] = useState(false)

  // Projects tab
  const [projectFilter, setProjectFilter] = useState('all')
  const [view, setView] = useState<'grid' | 'list'>('grid')

  // Project detail inline
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [editColor, setEditColor] = useState('')
  const [editDueDate, setEditDueDate] = useState('')
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const editStateRef = useRef({ name: '', desc: '', status: '', color: '', dueDate: '' })
  const selectedProjectRef = useRef<Project | null>(null)

  // Task detail drawer
  const [drawerTask, setDrawerTask] = useState<Task | null>(null)
  // Subtask detail drawer
  const [drawerSubtask, setDrawerSubtask] = useState<Subtask | null>(null)

  // Project detail — task filters + drag-drop
  const [projectTaskStatusFilter, setProjectTaskStatusFilter] = useState('all')
  const [projectTaskPriorityFilter, setProjectTaskPriorityFilter] = useState('all')
  const [projectHideDone, setProjectHideDone] = useState(true)
  const [projectSortBy, setProjectSortBy] = useState<'created' | 'due' | 'priority' | 'custom'>('created')
  const [dragId, setDragId] = useState<number | null>(null)
  const [dragOverId, setDragOverId] = useState<number | null>(null)
  const [taskOrder, setTaskOrder] = useState<number[]>([])

  // New Task modal
  const [showNewTaskModal, setShowNewTaskModal] = useState(false)
  const [ntTitle, setNtTitle] = useState('')
  const [ntProject, setNtProject] = useState('')
  const [ntPriority, setNtPriority] = useState('medium')
  const [ntDue, setNtDue] = useState('')
  const [ntGroupPreset, setNtGroupPreset] = useState('')

  // All Tasks tab
  const [taskProjectFilter, setTaskProjectFilter] = useState('all')
  const [taskStatusFilter, setTaskStatusFilter] = useState('all')
  const [taskPriorityFilter, setTaskPriorityFilter] = useState('all')
  const [hideDone, setHideDone] = useState(true)
  const [sortBy, setSortBy] = useState<'due' | 'priority' | 'created'>('due')
  const [qaTitle, setQaTitle] = useState('')
  const [qaProject, setQaProject] = useState('')
  const [qaPriority, setQaPriority] = useState('medium')
  const [qaDue, setQaDue] = useState('')
  const [qaAdding, setQaAdding] = useState(false)

  // ── Data loading ────────────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      fetch('/api/projects').then(r => r.json()),
      fetch('/api/tasks').then(r => r.json()),
      fetch('/api/subtasks').then(r => r.json()),
    ]).then(([p, t, s]) => {
      const loadedTasks: Task[] = Array.isArray(t) ? t : []
      setProjects(Array.isArray(p) ? p : [])
      setTasks(loadedTasks)
      setSubtasks(Array.isArray(s) ? s : [])
      setLoading(false)
    })
  }, [])

  // Open task drawer when ?task=ID param is present or changes
  useEffect(() => {
    const taskId = searchParams.get('task')
    if (!taskId || tasks.length === 0) return
    const found = tasks.find(t => t.id === Number(taskId))
    if (found) setDrawerTask(found)
  }, [searchParams, tasks])

  // Sync edit fields + reset task filters/order when selected project changes
  useEffect(() => {
    if (selectedProject) {
      setEditName(selectedProject.name)
      setEditDesc(selectedProject.description ?? '')
      setEditStatus(selectedProject.status)
      setEditColor(selectedProject.color)
      setEditDueDate(selectedProject.due_date ?? '')
      // Reset task filters and order
      setProjectTaskStatusFilter('all')
      setProjectTaskPriorityFilter('all')
      setProjectHideDone(true)
      setProjectSortBy('created')
      setTaskOrder(tasks.filter(t => t.project_id === selectedProject.id).map(t => t.id))
    }
    selectedProjectRef.current = selectedProject
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [selectedProject?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep edit state ref current for debounced save
  useEffect(() => {
    editStateRef.current = { name: editName, desc: editDesc, status: editStatus, color: editColor, dueDate: editDueDate }
  }, [editName, editDesc, editStatus, editColor, editDueDate])

  // ── Project auto-save ───────────────────────────────────────────────────────

  function scheduleProjectSave() {
    if (!selectedProjectRef.current) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      const proj = selectedProjectRef.current
      if (!proj) return
      const { name, desc, status, color, dueDate } = editStateRef.current
      const res = await fetch(`/api/projects/${proj.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || proj.name,
          description: desc,
          status,
          color,
          due_date: dueDate || null,
        }),
      })
      const updated = await res.json()
      if (updated.id) {
        setProjects(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p))
        setSelectedProject(prev => prev?.id === updated.id ? { ...prev, ...updated } : prev)
      }
    }, 600)
  }

  // ── Subtask mutations ───────────────────────────────────────────────────────

  const toggleSubtask = useCallback(async (s: Subtask) => {
    const newCompleted = !s.completed
    const newStatus = newCompleted ? 'done' : 'todo'
    setSubtasks(prev => prev.map(sub => sub.id === s.id ? { ...sub, completed: newCompleted, status: newStatus as Subtask['status'] } : sub))
    await fetch(`/api/subtasks/${s.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: s.title, notes: s.notes, due_date: s.due_date, completed: newCompleted, status: newStatus }),
    })
  }, [])

  const updateSubtaskDate = useCallback(async (s: Subtask, date: string) => {
    setSubtasks(prev => prev.map(sub => sub.id === s.id ? { ...sub, due_date: date || null } : sub))
    await fetch(`/api/subtasks/${s.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: s.title, notes: s.notes, due_date: date || null, completed: s.completed, status: s.status }),
    })
  }, [])

  // ── Task mutations ──────────────────────────────────────────────────────────

  const updateTask = useCallback(async (id: number, patch: Partial<Task>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
    setDrawerTask(prev => prev?.id === id ? { ...prev, ...patch } : prev)
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
  }, [])

  const deleteTask = useCallback(async (id: number) => {
    if (!confirm('Delete this task?')) return
    setTasks(prev => prev.filter(t => t.id !== id))
    setDrawerTask(prev => prev?.id === id ? null : prev)
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
  }, [])

  const handleDrawerUpdate = useCallback((updated: Task) => {
    setTasks(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t))
    setDrawerTask(updated)
  }, [])

  const handleDrawerDelete = useCallback(async (id: number) => {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    setTasks(prev => prev.filter(t => t.id !== id))
    setTaskOrder(prev => prev.filter(x => x !== id))
    setDrawerTask(null)
  }, [])

  const handleDragStart = useCallback((taskId: number) => {
    setDragId(taskId)
  }, [])

  const handleDragEnter = useCallback((taskId: number) => {
    setDragOverId(taskId)
  }, [])

  const handleDrop = useCallback((taskId: number) => {
    setDragId(prev => {
      if (prev === null || prev === taskId) return null
      setTaskOrder(order => {
        const result = [...order]
        const fromIdx = result.indexOf(prev)
        const toIdx = result.indexOf(taskId)
        if (fromIdx === -1 || toIdx === -1) return order
        result.splice(fromIdx, 1)
        result.splice(toIdx, 0, prev)
        return result
      })
      setProjectSortBy('custom')
      return null
    })
    setDragOverId(null)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDragId(null)
    setDragOverId(null)
  }, [])

  const addQuickTask = useCallback(async () => {
    if (!qaTitle.trim() || qaAdding) return
    setQaAdding(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: qaTitle.trim(),
          project_id: qaProject || null,
          priority: qaPriority,
          due_date: qaDue || null,
          status: 'todo',
        }),
      })
      const newTask = await res.json()
      if (newTask.id) {
        const proj = projects.find(p => String(p.id) === qaProject)
        setTasks(prev => [{ ...newTask, project_name: proj?.name ?? null, project_color: proj?.color ?? null }, ...prev])
        setQaTitle('')
        setQaDue('')
      }
    } finally {
      setQaAdding(false)
    }
  }, [qaTitle, qaAdding, qaProject, qaPriority, qaDue, projects])

  const addNewTask = useCallback(async () => {
    if (!ntTitle.trim()) return
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: ntTitle.trim(),
        project_id: ntProject || null,
        priority: ntPriority,
        due_date: ntDue || null,
        task_group: ntGroupPreset || null,
        status: 'todo',
      }),
    })
    const newTask = await res.json()
    if (newTask.id) {
      const proj = projects.find(p => String(p.id) === ntProject)
      setTasks(prev => [{ ...newTask, project_name: proj?.name ?? null, project_color: proj?.color ?? null }, ...prev])
      setTaskOrder(prev => [newTask.id, ...prev])
      setNtTitle('')
      setNtProject('')
      setNtPriority('medium')
      setNtDue('')
      setNtGroupPreset('')
      setShowNewTaskModal(false)
    }
  }, [ntTitle, ntProject, ntPriority, ntDue, ntGroupPreset, projects])

  // ── Derived state ───────────────────────────────────────────────────────────

  const activeProjectCount = projects.filter(p => p.status === 'active').length
  const totalTasks = tasks.length
  const doneTasks = tasks.filter(t => t.status === 'done').length
  const overdueTasksList = tasks.filter(t => {
    if (!t.due_date || t.status === 'done') return false
    return new Date(t.due_date + 'T00:00:00') < new Date(new Date().toDateString())
  })
  const overdueTasks = overdueTasksList.length

  const kpis = [
    { label: 'Projects', value: String(projects.length), sub: `${activeProjectCount} active`, color: '#9BAE9A' },
    { label: 'Total Tasks', value: String(totalTasks), sub: 'across all projects', color: '#9BAE9A' },
    { label: 'Completed', value: String(doneTasks), sub: `${totalTasks > 0 ? Math.round(doneTasks / totalTasks * 100) : 0}% done`, color: '#9BAE9A' },
    { label: 'Overdue', value: String(overdueTasks), sub: overdueTasks > 0 ? 'need attention' : 'all on track', color: overdueTasks > 0 ? '#C14B3A' : '#9BAE9A' },
  ]

  const upcomingTasks = useMemo(() => tasks
    .filter(t => t.status !== 'done')
    .sort((a, b) => {
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      if (a.due_date) return -1
      if (b.due_date) return 1
      return (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)
    })
    .slice(0, 8), [tasks])

  const filteredProjects = useMemo(() => {
    if (projectFilter === 'all') return projects
    if (projectFilter === 'complete') return projects.filter(p => p.status === 'complete')
    return projects.filter(p => p.status === projectFilter)
  }, [projects, projectFilter])

  const projectOptions = useMemo(() => projects.map(p => ({ value: String(p.id), label: p.name })), [projects])

  const filteredTasks = useMemo(() => {
    let result = tasks
    if (taskProjectFilter !== 'all') result = result.filter(t => String(t.project_id) === taskProjectFilter)
    if (taskStatusFilter !== 'all') result = result.filter(t => t.status === taskStatusFilter)
    if (taskPriorityFilter !== 'all') result = result.filter(t => t.priority === taskPriorityFilter)
    if (hideDone) result = result.filter(t => t.status !== 'done')
    return [...result].sort((a, b) => {
      if (sortBy === 'due') {
        if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
        if (a.due_date) return -1
        if (b.due_date) return 1
        return 0
      }
      if (sortBy === 'priority') return (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)
      return b.id - a.id
    })
  }, [tasks, taskProjectFilter, taskStatusFilter, taskPriorityFilter, hideDone, sortBy])

  const projectTasks = useMemo(() => {
    if (!selectedProject) return []
    return tasks.filter(t => t.project_id === selectedProject.id)
  }, [tasks, selectedProject])

  const filteredProjectTasks = useMemo(() => {
    let result = projectTasks
    if (projectTaskStatusFilter !== 'all') result = result.filter(t => t.status === projectTaskStatusFilter)
    if (projectTaskPriorityFilter !== 'all') result = result.filter(t => t.priority === projectTaskPriorityFilter)
    if (projectHideDone) result = result.filter(t => t.status !== 'done')
    if (projectSortBy === 'custom' && taskOrder.length > 0) {
      return [...result].sort((a, b) => {
        const ai = taskOrder.indexOf(a.id)
        const bi = taskOrder.indexOf(b.id)
        return (ai === -1 ? 99999 : ai) - (bi === -1 ? 99999 : bi)
      })
    }
    if (projectSortBy === 'due') {
      return [...result].sort((a, b) => {
        if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
        return a.due_date ? -1 : b.due_date ? 1 : 0
      })
    }
    if (projectSortBy === 'priority') {
      return [...result].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9))
    }
    return [...result].sort((a, b) => b.id - a.id)
  }, [projectTasks, projectTaskStatusFilter, projectTaskPriorityFilter, projectHideDone, projectSortBy, taskOrder])

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const chip = (active: boolean, label: string, onClick: () => void) => (
    <button
      key={label}
      onClick={onClick}
      style={{
        ...FONT, fontSize: 12, fontWeight: active ? 600 : 500,
        padding: '6px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
        background: active ? '#2C2C2C' : 'transparent',
        color: active ? '#FAF9F6' : '#747474',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  )

  const openProject = (p: Project) => {
    setSelectedProject(p)
    setTab('projects')
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100%', ...FONT }}>

      {/* ── Header ── */}
      <div className="page-wrap" style={{ maxWidth: 1200, paddingBottom: 0 }}>
        <PageHeader
          eyebrow="Operations"
          title="Work Tracking"
          meta={`${projects.length} projects · ${activeProjectCount} active`}
          actions={
            <>
              <button
                onClick={() => { setNtProject(selectedProject ? String(selectedProject.id) : ''); setShowNewTaskModal(true) }}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 10, background: '#FBF0E3', color: '#2C2C2C', border: '1px solid #D8D2C6', fontSize: 13, fontWeight: 600, cursor: 'pointer', ...FONT }}
              >
                <Plus size={14} /> New Task
              </button>
              <button
                onClick={() => setShowNew(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 10, background: '#2C2C2C', color: '#FAF9F6', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', ...FONT }}
              >
                <Plus size={14} /> New Project
              </button>
            </>
          }
        >
          {overdueTasks > 0 && (
            <StatusRail
              severity="warning"
              message={`${overdueTasks} overdue task${overdueTasks > 1 ? 's' : ''}`}
              items={overdueTasksList.slice(0, 8).map(t => ({ label: t.title, onClick: () => setDrawerTask(t) }))}
            />
          )}
        </PageHeader>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 28 }}>
          {kpis.map(k => (
            <div
              key={k.label}
              className="wdp-card-sm"
              style={k.label === 'Overdue' && overdueTasks > 0 ? {
                borderLeft: '3px solid #B87816',
                borderColor: '#B87816',
              } : undefined}
            >
              <p className="section-label" style={{ marginBottom: 8 }}>{k.label}</p>
              <p className="wdp-stat-value" style={{ color: k.label === 'Overdue' && overdueTasks > 0 ? '#B87816' : '#2C2C2C' }}>{k.value}</p>
              <p style={{ fontSize: 11.5, fontWeight: 600, color: k.color, margin: 0 }}>{k.sub}</p>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #D8D2C6' }}>
          <TabBtn label="Overview" active={tab === 'overview'} onClick={() => { setTab('overview'); setSelectedProject(null) }} />
          <TabBtn label="Projects" active={tab === 'projects'} onClick={() => setTab('projects')} />
          <TabBtn label="Gantt" active={tab === 'gantt'} onClick={() => { setTab('gantt'); setSelectedProject(null); document.querySelector('main')?.scrollTo(0, 0) }} />
        </div>
      </div>

      {/* ── Overview tab ── */}
      {tab === 'overview' && (
        <div className="page-wrap" style={{ maxWidth: 1200 }}>
          {loading ? (
            <p style={{ color: '#747474', fontSize: 13 }}>Loading…</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {projects.length === 0 && tasks.filter(t => !t.project_id).length === 0 && (
                <p style={{ fontSize: 13, color: '#747474' }}>No projects yet.</p>
              )}
              {/* No-project tasks first */}
              {(() => {
                const unassigned = tasks.filter(t => !t.project_id)
                if (unassigned.length === 0) return null
                const openTasks = unassigned.filter(t => t.status !== 'done')
                const overdueCount = openTasks.filter(t => t.due_date && new Date(t.due_date + 'T00:00:00') < new Date(new Date().toDateString())).length
                const fakeProject = { id: -1, name: 'No Project', status: 'active', color: null, created_at: '', due_date: null, task_count: unassigned.length, completed_task_count: unassigned.filter(t => t.status === 'done').length } as unknown as Project
                return (
                  <ProjectAccordion
                    key="unassigned"
                    project={fakeProject}
                    tasks={unassigned}
                    subtasks={subtasks}
                    openCount={openTasks.length}
                    overdueCount={overdueCount}
                    color="#D8D2C6"
                    ps={{ bg: 'rgba(216,210,198,0.5)', color: '#747474', label: 'Unassigned' }}
                    onOpenTask={setDrawerTask}
                    onUpdateTask={updateTask}
                    onOpenProject={() => {}}
                    onToggleSubtask={toggleSubtask}
                    onUpdateSubtaskDate={updateSubtaskDate}
                    onOpenSubtask={setDrawerSubtask}
                  />
                )
              })()}
              {projects.map(project => {
                const projectTaskList = tasks.filter(t => t.project_id === project.id)
                const openTasks = projectTaskList.filter(t => t.status !== 'done')
                const overdueCount = openTasks.filter(t => t.due_date && new Date(t.due_date + 'T00:00:00') < new Date(new Date().toDateString())).length
                const color = COLOR_HEX[project.color ?? ''] ?? '#D8D2C6'
                const ps = PROJECT_STATUS_STYLE[project.status] ?? PROJECT_STATUS_STYLE.active

                return (
                  <ProjectAccordion
                    key={project.id}
                    project={project}
                    tasks={projectTaskList}
                    subtasks={subtasks}
                    openCount={openTasks.length}
                    overdueCount={overdueCount}
                    color={color}
                    ps={ps}
                    onOpenTask={setDrawerTask}
                    onUpdateTask={updateTask}
                    onOpenProject={() => openProject(project)}
                    onToggleSubtask={toggleSubtask}
                    onUpdateSubtaskDate={updateSubtaskDate}
                    onOpenSubtask={setDrawerSubtask}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Projects list ── */}
      {tab === 'projects' && !selectedProject && (
        <div style={{ padding: '20px clamp(16px,4vw,44px) 60px', maxWidth: 1200 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {STATUS_FILTERS.map(f => chip(projectFilter === f.value, f.label, () => setProjectFilter(f.value)))}
            </div>
            <div style={{ display: 'flex', gap: 2, padding: 3, background: '#FBF0E3', borderRadius: 9 }}>
              <button
                onClick={() => setView('grid')}
                style={{ padding: '5px 8px', borderRadius: 7, border: 'none', background: view === 'grid' ? '#fff' : 'transparent', color: view === 'grid' ? '#2C2C2C' : '#747474', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <LayoutGrid size={15} />
              </button>
              <button
                onClick={() => setView('list')}
                style={{ padding: '5px 8px', borderRadius: 7, border: 'none', background: view === 'list' ? '#fff' : 'transparent', color: view === 'list' ? '#2C2C2C' : '#747474', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <List size={15} />
              </button>
            </div>
          </div>
          {loading ? (
            <p style={{ color: '#747474', fontSize: 13 }}>Loading…</p>
          ) : filteredProjects.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#747474', fontSize: 13 }}>
              {projectFilter === 'all' ? 'No projects yet.' : `No ${projectFilter} projects.`}
            </div>
          ) : (
            <div className={cn(view === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4' : 'flex flex-col gap-3')}>
              {filteredProjects.map(p => (
                <ProjectCard key={p.id} project={p} onOpenDetail={() => setSelectedProject(p)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Project Detail (inline) ── */}
      {tab === 'projects' && selectedProject && (
        <div style={{ padding: '20px clamp(16px,4vw,44px) 60px', maxWidth: 1200 }}>
          {/* Back */}
          <button
            onClick={() => setSelectedProject(null)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#747474', fontSize: 12.5, fontWeight: 600, ...FONT, marginBottom: 20, padding: 0 }}
          >
            <ArrowLeft size={14} /> Back to Projects
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>

            {/* Left: Task list */}
            <div>
              <div style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 12, overflow: 'hidden' }}>
                {/* Project name heading */}
                <div style={{ padding: '20px 22px 0' }}>
                  <h2 style={{ ...SERIF, fontSize: 28, fontWeight: 700, color: '#2C2C2C', margin: '0 0 4px' }}>
                    {selectedProject.name}
                  </h2>
                  <p style={{ ...FONT, fontSize: 11.5, color: '#747474', margin: '0 0 16px' }}>
                    {projectTasks.length} task{projectTasks.length !== 1 ? 's' : ''}
                    {filteredProjectTasks.length !== projectTasks.length ? ` · ${filteredProjectTasks.length} shown` : ''}
                  </p>
                </div>

                {/* Filter bar */}
                <div style={{ padding: '0 22px 14px', borderBottom: '1px solid rgba(216,210,198,0.4)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <select
                    value={projectTaskStatusFilter}
                    onChange={e => setProjectTaskStatusFilter(e.target.value)}
                    style={{ ...SELECT_BASE, fontSize: 12, padding: '5px 8px' }}
                  >
                    <option value="all">All Status</option>
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="review">Review</option>
                    <option value="done">Done</option>
                  </select>
                  <select
                    value={projectTaskPriorityFilter}
                    onChange={e => setProjectTaskPriorityFilter(e.target.value)}
                    style={{ ...SELECT_BASE, fontSize: 12, padding: '5px 8px' }}
                  >
                    <option value="all">All Priority</option>
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#747474', cursor: 'pointer', ...FONT }}>
                    <input
                      type="checkbox"
                      checked={projectHideDone}
                      onChange={e => setProjectHideDone(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    Hide done
                  </label>
                  <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                    {(['due', 'priority', 'created'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => setProjectSortBy(s)}
                        style={{
                          ...FONT, fontSize: 11, fontWeight: projectSortBy === s ? 600 : 500,
                          padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                          background: projectSortBy === s ? '#2C2C2C' : 'transparent',
                          color: projectSortBy === s ? '#FAF9F6' : '#747474',
                        }}
                      >
                        {s === 'due' ? 'Due Date' : s === 'priority' ? 'Priority' : 'Created'}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      setNtProject(String(selectedProject.id))
                      setShowNewTaskModal(true)
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 7, border: '1px solid #D8D2C6', background: '#FBF0E3', color: '#2C2C2C', fontSize: 12, fontWeight: 600, cursor: 'pointer', ...FONT }}
                  >
                    <Plus size={12} /> Add Task
                  </button>
                </div>

                {/* Task rows — grouped if any task has a task_group */}
                <div style={{ padding: '0 22px' }}>
                  {projectTasks.length === 0 ? (
                    <p style={{ fontSize: 13, color: '#747474', padding: '16px 0' }}>No tasks yet. Add one above.</p>
                  ) : filteredProjectTasks.length === 0 ? (
                    <p style={{ fontSize: 13, color: '#747474', padding: '16px 0' }}>No tasks match the current filters.</p>
                  ) : (() => {
                    const hasAnyGroup = filteredProjectTasks.some(t => t.task_group)
                    if (!hasAnyGroup) {
                      return filteredProjectTasks.map(t => (
                        <TaskRow key={t.id} task={t} onUpdate={updateTask} onDelete={deleteTask} onOpen={setDrawerTask}
                          showProject={false} draggable={true}
                          onDragStart={() => handleDragStart(t.id)} onDragEnter={() => handleDragEnter(t.id)}
                          onDragOver={e => e.preventDefault()} onDrop={() => handleDrop(t.id)} onDragEnd={handleDragEnd}
                          isDragging={dragId === t.id} isDragOver={dragOverId === t.id} />
                      ))
                    }

                    // Build ordered group list, preserving first-seen order
                    const groupOrder: string[] = []
                    const byGroup: Record<string, Task[]> = {}
                    for (const t of filteredProjectTasks) {
                      const g = t.task_group ?? ''
                      if (!byGroup[g]) { byGroup[g] = []; if (g) groupOrder.push(g) }
                      byGroup[g].push(t)
                    }
                    // Named groups first, ungrouped last
                    const sections: string[] = [...new Set(groupOrder)]
                    if (byGroup['']) sections.push('')

                    return sections.flatMap(g => {
                      const gtasks = byGroup[g] ?? []
                      if (gtasks.length === 0) return []
                      return [
                        g ? (
                          <div key={`g-${g}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 0 6px', borderTop: '1px solid rgba(216,210,198,0.4)' }}>
                            <div style={{ width: 8, height: 8, borderRadius: 2, background: COLOR_HEX[selectedProject?.color ?? 'sage'] ?? '#9BAE9A', flexShrink: 0 }} />
                            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#747474', ...FONT }}>{g}</span>
                            <button
                              onClick={() => { setNtProject(String(selectedProject!.id)); setShowNewTaskModal(true); setNtGroupPreset(g) }}
                              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', color: '#747474', fontSize: 11, ...FONT, opacity: 0.6 }}
                              title={`Add recipe to ${g}`}
                            ><Plus size={11} /> Add</button>
                          </div>
                        ) : (
                          sections.length > 1 ? (
                            <div key="g-ungrouped" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 0 6px', borderTop: '1px solid rgba(216,210,198,0.4)' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#D8D2C6', ...FONT }}>Ungrouped</span>
                            </div>
                          ) : null
                        ),
                        ...gtasks.map(t => (
                          <TaskRow key={t.id} task={t} onUpdate={updateTask} onDelete={deleteTask} onOpen={setDrawerTask}
                            showProject={false} draggable={true}
                            onDragStart={() => handleDragStart(t.id)} onDragEnter={() => handleDragEnter(t.id)}
                            onDragOver={e => e.preventDefault()} onDrop={() => handleDrop(t.id)} onDragEnd={handleDragEnd}
                            isDragging={dragId === t.id} isDragOver={dragOverId === t.id} />
                        )),
                      ]
                    })
                  })()}
                </div>

                {/* New group button */}
                <div style={{ padding: '10px 22px 16px', borderTop: '1px solid rgba(216,210,198,0.3)' }}>
                  <GroupCreator
                    onAdd={(groupName) => {
                      setNtProject(String(selectedProject!.id))
                      setShowNewTaskModal(true)
                      setNtGroupPreset(groupName)
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Right: Project details editor */}
            <div>
              <div style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 12, padding: 22 }}>
                {/* Color accent bar */}
                <div style={{ height: 5, background: COLOR_HEX[editColor] ?? '#9BAE9A', borderRadius: 999, marginBottom: 18 }} />

                {/* Name + delete */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ flex: 1, minWidth: 0, marginRight: 10 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#747474', margin: '0 0 6px' }}>Project Name</p>
                    <input
                      value={editName}
                      onChange={e => { setEditName(e.target.value); scheduleProjectSave() }}
                      style={{ width: '100%', ...FONT, fontSize: 15, fontWeight: 600, color: '#2C2C2C', border: 'none', borderBottom: '1px solid #D8D2C6', outline: 'none', background: 'transparent', padding: '2px 0', boxSizing: 'border-box' }}
                    />
                  </div>
                  <button
                    onClick={async () => {
                      if (!confirm('Delete this project and all its tasks?')) return
                      await fetch(`/api/projects/${selectedProject.id}`, { method: 'DELETE' })
                      setProjects(prev => prev.filter(p => p.id !== selectedProject.id))
                      setTasks(prev => prev.filter(t => t.project_id !== selectedProject.id))
                      setSelectedProject(null)
                    }}
                    style={{ padding: '4px 6px', border: 'none', background: 'none', cursor: 'pointer', color: '#C14B3A', opacity: 0.5, flexShrink: 0 }}
                    title="Delete project"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Status */}
                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#747474', margin: '0 0 6px' }}>Status</p>
                  <select
                    value={editStatus}
                    onChange={e => { setEditStatus(e.target.value); scheduleProjectSave() }}
                    style={{ ...SELECT_BASE, width: '100%', fontSize: 12.5, boxSizing: 'border-box' as const }}
                  >
                    <option value="planning">Planning</option>
                    <option value="active">Active</option>
                    <option value="on_hold">On Hold</option>
                    <option value="complete">Complete</option>
                  </select>
                </div>

                {/* Due date */}
                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#747474', margin: '0 0 6px' }}>Due Date</p>
                  <input
                    type="date"
                    value={editDueDate}
                    onChange={e => { setEditDueDate(e.target.value); scheduleProjectSave() }}
                    style={{ ...SELECT_BASE, width: '100%', fontSize: 12.5, colorScheme: 'light' as const, boxSizing: 'border-box' as const }}
                  />
                </div>

                {/* Description */}
                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#747474', margin: '0 0 6px' }}>Description</p>
                  <textarea
                    value={editDesc}
                    onChange={e => { setEditDesc(e.target.value); scheduleProjectSave() }}
                    rows={3}
                    placeholder="Add a description…"
                    style={{ ...FONT, width: '100%', fontSize: 12.5, color: '#2C2C2C', border: '1px solid #D8D2C6', borderRadius: 8, padding: '8px 10px', resize: 'vertical', outline: 'none', background: '#FAFAF8', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Color picker */}
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#747474', margin: '0 0 8px' }}>Color</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {COLOR_OPTIONS.map(c => (
                      <button
                        key={c}
                        onClick={() => { setEditColor(c); scheduleProjectSave() }}
                        style={{
                          width: 22, height: 22, borderRadius: 999,
                          border: editColor === c ? '2.5px solid #2C2C2C' : '2.5px solid transparent',
                          background: COLOR_HEX[c], cursor: 'pointer', padding: 0,
                          outline: editColor === c ? '1px solid rgba(255,255,255,0.9)' : 'none',
                          outlineOffset: -3,
                        }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>

                {/* Progress */}
                {(() => {
                  const taskCount = selectedProject.task_count ?? 0
                  const doneCount = selectedProject.completed_task_count ?? 0
                  const progress = taskCount > 0 ? Math.round(doneCount / taskCount * 100) : 0
                  return (
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#747474', margin: '0 0 6px' }}>Progress</p>
                      <div style={{ position: 'relative', height: 8, background: '#FBF0E3', borderRadius: 999, overflow: 'hidden', marginBottom: 5 }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${progress}%`, background: COLOR_HEX[editColor] ?? '#9BAE9A', borderRadius: 999, opacity: 0.85 }} />
                      </div>
                      <p style={{ fontSize: 11, color: '#747474', ...FONT, margin: 0 }}>{doneCount}/{taskCount} tasks · {progress}%</p>
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Gantt tab ── */}
      {tab === 'gantt' && (
        <div style={{ height: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <GanttChart
            tasks={tasks}
            projects={projects}
            subtasks={subtasks}
            onOpenTask={setDrawerTask}
            onOpenSubtask={s => setDrawerSubtask(s)}
          />
        </div>
      )}

      {/* ── New Task Modal ── */}
      {showNewTaskModal && (
        <div
          onClick={() => setShowNewTaskModal(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(44,44,44,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, backdropFilter: 'blur(2px)' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 16, padding: 28, width: 460, boxShadow: '0 12px 40px rgba(44,44,44,0.18)', ...FONT }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
              <h2 style={{ ...SERIF, fontWeight: 700, fontSize: 26, color: '#2C2C2C', margin: 0 }}>New Task</h2>
              <button onClick={() => setShowNewTaskModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#747474', fontSize: 22, lineHeight: 1, padding: '0 4px' }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#747474', display: 'block', marginBottom: 6 }}>Title *</label>
                <input
                  autoFocus
                  placeholder="Task title…"
                  value={ntTitle}
                  onChange={e => setNtTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addNewTask() }}
                  style={{ width: '100%', ...FONT, fontSize: 13.5, color: '#2C2C2C', border: '1px solid #D8D2C6', borderRadius: 8, padding: '9px 12px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#747474', display: 'block', marginBottom: 6 }}>Project</label>
                <select
                  value={ntProject}
                  onChange={e => setNtProject(e.target.value)}
                  style={{ ...SELECT_BASE, width: '100%', fontSize: 13, boxSizing: 'border-box' as const }}
                >
                  <option value="">No project</option>
                  {projectOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              {ntGroupPreset && (
                <div>
                  <label style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#747474', display: 'block', marginBottom: 6 }}>Group</label>
                  <input
                    value={ntGroupPreset}
                    onChange={e => setNtGroupPreset(e.target.value)}
                    placeholder="Group name…"
                    style={{ width: '100%', ...FONT, fontSize: 13, color: '#2C2C2C', border: '1px solid #D8D2C6', borderRadius: 8, padding: '9px 12px', outline: 'none', boxSizing: 'border-box' as const }}
                  />
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#747474', display: 'block', marginBottom: 6 }}>Priority</label>
                  <select value={ntPriority} onChange={e => setNtPriority(e.target.value)} style={{ ...SELECT_BASE, width: '100%', fontSize: 13, boxSizing: 'border-box' as const }}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#747474', display: 'block', marginBottom: 6 }}>Due Date</label>
                  <input
                    type="date"
                    value={ntDue}
                    onChange={e => setNtDue(e.target.value)}
                    style={{ ...SELECT_BASE, width: '100%', fontSize: 13, colorScheme: 'light' as const, boxSizing: 'border-box' as const }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
              <button
                onClick={() => setShowNewTaskModal(false)}
                style={{ ...FONT, fontSize: 13, fontWeight: 600, padding: '9px 18px', borderRadius: 8, border: '1px solid #D8D2C6', background: 'transparent', color: '#747474', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={addNewTask}
                disabled={!ntTitle.trim()}
                style={{ ...FONT, fontSize: 13, fontWeight: 600, padding: '9px 18px', borderRadius: 8, border: 'none', background: ntTitle.trim() ? '#2C2C2C' : '#D8D2C6', color: '#FAF9F6', cursor: ntTitle.trim() ? 'pointer' : 'default' }}
              >
                Add Task
              </button>
            </div>
          </div>
        </div>
      )}

      <TaskDetailDrawer
        task={drawerTask}
        onClose={() => setDrawerTask(null)}
        onUpdate={handleDrawerUpdate}
        onDelete={handleDrawerDelete}
        onSubtaskToggle={s => setSubtasks(prev => prev.map(sub => sub.id === s.id ? { ...sub, completed: s.completed, status: s.status } : sub))}
        onOpenSubtask={s => { setDrawerTask(null); setDrawerSubtask(s) }}
        onConvertToSubtask={s => setSubtasks(prev => [...prev, s])}
      />

      <SubtaskDetailDrawer
        subtask={drawerSubtask}
        onClose={() => setDrawerSubtask(null)}
        onUpdate={s => setSubtasks(prev => prev.map(sub => sub.id === s.id ? s : sub))}
        onDelete={async id => { await fetch(`/api/subtasks/${id}`, { method: 'DELETE' }); setSubtasks(prev => prev.filter(s => s.id !== id)); setDrawerSubtask(null) }}
        onOpenParentTask={taskId => {
          setDrawerSubtask(null)
          const t = tasks.find(t => t.id === taskId)
          if (t) setDrawerTask(t)
        }}
      />

      <NewProjectModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={p => setProjects(prev => [p, ...prev])}
      />
    </div>
  )
}
