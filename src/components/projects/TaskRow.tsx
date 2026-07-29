'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Trash2, ChevronDown, ChevronRight, Calendar, Plus, FileText, ExternalLink, Circle, CheckCircle2, GripVertical } from 'lucide-react'
import { Task, Subtask, Tag, TaskStatus, TaskPriority } from '@/lib/types'
import { PriorityBadge } from '@/components/ui/Badge'
import { STATUS_SELECT_BG, PRIORITY_SELECT_BG } from '@/components/ui/Badge'
import { TagChip, TagPicker } from '@/components/ui/TagPicker'
import { SubtaskDetailDrawer } from './SubtaskDetailDrawer'
import { TaskDetailDrawer } from './TaskDetailDrawer'
import { cn } from '@/lib/utils'
import { format, parseISO } from 'date-fns'
import Link from 'next/link'

interface Props {
  task: Task
  onUpdate: (task: Task) => void
  onDelete: (id: number) => void
  showProject?: boolean
}

const PROJECT_COLOR_MAP: Record<string, string> = {
  sage: 'bg-sage', terracotta: 'bg-terracotta', butter: 'bg-butter',
  tomato: 'bg-tomato', blueberry: 'bg-blueberry', thyme: 'bg-thyme',
  candy: 'bg-candy', citrus: 'bg-citrus',
}

const SUBTASK_STATUS_COLORS: Record<string, string> = {
  todo:        'text-ink bg-white border-mushroom/60',
  in_progress: 'text-ink-dark bg-blueberry-light border-blueberry/30',
  review:      'text-ink-dark bg-butter-light border-butter/40',
  done:        'text-white bg-thyme border-thyme',
}
const SUBTASK_STATUS_LABELS: Record<string, string> = {
  todo: 'To Do', in_progress: 'In Progress', review: 'Review', done: 'Done',
}

function SubtaskRow({ subtask, onUpdate, onDelete, onOpenDrawer, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd }: {
  subtask: Subtask
  onUpdate: (s: Subtask) => void
  onDelete: (id: number) => void
  onOpenDrawer: (s: Subtask) => void
  isDragOver: boolean
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: () => void
  onDragEnd: () => void
}) {
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [tags, setTags] = useState<Tag[]>(subtask.tags ?? [])
  const isDone = subtask.status === 'done' || subtask.completed

  async function addTag(tag: Tag) {
    await fetch(`/api/subtasks/${subtask.id}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_id: tag.id }),
    })
    setTags(prev => [...prev, tag])
  }

  async function removeTag(tag: Tag) {
    await fetch(`/api/subtasks/${subtask.id}/tags`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_id: tag.id }),
    })
    setTags(prev => prev.filter(t => t.id !== tag.id))
  }

  async function toggle() {
    const nextStatus: TaskStatus = isDone ? 'todo' : 'done'
    const res = await fetch(`/api/subtasks/${subtask.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...subtask, status: nextStatus, completed: !isDone }),
    })
    onUpdate(await res.json())
  }

  async function saveDate(date: string | null) {
    const res = await fetch(`/api/subtasks/${subtask.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...subtask, due_date: date }),
    })
    onUpdate(await res.json())
    setShowDatePicker(false)
  }

  // Grid columns: grip | toggle | title+badge | status | date | tags | actions
  const gridCols = '16px 22px minmax(0,1fr) 124px 80px minmax(100px,1fr) 52px'

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={cn(
        'group/sub grid items-center py-2 pl-1 pr-1 rounded-lg hover:bg-oatmilk/60 transition-all',
        isDragOver && 'border-t-2 border-blueberry'
      )}
      style={{ gridTemplateColumns: gridCols, columnGap: '8px' }}
    >
      {/* 1 — Grip */}
      <GripVertical className="w-3.5 h-3.5 text-mushroom hover:text-ink cursor-grab active:cursor-grabbing opacity-0 group-hover/sub:opacity-100 transition-opacity justify-self-center" />

      {/* 2 — Toggle */}
      <button onClick={toggle} className="cursor-pointer transition-colors justify-self-center" title="Toggle done">
        {isDone
          ? <CheckCircle2 className="w-[18px] h-[18px] text-ink" />
          : <Circle className="w-[18px] h-[18px] text-mushroom hover:text-ink transition-colors" />
        }
      </button>

      {/* 3 — Title + sub-item badge (wraps to 2 lines, never pushes other cols) */}
      <div className="flex items-start gap-1.5 min-w-0 py-0.5">
        <span
          className={cn('text-sm text-ink-dark leading-snug', isDone && 'line-through text-ink/50')}
          style={{ fontFamily: "'Jost', system-ui, sans-serif", fontWeight: 600 }}
        >
          {subtask.title}
        </span>
        {(subtask.subitem_count ?? 0) > 0 && (
          <span
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 mt-0.5',
              (subtask.completed_subitem_count ?? 0) === (subtask.subitem_count ?? 0)
                ? 'bg-thyme-light border-thyme/30 text-thyme'
                : 'bg-oatmilk border-mushroom/60 text-ink'
            )}
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
          >
            {subtask.completed_subitem_count ?? 0}/{subtask.subitem_count}
          </span>
        )}
      </div>

      {/* 4 — Status (124px) */}
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
        className={cn('w-full text-xs px-2 py-1 rounded border outline-none cursor-pointer', SUBTASK_STATUS_COLORS[subtask.status ?? 'todo'])}
        style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
      >
        <option value="todo">To Do</option>
        <option value="in_progress">In Progress</option>
        <option value="review">Review</option>
        <option value="done">Done</option>
      </select>

      {/* 5 — Date (80px) */}
      <div className="flex justify-center">
        {showDatePicker ? (
          <input
            type="date"
            autoFocus
            defaultValue={subtask.due_date ?? ''}
            onChange={e => saveDate(e.target.value || null)}
            onBlur={() => setShowDatePicker(false)}
            className="w-full text-xs bg-white border border-mushroom rounded px-1.5 py-0.5 outline-none cursor-pointer"
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
          />
        ) : (
          <button
            onClick={() => setShowDatePicker(true)}
            className={cn(
              'flex items-center gap-0.5 text-xs transition-colors cursor-pointer rounded px-1.5 py-0.5 w-full justify-center',
              subtask.due_date ? 'text-ink-dark font-medium hover:bg-oatmilk' : 'text-mushroom/60 hover:text-ink'
            )}
          >
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            {subtask.due_date ? format(parseISO(subtask.due_date), 'MMM d') : null}
          </button>
        )}
      </div>

      {/* 6 — Tags (flexible, min 100px) */}
      <div className="flex items-center gap-1 min-w-0 overflow-hidden">
        {subtask.notes && <FileText className="w-3.5 h-3.5 text-ink/50 shrink-0" />}
        {tags.map(t => <TagChip key={t.id} tag={t} onRemove={() => removeTag(t)} />)}
        <TagPicker selectedTags={tags} onAdd={addTag} onRemove={removeTag} />
      </div>

      {/* 7 — Actions (52px) */}
      <div className="flex items-center justify-end gap-1.5">
        <button
          onClick={() => onOpenDrawer(subtask)}
          className="text-ink/50 hover:text-ink transition-colors cursor-pointer"
          title="Open details"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(subtask.id)}
          className="opacity-0 group-hover/sub:opacity-100 text-ink hover:text-tomato transition-all cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

export function TaskRow({ task, onUpdate, onDelete, showProject }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes ?? '')
  const [tags, setTags] = useState<Tag[]>(task.tags ?? [])
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [subtasksLoaded, setSubtasksLoaded] = useState(false)
  const [newSubtask, setNewSubtask] = useState('')
  const [newSubtaskStatus, setNewSubtaskStatus] = useState<TaskStatus>('todo')
  const [newSubtaskDate, setNewSubtaskDate] = useState('')
  const [newSubtaskTags, setNewSubtaskTags] = useState<Tag[]>([])
  const [addingSubtask, setAddingSubtask] = useState(false)
  const [drawerSubtask, setDrawerSubtask] = useState<Subtask | null>(null)
  const [drawerTask, setDrawerTask] = useState<Task | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragIndexRef = useRef<number | null>(null)
  const [showDoneSubtasks, setShowDoneSubtasks] = useState(false)
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setTags(task.tags ?? []) }, [task.tags])

  useEffect(() => {
    if (expanded && !subtasksLoaded) {
      fetch(`/api/subtasks?task_id=${task.id}`)
        .then(r => r.json())
        .then(subs => { setSubtasks(subs); setSubtasksLoaded(true) })
    }
  }, [expanded, task.id, subtasksLoaded])

  async function saveField(patch: Partial<Task>) {
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...task, notes, ...patch }),
    })
    onUpdate({ ...(await res.json()), tags })
  }

  async function saveTitle() {
    if (!title.trim() || title === task.title) { setEditingTitle(false); return }
    await saveField({ title })
    setEditingTitle(false)
  }

  function handleNotesChange(val: string) {
    setNotes(val)
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => saveField({ notes: val }), 800)
  }

  async function addSubtask() {
    if (!newSubtask.trim()) return
    const res = await fetch('/api/subtasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: task.id,
        title: newSubtask.trim(),
        status: newSubtaskStatus,
        due_date: newSubtaskDate || null,
      }),
    })
    const subtask = await res.json()
    // Attach any selected tags
    await Promise.all(newSubtaskTags.map(tag =>
      fetch(`/api/subtasks/${subtask.id}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag_id: tag.id }),
      })
    ))
    setSubtasks(prev => [...prev, { ...subtask, tags: newSubtaskTags }])
    setNewSubtask('')
    setNewSubtaskStatus('todo')
    setNewSubtaskDate('')
    setNewSubtaskTags([])
    setAddingSubtask(false)
  }

  async function addTag(tag: Tag) {
    await fetch(`/api/tasks/${task.id}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_id: tag.id }),
    })
    setTags(prev => [...prev, tag])
  }

  async function removeTag(tag: Tag) {
    await fetch(`/api/tasks/${task.id}/tags`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_id: tag.id }),
    })
    setTags(prev => prev.filter(t => t.id !== tag.id))
  }

  async function handleDrop(dropIndex: number) {
    const fromIndex = dragIndexRef.current
    if (fromIndex === null || fromIndex === dropIndex) {
      setDragOverIndex(null)
      dragIndexRef.current = null
      return
    }
    // Drag operates only on active subtasks; rebuild full list preserving done order at end
    const active = subtasks.filter(s => s.status !== 'done' && !s.completed)
    const done = subtasks.filter(s => s.status === 'done' || s.completed)
    const [moved] = active.splice(fromIndex, 1)
    active.splice(dropIndex, 0, moved)
    const reordered = [...active, ...done]
    setSubtasks(reordered)
    setDragOverIndex(null)
    dragIndexRef.current = null
    await fetch('/api/subtasks/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: reordered.map(s => s.id) }),
    })
  }

  const doneSubtasks = subtasks.filter(s => s.status === 'done' || s.completed).length
  const totalSubtasksCount = subtasksLoaded ? subtasks.length : (task.subtask_count ?? 0)
  const doneSubtasksCount = subtasksLoaded ? doneSubtasks : (task.completed_subtask_count ?? 0)

  return (
    <>
      <div className={cn(
        'group bg-white rounded-xl border border-mushroom/60 transition-all duration-150',
        task.status === 'done' && 'opacity-60',
        'hover:border-mushroom hover:shadow-sm'
      )}>
        {/* Main row */}
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Done checkbox */}
          <button
            onClick={() => saveField({ status: task.status === 'done' ? 'todo' : 'done' })}
            className={cn(
              'w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center transition-all cursor-pointer',
              task.status === 'done' ? 'bg-ink-dark border-ink-dark' : 'border-mushroom hover:border-ink'
            )}
          >
            {task.status === 'done' && <Check className="w-3 h-3 text-cream" strokeWidth={3} />}
          </button>

          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 text-ink hover:text-ink-dark transition-colors cursor-pointer"
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          {/* Title + tags inline */}
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input
                autoFocus
                value={title}
                onChange={e => setTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
                className="w-full text-sm bg-transparent outline-none border-b border-ink text-ink-dark"
                style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
              />
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                {showProject && task.project_name && (
                  <Link
                    href={`/projects/${task.project_id}`}
                    className="flex items-center gap-1 shrink-0 group/proj"
                    onClick={e => e.stopPropagation()}
                  >
                    <span className={cn('w-2 h-2 rounded-full shrink-0', PROJECT_COLOR_MAP[task.project_color ?? ''] ?? 'bg-mushroom')} />
                    <span className="text-xs text-ink group-hover/proj:text-ink-dark transition-colors"
                      style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                      {task.project_name}
                    </span>
                  </Link>
                )}
                <span
                  className={cn('text-sm text-ink-dark cursor-pointer', task.status === 'done' && 'line-through text-ink/60')}
                  style={{ fontFamily: "'Jost', system-ui, sans-serif", fontWeight: 600 }}
                  onDoubleClick={() => setEditingTitle(true)}
                >
                  {task.title}
                </span>
                {tags.map(t => <TagChip key={t.id} tag={t} />)}
                {notes && <FileText className="w-3 h-3 text-ink/40 shrink-0" />}
                {totalSubtasksCount > 0 && (
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded-full border shrink-0',
                      doneSubtasksCount === totalSubtasksCount
                        ? 'bg-thyme-light border-thyme/30 text-thyme'
                        : 'bg-oatmilk border-mushroom/60 text-ink'
                    )}
                    style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                  >
                    {doneSubtasksCount}/{totalSubtasksCount}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Right-side controls — fixed-width columns so every row aligns */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-[118px] shrink-0">
              <select
                value={task.status}
                onChange={e => saveField({ status: e.target.value as TaskStatus })}
                className={cn('w-full text-xs border rounded-lg px-2 py-1 outline-none cursor-pointer transition-colors', STATUS_SELECT_BG[task.status])}
                style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="review">Review</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div className="w-[90px] shrink-0">
              <select
                value={task.priority}
                onChange={e => saveField({ priority: e.target.value as TaskPriority })}
                className={cn('w-full text-xs border rounded-lg px-2 py-1 outline-none cursor-pointer transition-colors', PRIORITY_SELECT_BG[task.priority])}
                style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            {/* Date — fixed width so date/icon column stays put */}
            <div className="w-[76px] shrink-0 flex justify-center">
              {showDatePicker ? (
                <input
                  type="date"
                  autoFocus
                  value={task.due_date ?? ''}
                  onChange={e => { saveField({ due_date: e.target.value || null }); setShowDatePicker(false) }}
                  onBlur={() => setShowDatePicker(false)}
                  className="w-full text-xs bg-white border border-mushroom rounded px-1.5 py-0.5 outline-none cursor-pointer"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                />
              ) : (
                <button
                  onClick={() => setShowDatePicker(true)}
                  className={cn(
                    'flex items-center gap-1 text-xs transition-colors cursor-pointer rounded px-1.5 py-0.5 w-full justify-center',
                    task.due_date ? 'text-ink hover:bg-oatmilk' : 'text-mushroom hover:text-ink hover:bg-oatmilk'
                  )}
                >
                  <Calendar className="w-3 h-3 shrink-0" />
                  {task.due_date ? format(parseISO(task.due_date), 'MMM d') : null}
                </button>
              )}
            </div>

            {/* Action icons — fixed width */}
            <div className="w-[52px] shrink-0 flex items-center justify-end gap-1.5">
              <button
                onClick={() => setDrawerTask({ ...task, tags })}
                className="text-ink/50 hover:text-ink transition-colors cursor-pointer"
                title="Open details"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete(task.id)}
                className="opacity-0 group-hover:opacity-100 text-ink hover:text-tomato transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Expanded panel */}
        {expanded && (
          <div className="px-6 pb-4 space-y-4 border-t border-mushroom/30 pt-3">
            <div>
              <label className="block text-xs font-semibold text-ink uppercase tracking-widest mb-1.5"
                style={{ fontFamily: "'Jost', system-ui, sans-serif", fontSize: '10px', letterSpacing: '0.12em' }}>
                Notes
              </label>
              <textarea
                value={notes}
                onChange={e => handleNotesChange(e.target.value)}
                placeholder="Add notes, context, or links…"
                rows={3}
                className="w-full px-3 py-2 text-sm bg-white border border-mushroom/60 rounded-lg outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink text-ink-dark placeholder:text-ink/40 resize-none transition-all"
                style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink uppercase tracking-widest mb-1.5"
                style={{ fontFamily: "'Jost', system-ui, sans-serif", fontSize: '10px', letterSpacing: '0.12em' }}>
                Tags
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {tags.map(t => <TagChip key={t.id} tag={t} onRemove={() => removeTag(t)} />)}
                <TagPicker selectedTags={tags} onAdd={addTag} onRemove={removeTag} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink uppercase tracking-widest mb-1.5"
                style={{ fontFamily: "'Jost', system-ui, sans-serif", fontSize: '10px', letterSpacing: '0.12em' }}>
                Subtasks {totalSubtasksCount > 0 && (
                  <span className="normal-case font-normal">({doneSubtasksCount}/{totalSubtasksCount})</span>
                )}
              </label>

              {(() => {
                const activeSubtasks = subtasks.filter(s => s.status !== 'done' && !s.completed)
                const doneSubtasksList = subtasks.filter(s => s.status === 'done' || s.completed)
                const handleUpdate = (updated: Subtask) => setSubtasks(prev => {
                  const next = prev.map(x => x.id === updated.id ? updated : x)
                  // Move newly-done to end, newly-undone to before done items
                  const a = next.filter(s => s.status !== 'done' && !s.completed)
                  const d = next.filter(s => s.status === 'done' || s.completed)
                  return [...a, ...d]
                })
                return (
                  <div className="overflow-x-auto -mx-2 px-2">
                  <div className="space-y-0.5 min-w-[700px]">
                    {activeSubtasks.map((s, i) => (
                      <SubtaskRow
                        key={s.id}
                        subtask={s}
                        onUpdate={handleUpdate}
                        onDelete={id => { setSubtasks(prev => prev.filter(x => x.id !== id)); if (drawerSubtask?.id === id) setDrawerSubtask(null) }}
                        onOpenDrawer={setDrawerSubtask}
                        isDragOver={dragOverIndex === i}
                        onDragStart={() => { dragIndexRef.current = i }}
                        onDragOver={e => { e.preventDefault(); setDragOverIndex(i) }}
                        onDrop={() => handleDrop(i)}
                        onDragEnd={() => { setDragOverIndex(null); dragIndexRef.current = null }}
                      />
                    ))}
                    {addingSubtask ? (
                      <div className="mt-2 border border-mushroom/60 rounded-lg bg-oatmilk/40 p-2.5 space-y-2">
                        <div className="flex items-center gap-2">
                          <Circle className="w-[18px] h-[18px] text-mushroom shrink-0" />
                          <input
                            autoFocus
                            value={newSubtask}
                            onChange={e => setNewSubtask(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') addSubtask(); if (e.key === 'Escape') { setAddingSubtask(false); setNewSubtask(''); setNewSubtaskStatus('todo'); setNewSubtaskDate(''); setNewSubtaskTags([]) } }}
                            placeholder="Subtask title"
                            className="flex-1 text-sm bg-transparent outline-none text-ink-dark placeholder:text-ink/40"
                            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                          />
                        </div>
                        <div className="flex items-center gap-2 pl-7 flex-wrap">
                          <select
                            value={newSubtaskStatus}
                            onChange={e => setNewSubtaskStatus(e.target.value as TaskStatus)}
                            className={cn('text-xs px-2 py-0.5 rounded border outline-none cursor-pointer', STATUS_SELECT_BG[newSubtaskStatus])}
                            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                          >
                            <option value="todo">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="review">Review</option>
                            <option value="done">Done</option>
                          </select>
                          <input
                            type="date"
                            value={newSubtaskDate}
                            onChange={e => setNewSubtaskDate(e.target.value)}
                            className="text-xs bg-white border border-mushroom rounded px-1.5 py-0.5 outline-none cursor-pointer"
                            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                          />
                          {newSubtaskTags.map(t => <TagChip key={t.id} tag={t} onRemove={() => setNewSubtaskTags(prev => prev.filter(x => x.id !== t.id))} />)}
                          <TagPicker selectedTags={newSubtaskTags} onAdd={t => setNewSubtaskTags(prev => [...prev, t])} onRemove={t => setNewSubtaskTags(prev => prev.filter(x => x.id !== t.id))} />
                          <div className="ml-auto flex items-center gap-1.5">
                            <button
                              onClick={addSubtask}
                              disabled={!newSubtask.trim()}
                              className="text-xs px-2.5 py-1 rounded-lg bg-ink-dark text-cream disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:bg-ink transition-colors"
                              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                            >
                              Add
                            </button>
                            <button
                              onClick={() => { setAddingSubtask(false); setNewSubtask(''); setNewSubtaskStatus('todo'); setNewSubtaskDate(''); setNewSubtaskTags([]) }}
                              className="text-xs px-2 py-1 rounded-lg text-ink hover:text-ink-dark transition-colors cursor-pointer"
                              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingSubtask(true)}
                        className="flex items-center gap-1.5 mt-1.5 pl-2 text-xs text-ink hover:text-ink-dark transition-colors cursor-pointer"
                        style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                      >
                        <Plus className="w-3 h-3" /> Add subtask
                      </button>
                    )}

                    {doneSubtasksList.length > 0 && (
                      <div className="pt-1">
                        <button
                          onClick={() => setShowDoneSubtasks(v => !v)}
                          className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-ink font-semibold cursor-pointer hover:text-ink-dark transition-colors py-1"
                          style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                        >
                          {showDoneSubtasks ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          Completed ({doneSubtasksList.length})
                        </button>
                        {showDoneSubtasks && (
                          <div className="space-y-0.5">
                            {doneSubtasksList.map(s => (
                              <SubtaskRow
                                key={s.id}
                                subtask={s}
                                onUpdate={handleUpdate}
                                onDelete={id => { setSubtasks(prev => prev.filter(x => x.id !== id)); if (drawerSubtask?.id === id) setDrawerSubtask(null) }}
                                onOpenDrawer={setDrawerSubtask}
                                isDragOver={false}
                                onDragStart={() => {}}
                                onDragOver={e => e.preventDefault()}
                                onDrop={() => {}}
                                onDragEnd={() => {}}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  </div>
                )
              })()}
            </div>
          </div>
        )}
      </div>

      <SubtaskDetailDrawer
        subtask={drawerSubtask}
        onClose={() => setDrawerSubtask(null)}
        onUpdate={updated => {
          setSubtasks(prev => prev.map(s => s.id === updated.id ? updated : s))
          if (drawerSubtask?.id === updated.id) setDrawerSubtask(updated)
        }}
        onDelete={id => { setSubtasks(prev => prev.filter(s => s.id !== id)); setDrawerSubtask(null) }}
      />

      <TaskDetailDrawer
        task={drawerTask}
        onClose={() => setDrawerTask(null)}
        onUpdate={updated => { onUpdate(updated); setDrawerTask(updated) }}
        onDelete={id => { onDelete(id); setDrawerTask(null) }}
      />
    </>
  )
}
