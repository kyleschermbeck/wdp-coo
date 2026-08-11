'use client'

import React, { useEffect, useRef, useState } from 'react'
import { X, Check, Calendar, Trash2, Plus, GripVertical, ChevronRight, Upload, FileText } from 'lucide-react'
import { Subtask, Tag, Task, TaskStatus } from '@/lib/types'
import { TagChip, TagPicker } from '@/components/ui/TagPicker'
import { cn } from '@/lib/utils'
import { format, parseISO } from 'date-fns'

const COLOR_HEX: Record<string, string> = {
  sage: '#9BAE9A', terracotta: '#C27A54', butter: '#DFC97B', tomato: '#C14B3A',
  blueberry: '#78B7C5', thyme: '#5A7A5C', candy: '#D4789A', citrus: '#E8A23A',
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  todo:        { bg: 'rgba(216,210,198,0.45)', color: '#747474', label: 'To Do' },
  in_progress: { bg: 'rgba(120,183,197,0.18)', color: '#3d7684', label: 'In Progress' },
  review:      { bg: 'rgba(240,215,122,0.28)', color: '#8a6f00', label: 'Review' },
  done:        { bg: 'rgba(155,174,154,0.22)', color: '#4a6e49', label: 'Done' },
}

const CHECKBOX_BASE: React.CSSProperties = {
  width: 15, height: 15, borderRadius: 3, flexShrink: 0, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'all 0.12s', padding: 0, outline: 'none',
  appearance: 'none', WebkitAppearance: 'none',
}

interface SubItem {
  id: number
  subtask_id: number
  title: string
  completed: number
  sort_order: number
  created_at: string
}

interface Props {
  subtask: Subtask | null
  onClose: () => void
  onUpdate: (s: Subtask) => void
  onDelete: (id: number) => void
  onMove?: (s: Subtask) => void
  onOpenParentTask?: (taskId: number) => void
}

const FONT = { fontFamily: "'Jost', system-ui, sans-serif" }

export function SubtaskDetailDrawer({ subtask, onClose, onUpdate, onDelete, onMove, onOpenParentTask }: Props) {
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [status, setStatus] = useState<TaskStatus>('todo')
  const [tags, setTags] = useState<Tag[]>([])
  const [saving, setSaving] = useState(false)
  const [subItems, setSubItems] = useState<SubItem[]>([])
  const [newItemTitle, setNewItemTitle] = useState('')
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragIndexRef = useRef<number | null>(null)
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Move to task
  const [allProjectTasks, setAllProjectTasks] = useState<Task[]>([])
  const [moveSearch, setMoveSearch] = useState('')
  const [showMoveList, setShowMoveList] = useState(false)
  const [moving, setMoving] = useState(false)
  const moveInputRef = useRef<HTMLInputElement>(null)

  // Blocked by
  interface SubtaskDep { id: number; depends_on_task_id: number | null; depends_on_subtask_id: number | null; title: string; status: string; kind: 'task' | 'subtask' }
  const [dependencies, setDependencies] = useState<SubtaskDep[]>([])
  const [allProjectSubtasks, setAllProjectSubtasks] = useState<{ id: number; title: string; status: string }[]>([])
  const [depSearch, setDepSearch] = useState('')
  const [showDepList, setShowDepList] = useState(false)
  const depInputRef = useRef<HTMLInputElement>(null)

  interface KnowledgeDoc { id: number; original_name: string; file_type: string; file_size: number; created_at: string }
  const [subtaskDocs, setSubtaskDocs] = useState<KnowledgeDoc[]>([])
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const docInputRef = useRef<HTMLInputElement>(null)

  const open = subtask !== null

  useEffect(() => {
    if (!subtask) return
    setTitle(subtask.title)
    setNotes(subtask.notes ?? '')
    setStartDate(subtask.start_date ?? '')
    setDueDate(subtask.due_date ?? '')
    setStatus(subtask.completed && !subtask.status ? 'done' : (subtask.status ?? 'todo'))
    fetch(`/api/subtasks/${subtask.id}`)
      .then(r => r.json())
      .then(data => setTags(data.tags ?? []))
    fetch(`/api/subtasks/${subtask.id}/items`)
      .then(r => r.json())
      .then(data => setSubItems(Array.isArray(data) ? data : []))
    setNewItemTitle('')
    setMoveSearch('')
    setShowMoveList(false)
    setDepSearch('')
    setShowDepList(false)

    fetch(`/api/subtasks/dependencies?subtask_id=${subtask.id}`)
      .then(r => r.json())
      .then(data => setDependencies(Array.isArray(data) ? data : []))

    fetch(`/api/documents?subtask_id=${subtask.id}`)
      .then(r => r.json())
      .then(data => setSubtaskDocs(Array.isArray(data) ? data : []))

    function loadProjectData(projectId: number) {
      fetch(`/api/tasks?project_id=${projectId}`)
        .then(r => r.json())
        .then(data => setAllProjectTasks(Array.isArray(data) ? data : []))
      fetch(`/api/subtasks?project_id=${projectId}`)
        .then(r => r.json())
        .then(data => setAllProjectSubtasks(Array.isArray(data) ? data : []))
    }

    if (subtask.project_id) {
      loadProjectData(subtask.project_id)
    } else if (subtask.task_id) {
      fetch(`/api/tasks/${subtask.task_id}`)
        .then(r => r.json())
        .then(t => { if (t?.project_id) loadProjectData(t.project_id) })
    }
  }, [subtask?.id])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  async function save(patch: Partial<Subtask>) {
    if (!subtask) return
    setSaving(true)
    const resolvedStatus = (patch.status ?? status) as TaskStatus
    const res = await fetch(`/api/subtasks/${subtask.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title || subtask.title,
        notes,
        start_date: startDate || null,
        due_date: dueDate || null,
        status: resolvedStatus,
        completed: resolvedStatus === 'done',
        ...patch,
      }),
    })
    const updated = await res.json()
    if (patch.status) setStatus(patch.status as TaskStatus)
    onUpdate({ ...updated, tags, task_title: subtask.task_title, project_id: subtask.project_id, project_name: subtask.project_name, project_color: subtask.project_color })
    setSaving(false)
  }

  function handleNotesChange(val: string) {
    setNotes(val)
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => save({ notes: val }), 800)
  }

  async function addTag(tag: Tag) {
    if (!subtask) return
    await fetch(`/api/subtasks/${subtask.id}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_id: tag.id }),
    })
    const next = [...tags, tag]
    setTags(next)
    onUpdate({ ...subtask, notes, start_date: startDate || null, due_date: dueDate || null, tags: next, status, completed: status === 'done' })
  }

  async function removeTag(tag: Tag) {
    if (!subtask) return
    await fetch(`/api/subtasks/${subtask.id}/tags`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_id: tag.id }),
    })
    const next = tags.filter(t => t.id !== tag.id)
    setTags(next)
    onUpdate({ ...subtask, notes, start_date: startDate || null, due_date: dueDate || null, tags: next, status, completed: status === 'done' })
  }

  async function addSubItem() {
    if (!subtask || !newItemTitle.trim()) return
    const res = await fetch(`/api/subtasks/${subtask.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newItemTitle.trim() }),
    })
    const item = await res.json()
    const nextItems = [...subItems, item]
    setSubItems(nextItems)
    setNewItemTitle('')
    if (subtask) {
      const completedNow = nextItems.filter(i => i.completed).length
      onUpdate({ ...subtask, subitem_count: nextItems.length, completed_subitem_count: completedNow })
    }
  }

  async function toggleSubItem(item: SubItem) {
    const res = await fetch(`/api/subtask-items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: item.completed ? 0 : 1 }),
    })
    const updated = await res.json()
    const nextItems = subItems.map(i => i.id === item.id ? updated : i)
    setSubItems(nextItems)
    if (subtask) {
      const completedNow = nextItems.filter(i => i.completed).length
      onUpdate({ ...subtask, subitem_count: nextItems.length, completed_subitem_count: completedNow })
    }
  }

  async function deleteSubItem(id: number) {
    await fetch(`/api/subtask-items/${id}`, { method: 'DELETE' })
    const nextItems = subItems.filter(i => i.id !== id)
    setSubItems(nextItems)
    if (subtask) {
      const completedNow = nextItems.filter(i => i.completed).length
      onUpdate({ ...subtask, subitem_count: nextItems.length, completed_subitem_count: completedNow })
    }
  }

  async function handleDrop(dropIndex: number) {
    const fromIndex = dragIndexRef.current
    if (fromIndex === null || fromIndex === dropIndex) {
      setDragOverIndex(null)
      dragIndexRef.current = null
      return
    }
    const reordered = [...subItems]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(dropIndex, 0, moved)
    setSubItems(reordered)
    setDragOverIndex(null)
    dragIndexRef.current = null
    await fetch('/api/subtask-items/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: reordered.map(i => i.id) }),
    })
  }

  async function moveToTask(taskId: number) {
    if (!subtask) return
    setMoving(true)
    const res = await fetch(`/api/subtasks/${subtask.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        notes,
        start_date: startDate || null,
        due_date: dueDate || null,
        status,
        completed: status === 'done',
        task_id: taskId,
      }),
    })
    const updated = await res.json()
    setMoving(false)
    setMoveSearch('')
    setShowMoveList(false)
    const movedSubtask = { ...updated, tags, project_id: subtask.project_id, project_name: subtask.project_name, project_color: subtask.project_color }
    onMove?.(movedSubtask)
    onClose()
  }

  async function addDependency(kind: 'task' | 'subtask', id: number) {
    if (!subtask) return
    setDepSearch('')
    setShowDepList(false)
    const body = kind === 'task'
      ? { subtask_id: subtask.id, depends_on_task_id: id }
      : { subtask_id: subtask.id, depends_on_subtask_id: id }
    const res = await fetch('/api/subtasks/dependencies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const dep = await res.json()
    setDependencies(prev => [...prev, dep])
  }

  async function removeDependency(depId: number) {
    if (!subtask) return
    await fetch(`/api/subtasks/dependencies?subtask_id=${subtask.id}&dep_id=${depId}`, { method: 'DELETE' })
    setDependencies(prev => prev.filter(d => d.id !== depId))
  }

  function handleNewItemKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); addSubItem() }
    if (e.key === 'Escape') setNewItemTitle('')
  }

  const completedCount = subItems.filter(i => i.completed).length
  const accentColor = COLOR_HEX[subtask?.project_color ?? ''] ?? '#9BAE9A'
  const ss = STATUS_STYLE[status] ?? STATUS_STYLE.todo

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30"
          style={{ backgroundColor: 'rgba(44,44,44,0.2)' }}
          onClick={onClose}
        />
      )}

      <div className={cn(
        'fixed top-0 right-0 h-full w-96 bg-cream border-l border-mushroom z-40',
        'transition-transform duration-300 ease-in-out flex flex-col',
        open ? 'translate-x-0 shadow-2xl' : 'translate-x-full'
      )}>
        {!subtask ? null : (
          <>
            {/* Color strip */}
            <div style={{ height: 4, background: accentColor, flexShrink: 0 }} />

            {/* Header */}
            <div style={{ padding: '10px 20px 10px', borderBottom: '1px solid rgba(216,210,198,0.6)', flexShrink: 0, ...FONT }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: '#9BA69A', margin: '0 0 3px' }}>
                    Subtask
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, color: '#747474', minWidth: 0 }}>
                    {subtask.project_name && (
                      <>
                        <span style={{ flexShrink: 0 }}>{subtask.project_name}</span>
                        <ChevronRight style={{ width: 12, height: 12, flexShrink: 0, opacity: 0.5 }} />
                      </>
                    )}
                    {onOpenParentTask ? (
                      <button
                        onClick={() => onOpenParentTask(subtask.task_id)}
                        style={{
                          fontWeight: 600, color: '#2C2C2C', background: 'none', border: 'none',
                          padding: 0, cursor: 'pointer', fontSize: 12, ...FONT,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          textAlign: 'left', minWidth: 0,
                        }}
                        className="hover:underline"
                      >
                        {subtask.task_title ?? '← Back to task'}
                      </button>
                    ) : subtask.task_title ? (
                      <span style={{ fontWeight: 600, color: '#2C2C2C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {subtask.task_title}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                  {saving && <span style={{ fontSize: 11, color: '#9BA69A', marginRight: 4 }}>Saving…</span>}
                  <button
                    onClick={() => { onDelete(subtask.id); onClose() }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 5, color: '#9BA69A', display: 'flex', borderRadius: 6 }}
                    className="hover:text-tomato transition-colors"
                  >
                    <Trash2 style={{ width: 15, height: 15 }} />
                  </button>
                  <button
                    onClick={onClose}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 5, color: '#9BA69A', display: 'flex', borderRadius: 6 }}
                    className="hover:text-ink-dark transition-colors"
                  >
                    <X style={{ width: 15, height: 15 }} />
                  </button>
                </div>
              </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Title */}
              <div>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  onBlur={() => { if (title.trim() && title !== subtask.title) save({ title }) }}
                  placeholder="Subtask title…"
                  style={{
                    width: '100%', fontFamily: "'Cormorant Garamond', Georgia, serif",
                    fontSize: 24, fontWeight: 600, color: '#2C2C2C',
                    background: 'transparent', border: 'none', outline: 'none',
                    borderBottom: '1px solid rgba(216,210,198,0.6)', paddingBottom: 8,
                    lineHeight: 1.2,
                  }}
                />
              </div>

              {/* Chips row: status + dates */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <select
                  value={status}
                  onChange={e => { setStatus(e.target.value as TaskStatus); save({ status: e.target.value as TaskStatus }) }}
                  style={{
                    ...FONT, fontSize: 11, fontWeight: 600,
                    padding: '4px 10px', borderRadius: 999, cursor: 'pointer', outline: 'none',
                    border: `1px solid ${ss.color}55`,
                    background: ss.bg, color: ss.color,
                    appearance: 'none', WebkitAppearance: 'none',
                  }}
                >
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="review">Review</option>
                  <option value="done">Done</option>
                </select>

                <label style={{
                  display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                  padding: '4px 10px', borderRadius: 999,
                  background: 'rgba(216,210,198,0.25)', border: '1px solid rgba(216,210,198,0.6)',
                  ...FONT, fontSize: 11, color: '#747474',
                  position: 'relative',
                }}>
                  <Calendar style={{ width: 11, height: 11, flexShrink: 0 }} />
                  <span>{startDate ? format(parseISO(startDate), 'MMM d') : 'Start'}</span>
                  <span style={{ opacity: 0.4 }}>→</span>
                  <span style={{ color: dueDate ? '#2C2C2C' : undefined, fontWeight: dueDate ? 600 : 400 }}>
                    {dueDate ? format(parseISO(dueDate), 'MMM d') : 'Due'}
                  </span>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', opacity: 0, pointerEvents: 'none' }}>
                    <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); save({ start_date: e.target.value || null }) }} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', pointerEvents: 'auto', width: '50%' }} />
                    <input type="date" value={dueDate} onChange={e => { setDueDate(e.target.value); save({ due_date: e.target.value || null }) }} style={{ position: 'absolute', inset: 0, right: 0, opacity: 0, cursor: 'pointer', pointerEvents: 'auto', width: '50%', left: '50%' }} />
                  </div>
                </label>

                {(startDate || dueDate) && (
                  <button
                    onClick={() => { setStartDate(''); setDueDate(''); save({ start_date: null, due_date: null }) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10.5, color: '#9BA69A', ...FONT, padding: '2px 4px' }}
                    className="hover:text-tomato"
                  >
                    Clear dates
                  </button>
                )}
              </div>

              {/* Tags */}
              <div>
                <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: '#9BA69A', marginBottom: 7, ...FONT }}>
                  Tags
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  {tags.map(t => (
                    <TagChip key={t.id} tag={t} onRemove={() => removeTag(t)} />
                  ))}
                  <TagPicker selectedTags={tags} onAdd={addTag} onRemove={removeTag} />
                </div>
              </div>

              {/* Blocked by */}
              <div style={{ borderTop: '1px solid rgba(216,210,198,0.5)', paddingTop: 16 }}>
                <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: '#9BA69A', marginBottom: 8, ...FONT }}>
                  Blocked by
                </p>
                {dependencies.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                    {dependencies.map(dep => {
                      const isDone = dep.status === 'done'
                      const statusLabel = isDone ? 'Done' : dep.status === 'in_progress' ? 'In Progress' : dep.status === 'review' ? 'Review' : 'To Do'
                      return (
                        <div key={dep.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: 'rgba(250,249,246,0.8)', border: '1px solid rgba(216,210,198,0.6)' }} className="group">
                          <div style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, background: isDone ? '#9BAE9A' : dep.status === 'in_progress' ? '#78B7C5' : '#D8D2C6' }} />
                          <span style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isDone ? 'rgba(44,44,44,0.4)' : '#2C2C2C', textDecoration: isDone ? 'line-through' : 'none', ...FONT }}>
                            {dep.title}
                          </span>
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 999, flexShrink: 0, background: isDone ? 'rgba(155,174,154,0.2)' : 'rgba(216,210,198,0.5)', color: isDone ? '#4a6e49' : '#747474', textTransform: 'uppercase', letterSpacing: '0.06em', ...FONT }}>
                            {statusLabel}
                          </span>
                          <span style={{ fontSize: 9, color: '#9BA69A', flexShrink: 0, ...FONT }}>{dep.kind}</span>
                          <button
                            onClick={() => removeDependency(dep.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(44,44,44,0.2)', padding: 2, flexShrink: 0 }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-tomato"
                          >
                            <X style={{ width: 12, height: 12 }} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
                <div style={{ position: 'relative' }}>
                  <input
                    ref={depInputRef}
                    value={depSearch}
                    onChange={e => { setDepSearch(e.target.value); setShowDepList(true) }}
                    onFocus={() => setShowDepList(true)}
                    onBlur={() => setTimeout(() => setShowDepList(false), 150)}
                    placeholder="Search tasks or subtasks…"
                    style={{
                      width: '100%', ...FONT, fontSize: 13,
                      padding: '7px 12px', borderRadius: 8, outline: 'none',
                      border: '1px solid rgba(216,210,198,0.7)',
                      background: 'rgba(255,255,255,0.6)', color: '#2C2C2C',
                      boxSizing: 'border-box',
                    }}
                  />
                  {showDepList && (() => {
                    const q = depSearch.toLowerCase()
                    const alreadyTaskIds = new Set(dependencies.filter(d => d.depends_on_task_id).map(d => d.depends_on_task_id!))
                    const alreadySubtaskIds = new Set(dependencies.filter(d => d.depends_on_subtask_id).map(d => d.depends_on_subtask_id!))
                    const filteredTasks = allProjectTasks.filter(t => !alreadyTaskIds.has(t.id) && (!q || t.title.toLowerCase().includes(q))).slice(0, 5)
                    const filteredSubtasks = allProjectSubtasks.filter(s => s.id !== subtask?.id && !alreadySubtaskIds.has(s.id) && (!q || s.title.toLowerCase().includes(q))).slice(0, 5)
                    const combined = [
                      ...filteredTasks.map(t => ({ kind: 'task' as const, id: t.id, title: t.title, status: t.status as string })),
                      ...filteredSubtasks.map(s => ({ kind: 'subtask' as const, id: s.id, title: s.title, status: s.status })),
                    ].slice(0, 8)
                    if (combined.length === 0) return null
                    return (
                      <div style={{
                        position: 'absolute', zIndex: 50, left: 0, right: 0, top: '100%', marginTop: 4,
                        background: '#FAF9F6', border: '1px solid rgba(216,210,198,0.7)', borderRadius: 10,
                        boxShadow: '0 4px 20px rgba(44,44,44,0.1)', overflow: 'hidden',
                      }}>
                        {combined.map(item => (
                          <button
                            key={`${item.kind}-${item.id}`}
                            type="button"
                            onMouseDown={() => addDependency(item.kind, item.id)}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', ...FONT }}
                            className="hover:bg-oatmilk transition-colors"
                          >
                            <span style={{ fontSize: 13, color: '#2C2C2C', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                            <span style={{ fontSize: 9.5, color: '#9BA69A', flexShrink: 0 }}>{item.kind}</span>
                          </button>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* Sub-items */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: '#9BA69A', margin: 0, ...FONT }}>
                    Sub-items
                  </p>
                  {subItems.length > 0 && (
                    <span style={{ fontSize: 11, color: '#9BA69A', ...FONT }}>
                      {completedCount}/{subItems.length}
                    </span>
                  )}
                </div>

                {subItems.length > 0 && (
                  <div style={{ height: 3, background: 'rgba(216,210,198,0.5)', borderRadius: 99, marginBottom: 10, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', background: accentColor, borderRadius: 99,
                      width: `${Math.round((completedCount / subItems.length) * 100)}%`,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {subItems.map((item, i) => (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={() => { dragIndexRef.current = i }}
                      onDragOver={e => { e.preventDefault(); setDragOverIndex(i) }}
                      onDrop={() => handleDrop(i)}
                      onDragEnd={() => { setDragOverIndex(null); dragIndexRef.current = null }}
                      className="group"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 7,
                        borderTop: dragOverIndex === i && dragIndexRef.current !== i ? `2px solid ${accentColor}` : '2px solid transparent',
                        transition: 'background 0.1s',
                      }}
                    >
                      <GripVertical style={{ width: 13, height: 13, color: 'rgba(216,210,198,0.5)', flexShrink: 0, cursor: 'grab' }} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                      <button
                        type="button"
                        onClick={() => toggleSubItem(item)}
                        style={{
                          ...CHECKBOX_BASE,
                          border: `1.5px solid ${item.completed ? '#2C2C2C' : '#D8D2C6'}`,
                          background: item.completed ? '#2C2C2C' : 'transparent',
                        }}
                      >
                        {!!item.completed && <Check style={{ width: 9, height: 9, color: '#FAF9F6', strokeWidth: 3 }} />}
                      </button>
                      <span style={{
                        flex: 1, fontSize: 13, ...FONT,
                        color: item.completed ? 'rgba(44,44,44,0.35)' : '#2C2C2C',
                        textDecoration: item.completed ? 'line-through' : 'none',
                      }}>
                        {item.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteSubItem(item.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(44,44,44,0.25)', padding: 2, flexShrink: 0 }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-tomato"
                      >
                        <X style={{ width: 13, height: 13 }} />
                      </button>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, paddingLeft: 6 }}>
                  <button
                    type="button"
                    onClick={addSubItem}
                    disabled={!newItemTitle.trim()}
                    style={{
                      ...CHECKBOX_BASE,
                      border: '1.5px solid #D8D2C6', background: 'transparent',
                      opacity: newItemTitle.trim() ? 1 : 0.4,
                    }}
                  >
                    <Plus style={{ width: 9, height: 9, color: '#747474' }} />
                  </button>
                  <input
                    value={newItemTitle}
                    onChange={e => setNewItemTitle(e.target.value)}
                    onKeyDown={handleNewItemKeyDown}
                    placeholder="Add an item…"
                    style={{
                      flex: 1, background: 'transparent', border: 'none', outline: 'none',
                      fontSize: 13, color: '#2C2C2C', ...FONT,
                    }}
                  />
                </div>
              </div>

              {/* Move to task */}
              {allProjectTasks.length > 0 && (
                <div style={{ borderTop: '1px solid rgba(216,210,198,0.5)', paddingTop: 16 }}>
                  <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: '#9BA69A', marginBottom: 7, ...FONT }}>
                    Move to task
                  </p>
                  <div style={{ position: 'relative' }}>
                    <input
                      ref={moveInputRef}
                      value={moveSearch}
                      onChange={e => { setMoveSearch(e.target.value); setShowMoveList(true) }}
                      onFocus={() => setShowMoveList(true)}
                      onBlur={() => setTimeout(() => setShowMoveList(false), 150)}
                      placeholder={moving ? 'Moving…' : 'Search tasks in this project…'}
                      disabled={moving}
                      style={{
                        width: '100%', ...FONT, fontSize: 13,
                        padding: '7px 12px', borderRadius: 8, outline: 'none',
                        border: '1px solid rgba(216,210,198,0.7)',
                        background: 'rgba(255,255,255,0.6)', color: '#2C2C2C',
                        opacity: moving ? 0.5 : 1,
                        boxSizing: 'border-box',
                      }}
                    />
                    {showMoveList && (() => {
                      const q = moveSearch.toLowerCase()
                      const filtered = allProjectTasks.filter(t =>
                        t.id !== subtask?.task_id &&
                        (!q || t.title.toLowerCase().includes(q))
                      ).slice(0, 8)
                      if (filtered.length === 0) return null
                      return (
                        <div style={{
                          position: 'absolute', zIndex: 50, left: 0, right: 0, top: '100%', marginTop: 4,
                          background: '#FAF9F6', border: '1px solid rgba(216,210,198,0.7)', borderRadius: 10,
                          boxShadow: '0 4px 20px rgba(44,44,44,0.1)', overflow: 'hidden',
                        }}>
                          {filtered.map(t => (
                            <button
                              key={t.id}
                              type="button"
                              onMouseDown={() => moveToTask(t.id)}
                              style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                                padding: '9px 14px', background: 'none', border: 'none',
                                cursor: 'pointer', textAlign: 'left', ...FONT,
                              }}
                              className="hover:bg-oatmilk transition-colors"
                            >
                              <span style={{ fontSize: 13, color: '#2C2C2C', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {t.title}
                              </span>
                              {t.status === 'done' && (
                                <span style={{ fontSize: 10, color: '#9BA69A', flexShrink: 0 }}>Done</span>
                              )}
                            </button>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: '#9BA69A', marginBottom: 7, ...FONT }}>
                  Notes
                </p>
                <textarea
                  value={notes}
                  onChange={e => handleNotesChange(e.target.value)}
                  placeholder="Add notes, context, or links…"
                  rows={7}
                  style={{
                    width: '100%', ...FONT,
                    fontSize: 13, color: '#2C2C2C', background: 'rgba(255,255,255,0.6)',
                    border: '1px solid rgba(216,210,198,0.6)', borderRadius: 10,
                    padding: '10px 12px', outline: 'none', resize: 'none',
                    lineHeight: 1.6, boxSizing: 'border-box',
                  }}
                  onFocus={e => { e.target.style.borderColor = '#9BA69A' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(216,210,198,0.6)' }}
                />
              </div>

              {/* Document attachments */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                  <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: '#9BA69A', ...FONT }}>
                    Documents
                  </p>
                  <button
                    onClick={() => docInputRef.current?.click()}
                    disabled={uploadingDoc}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: uploadingDoc ? '#9BA69A' : '#78B7C5', background: 'none', border: 'none', cursor: 'pointer', padding: 0, ...FONT }}
                  >
                    <Upload size={11} />
                    {uploadingDoc ? 'Uploading…' : 'Attach file'}
                  </button>
                  <input
                    ref={docInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.docx,.txt,.md,.csv"
                    style={{ display: 'none' }}
                    onChange={async e => {
                      if (!e.target.files || !subtask) return
                      setUploadingDoc(true)
                      for (const file of Array.from(e.target.files)) {
                        const form = new FormData()
                        form.append('file', file)
                        form.append('subtask_id', String(subtask.id))
                        const res = await fetch('/api/documents', { method: 'POST', body: form })
                        if (res.ok) {
                          const doc = await res.json()
                          setSubtaskDocs(prev => [doc, ...prev])
                        }
                      }
                      setUploadingDoc(false)
                      e.target.value = ''
                    }}
                  />
                </div>
                {subtaskDocs.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {subtaskDocs.map(doc => (
                      <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: 'rgba(247,245,240,0.7)', border: '1px solid rgba(216,210,198,0.5)' }}>
                        <FileText size={13} color="#78B7C5" style={{ flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 12, color: '#2C2C2C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...FONT }}>{doc.original_name}</span>
                        <button
                          onClick={async () => {
                            await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' })
                            setSubtaskDocs(prev => prev.filter(d => d.id !== doc.id))
                          }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(44,44,44,0.25)', padding: 2, flexShrink: 0 }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#C14B3A')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(44,44,44,0.25)')}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 10, color: 'rgba(44,44,44,0.25)', fontStyle: 'italic', ...FONT }}>No files attached</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
