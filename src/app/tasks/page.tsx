'use client'

import { useEffect, useState, useMemo } from 'react'
import { Check, Calendar, FileText, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react'
import { Task, Subtask, TaskStatus, TaskPriority } from '@/lib/types'
import { PriorityBadge, STATUS_SELECT_BG } from '@/components/ui/Badge'
import { TagChip } from '@/components/ui/TagPicker'
import { TaskDetailDrawer } from '@/components/projects/TaskDetailDrawer'
import { SubtaskDetailDrawer } from '@/components/projects/SubtaskDetailDrawer'
import { cn } from '@/lib/utils'
import { format, parseISO, isPast, isToday } from 'date-fns'
import Link from 'next/link'

const COLOR_DOT: Record<string, string> = {
  sage: 'bg-sage', terracotta: 'bg-terracotta', butter: 'bg-butter',
  tomato: 'bg-tomato', blueberry: 'bg-blueberry', thyme: 'bg-thyme',
  candy: 'bg-candy', citrus: 'bg-citrus',
}

function DatePill({ date }: { date: string }) {
  const parsed = parseISO(date)
  const overdue = isPast(parsed) && !isToday(parsed)
  const today = isToday(parsed)
  return (
    <span className={cn(
      'flex items-center gap-0.5 text-xs shrink-0',
      overdue ? 'text-tomato font-medium' : today ? 'text-terracotta font-medium' : 'text-ink'
    )}>
      <Calendar className="w-3 h-3" />
      {format(parsed, 'MMM d')}
    </span>
  )
}

function ItemCheckbox({ isDone, onToggle }: { isDone: boolean; onToggle: () => void }) {
  return (
    <div
      onClick={onToggle}
      role="button"
      style={{
        width: '18px',
        height: '18px',
        minWidth: '18px',
        borderRadius: '4px',
        border: `2px solid ${isDone ? '#2C2C2C' : '#D8D2C6'}`,
        backgroundColor: isDone ? '#2C2C2C' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {isDone && <Check style={{ width: 10, height: 10, color: '#FAF9F6', strokeWidth: 3 }} />}
    </div>
  )
}

type FlatItem =
  | { type: 'task'; item: Task }
  | { type: 'subtask'; item: Subtask }

function TaskFlatRow({ task, onUpdate, onDelete, onOpen }: {
  task: Task
  onUpdate: (t: Task) => void
  onDelete: (id: number) => void
  onOpen: (t: Task) => void
}) {
  const isDone = task.status === 'done'

  async function toggle() {
    const next: TaskStatus = isDone ? 'todo' : 'done'
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...task, status: next }),
    })
    onUpdate({ ...(await res.json()), tags: task.tags })
  }

  return (
    <div className={cn(
      'group flex items-center gap-2.5 px-4 py-2.5 bg-white rounded-xl border border-mushroom/60 hover:border-mushroom hover:shadow-sm transition-all',
      isDone && 'opacity-55'
    )}>
      <ItemCheckbox isDone={isDone} onToggle={toggle} />

      {/* Type pill */}
      <span className="text-[10px] px-1.5 py-0.5 rounded border bg-blueberry-light border-blueberry/30 text-blueberry shrink-0"
        style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
        Task
      </span>

      {/* Project pill */}
      {task.project_name && (
        <Link
          href={`/projects/${task.project_id}`}
          className="flex items-center gap-1 shrink-0 group/proj"
          onClick={e => e.stopPropagation()}
        >
          <span className={cn('w-2 h-2 rounded-full shrink-0', COLOR_DOT[task.project_color ?? ''] ?? 'bg-mushroom')} />
          <span className="text-xs text-ink group-hover/proj:text-ink-dark transition-colors"
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
            {task.project_name}
          </span>
        </Link>
      )}

      {/* Title */}
      <span
        className={cn('text-sm text-ink-dark flex-1 truncate min-w-0', isDone && 'line-through')}
        style={{ fontFamily: "'Jost', system-ui, sans-serif", fontWeight: 500 }}
      >
        {task.title}
      </span>

      {(task.subtask_count ?? 0) > 0 && (
        <span
          className={cn(
            'text-[10px] px-1.5 py-0.5 rounded-full border shrink-0',
            (task.completed_subtask_count ?? 0) === task.subtask_count
              ? 'bg-thyme-light border-thyme/30 text-thyme'
              : 'bg-oatmilk border-mushroom/60 text-ink'
          )}
          style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
        >
          {task.completed_subtask_count ?? 0}/{task.subtask_count}
        </span>
      )}
      {task.tags?.map(t => <TagChip key={t.id} tag={t} />)}
      {task.notes && <FileText className="w-3 h-3 text-ink/40 shrink-0" />}

      {/* Right side */}
      <div className="flex items-center gap-2 shrink-0 ml-auto">
        <span className={cn('text-xs px-2 py-0.5 rounded border', STATUS_SELECT_BG[task.status])}
          style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
          {{ todo: 'To Do', in_progress: 'In Progress', review: 'Review', done: 'Done' }[task.status]}
        </span>
        <PriorityBadge priority={task.priority} />
        {task.due_date && <DatePill date={task.due_date} />}
        <button onClick={() => onOpen(task)} className="text-ink/50 hover:text-ink cursor-pointer transition-colors" title="Open details">
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

function SubtaskFlatRow({ subtask, onUpdate, onOpen }: {
  subtask: Subtask
  onUpdate: (s: Subtask) => void
  onOpen: (s: Subtask) => void
}) {
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
    <div className={cn(
      'group flex items-center gap-2.5 px-4 py-2.5 bg-white rounded-xl border border-mushroom/60 hover:border-mushroom hover:shadow-sm transition-all',
      isDone && 'opacity-55'
    )}>
      <ItemCheckbox isDone={isDone} onToggle={toggle} />

      {/* Type pill */}
      <span className="text-[10px] px-1.5 py-0.5 rounded border bg-sage-light border-sage/40 text-ink-dark shrink-0"
        style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
        Sub
      </span>

      {/* Project pill */}
      {subtask.project_name && (
        <Link
          href={`/projects/${subtask.project_id}`}
          className="flex items-center gap-1 shrink-0 group/proj"
          onClick={e => e.stopPropagation()}
        >
          <span className={cn('w-2 h-2 rounded-full shrink-0', COLOR_DOT[subtask.project_color ?? ''] ?? 'bg-mushroom')} />
          <span className="text-xs text-ink group-hover/proj:text-ink-dark transition-colors"
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
            {subtask.project_name}
          </span>
        </Link>
      )}

      {/* Parent task name */}
      {subtask.task_title && (
        <span className="text-xs text-ink/60 shrink-0 truncate max-w-[120px]"
          style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
          {subtask.task_title}
        </span>
      )}

      {/* Title */}
      <span
        className={cn('text-sm text-ink-dark flex-1 truncate min-w-0', isDone && 'line-through')}
        style={{ fontFamily: "'Jost', system-ui, sans-serif", fontWeight: 500 }}
      >
        {subtask.title}
      </span>

      {subtask.tags?.map(t => <TagChip key={t.id} tag={t} />)}
      {subtask.notes && <FileText className="w-3 h-3 text-ink/40 shrink-0" />}

      {/* Right side */}
      <div className="flex items-center gap-2 shrink-0 ml-auto">
        <select
          value={subtask.status ?? 'todo'}
          onClick={e => e.stopPropagation()}
          onChange={async e => {
            const next = e.target.value as TaskStatus
            const res = await fetch(`/api/subtasks/${subtask.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...subtask, status: next, completed: next === 'done' }),
            })
            onUpdate(await res.json())
          }}
          className={cn('text-xs px-2 py-0.5 rounded border cursor-pointer outline-none', STATUS_SELECT_BG[subtask.status ?? 'todo'])}
          style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
        >
          <option value="todo">To Do</option>
          <option value="in_progress">In Progress</option>
          <option value="review">Review</option>
          <option value="done">Done</option>
        </select>
        {subtask.due_date && <DatePill date={subtask.due_date} />}
        <button onClick={() => onOpen(subtask)} className="text-ink/50 hover:text-ink cursor-pointer transition-colors" title="Open details">
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

export default function AllTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all')
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'task' | 'subtask'>('all')
  const [drawerTask, setDrawerTask] = useState<Task | null>(null)
  const [drawerSubtask, setDrawerSubtask] = useState<Subtask | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)

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

  const projects = useMemo(() => {
    const seen = new Map<string, string>()
    for (const t of tasks) {
      if (t.project_id && t.project_name) seen.set(String(t.project_id), t.project_name)
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }))
  }, [tasks])

  // Tasks that have at least one subtask — they won't get their own row in 'all' view
  const taskIdsWithSubtasks = useMemo(
    () => new Set(subtasks.map(s => s.task_id)),
    [subtasks]
  )

  const flatItems: FlatItem[] = useMemo(() => {
    const taskItems: FlatItem[] = tasks
      .filter(t => {
        if (typeFilter === 'subtask') return false
        // In 'all' view, hide tasks that have subtasks (they're represented by their subtask rows)
        if (typeFilter === 'all' && taskIdsWithSubtasks.has(t.id)) return false
        if (statusFilter !== 'all' && t.status !== statusFilter) return false
        if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false
        if (projectFilter !== 'all' && String(t.project_id) !== projectFilter) return false
        return true
      })
      .map(t => ({ type: 'task' as const, item: t }))

    const subtaskItems: FlatItem[] = subtasks
      .filter(s => {
        if (typeFilter === 'task') return false
        if (statusFilter !== 'all' && (s.status ?? 'todo') !== statusFilter) return false
        if (projectFilter !== 'all' && String(s.project_id) !== projectFilter) return false
        return true
      })
      .map(s => ({ type: 'subtask' as const, item: s }))

    // Merge and sort: due_date ASC (nulls last), then created_at DESC
    return [...taskItems, ...subtaskItems].sort((a, b) => {
      const da = a.item.due_date, db = b.item.due_date
      if (da && db) return da.localeCompare(db)
      if (da) return -1
      if (db) return 1
      return b.item.created_at.localeCompare(a.item.created_at)
    })
  }, [tasks, subtasks, statusFilter, priorityFilter, projectFilter, typeFilter, taskIdsWithSubtasks])

  const activeItems = flatItems.filter(i =>
    i.type === 'task' ? i.item.status !== 'done' : (i.item.status !== 'done' && !i.item.completed)
  )
  const doneItems = flatItems.filter(i =>
    i.type === 'task' ? i.item.status === 'done' : (i.item.status === 'done' || i.item.completed)
  )

  const selectClass = "text-xs bg-white border border-mushroom rounded-lg px-3 py-1.5 outline-none text-ink cursor-pointer"

  return (
    <>
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="px-8 pt-8 pb-5 border-b border-mushroom shrink-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-ink font-semibold mb-1"
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
            Command Center
          </p>
          <h1 className="text-3xl text-ink-dark mb-4"
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700 }}>
            All Tasks
          </h1>

          <div className="flex items-center gap-2 flex-wrap" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as 'all' | 'task' | 'subtask')} className={selectClass}>
              <option value="all">Tasks + Subtasks</option>
              <option value="task">Tasks only</option>
              <option value="subtask">Subtasks only</option>
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as TaskStatus | 'all')} className={selectClass}>
              <option value="all">All Statuses</option>
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="review">Review</option>
              <option value="done">Done</option>
            </select>
            {typeFilter !== 'subtask' && (
              <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value as TaskPriority | 'all')} className={selectClass}>
                <option value="all">All Priorities</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            )}
            {projects.length > 0 && (
              <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className={selectClass}>
                <option value="all">All Projects</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <span className="text-xs text-ink ml-auto" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
              {activeItems.length} active · {doneItems.length} done
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          {loading ? (
            <p className="text-sm text-ink" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Loading…</p>
          ) : flatItems.length === 0 ? (
            <p className="text-sm text-ink" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>No items match your filters.</p>
          ) : (
            <>
              {activeItems.length > 0 && (
                <div className="space-y-1.5">
                  {activeItems.map(fi =>
                    fi.type === 'task' ? (
                      <TaskFlatRow
                        key={`task-${fi.item.id}`}
                        task={fi.item as Task}
                        onUpdate={updated => setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))}
                        onDelete={async id => { await fetch(`/api/tasks/${id}`, { method: 'DELETE' }); setTasks(prev => prev.filter(t => t.id !== id)) }}
                        onOpen={setDrawerTask}
                      />
                    ) : (
                      <SubtaskFlatRow
                        key={`sub-${fi.item.id}`}
                        subtask={fi.item as Subtask}
                        onUpdate={updated => setSubtasks(prev => prev.map(s => s.id === updated.id ? updated : s))}
                        onOpen={setDrawerSubtask}
                      />
                    )
                  )}
                </div>
              )}

              {doneItems.length > 0 && (
                <div className="space-y-1.5">
                  <button
                    onClick={() => setShowCompleted(v => !v)}
                    className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] text-ink font-semibold cursor-pointer hover:text-ink-dark transition-colors"
                    style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                  >
                    {showCompleted ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    Completed ({doneItems.length})
                  </button>
                  {showCompleted && doneItems.map(fi =>
                    fi.type === 'task' ? (
                      <TaskFlatRow
                        key={`task-${fi.item.id}`}
                        task={fi.item as Task}
                        onUpdate={updated => setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))}
                        onDelete={async id => { await fetch(`/api/tasks/${id}`, { method: 'DELETE' }); setTasks(prev => prev.filter(t => t.id !== id)) }}
                        onOpen={setDrawerTask}
                      />
                    ) : (
                      <SubtaskFlatRow
                        key={`sub-${fi.item.id}`}
                        subtask={fi.item as Subtask}
                        onUpdate={updated => setSubtasks(prev => prev.map(s => s.id === updated.id ? updated : s))}
                        onOpen={setDrawerSubtask}
                      />
                    )
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <TaskDetailDrawer
        task={drawerTask}
        onClose={() => setDrawerTask(null)}
        onUpdate={updated => { setTasks(prev => prev.map(t => t.id === updated.id ? updated : t)); setDrawerTask(updated) }}
        onDelete={id => { setTasks(prev => prev.filter(t => t.id !== id)); setDrawerTask(null) }}
      />
      <SubtaskDetailDrawer
        subtask={drawerSubtask}
        onClose={() => setDrawerSubtask(null)}
        onUpdate={updated => { setSubtasks(prev => prev.map(s => s.id === updated.id ? updated : s)); setDrawerSubtask(updated) }}
        onDelete={id => { setSubtasks(prev => prev.filter(s => s.id !== id)); setDrawerSubtask(null) }}
      />
    </>
  )
}
