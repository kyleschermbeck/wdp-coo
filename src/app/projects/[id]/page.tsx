'use client'

import { useEffect, useState, use, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, Edit2, Check, X, ArrowUpDown } from 'lucide-react'
import { Project, Tag, Task, TaskPriority, TaskStatus } from '@/lib/types'
import { TaskRow } from '@/components/projects/TaskRow'
import { StatusBadge, STATUS_SELECT_BG, PRIORITY_SELECT_BG } from '@/components/ui/Badge'
import { TagChip, TagPicker } from '@/components/ui/TagPicker'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'

const colorMap: Record<string, string> = {
  sage: 'bg-sage', terracotta: 'bg-terracotta', butter: 'bg-butter',
  tomato: 'bg-tomato', blueberry: 'bg-blueberry', thyme: 'bg-thyme',
  candy: 'bg-candy', citrus: 'bg-citrus',
}
const borderMap: Record<string, string> = {
  sage: 'border-l-sage', terracotta: 'border-l-terracotta', butter: 'border-l-butter',
  tomato: 'border-l-tomato', blueberry: 'border-l-blueberry', thyme: 'border-l-thyme',
  candy: 'border-l-candy', citrus: 'border-l-citrus',
}

interface AddTaskFormProps {
  projectId: number
  onAdded: (task: Task) => void
}

function AddTaskForm({ projectId, onAdded }: AddTaskFormProps) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [dueDate, setDueDate] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true)
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, title, priority, due_date: dueDate || null }),
    })
    const task = await res.json()
    onAdded(task)
    setTitle(''); setPriority('medium'); setDueDate(''); setOpen(false); setLoading(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-3 w-full text-sm text-ink hover:text-ink-dark hover:bg-oatmilk rounded-xl border border-dashed border-mushroom transition-all cursor-pointer"
        style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
      >
        <Plus className="w-4 h-4" /> Add task
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl p-4 border border-mushroom space-y-3">
      <Input
        autoFocus
        placeholder="Task title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
      />
      <div className="flex gap-3">
        <select
          value={priority}
          onChange={e => setPriority(e.target.value as TaskPriority)}
          className={cn('text-sm border rounded-lg px-2.5 py-1.5 outline-none cursor-pointer transition-colors', PRIORITY_SELECT_BG[priority])}
          style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
        >
          <option value="low">Low priority</option>
          <option value="medium">Medium priority</option>
          <option value="high">High priority</option>
          <option value="urgent">Urgent</option>
        </select>
        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={loading || !title.trim()}>
          {loading ? 'Adding...' : 'Add Task'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [projectTags, setProjectTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [editingDesc, setEditingDesc] = useState(false)
  const [descValue, setDescValue] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('default')
  const [hideDone, setHideDone] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${id}`).then(r => r.json()),
      fetch(`/api/tasks?project_id=${id}`).then(r => r.json()),
      fetch(`/api/projects/${id}/tags`).then(r => r.json()),
    ]).then(([proj, taskList, tags]) => {
      setProject(proj)
      setNameValue(proj.name)
      setDescValue(proj.description ?? '')
      setTasks(taskList)
      setProjectTags(tags)
      setLoading(false)
    })
  }, [id])

  async function addProjectTag(tag: Tag) {
    await fetch(`/api/projects/${id}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_id: tag.id }),
    })
    setProjectTags(prev => [...prev, tag])
  }

  async function removeProjectTag(tag: Tag) {
    await fetch(`/api/projects/${id}/tags`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_id: tag.id }),
    })
    setProjectTags(prev => prev.filter(t => t.id !== tag.id))
  }

  async function saveName() {
    if (!nameValue.trim() || !project) { setEditingName(false); return }
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...project, name: nameValue }),
    })
    const updated = await res.json()
    setProject(updated)
    setEditingName(false)
  }

  async function saveDesc() {
    if (!project) { setEditingDesc(false); return }
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...project, description: descValue }),
    })
    const updated = await res.json()
    setProject(updated)
    setEditingDesc(false)
  }

  async function deleteProject() {
    if (!confirm('Delete this project and all its tasks?')) return
    await fetch(`/api/projects/${id}`, { method: 'DELETE' })
    router.push('/projects')
  }

  function handleTaskUpdate(updated: Task) {
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))
  }

  async function handleTaskDelete(taskId: number) {
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
    setTasks(prev => prev.filter(t => t.id !== taskId))
  }

  const taskGroups: { status: TaskStatus; label: string }[] = [
    { status: 'todo',        label: 'To Do' },
    { status: 'in_progress', label: 'In Progress' },
    { status: 'review',      label: 'Review' },
    { status: 'done',        label: 'Done' },
  ]

  const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }
  const STATUS_ORDER: Record<string, number> = { in_progress: 0, review: 1, todo: 2, done: 3 }

  const filteredTasks = useMemo(() => {
    let list = tasks
    if (hideDone) list = list.filter(t => t.status !== 'done')
    if (statusFilter !== 'all') list = list.filter(t => t.status === statusFilter)
    if (priorityFilter !== 'all') list = list.filter(t => t.priority === priorityFilter)
    switch (sortBy) {
      case 'priority':
        list = [...list].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9))
        break
      case 'status':
        list = [...list].sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9))
        break
      case 'due_asc':
        list = [...list].sort((a, b) => {
          if (!a.due_date && !b.due_date) return 0
          if (!a.due_date) return 1
          if (!b.due_date) return -1
          return a.due_date.localeCompare(b.due_date)
        })
        break
      case 'due_desc':
        list = [...list].sort((a, b) => {
          if (!a.due_date && !b.due_date) return 0
          if (!a.due_date) return 1
          if (!b.due_date) return -1
          return b.due_date.localeCompare(a.due_date)
        })
        break
      case 'title':
        list = [...list].sort((a, b) => a.title.localeCompare(b.title))
        break
      case 'created':
        list = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))
        break
    }
    return list
  }, [tasks, hideDone, statusFilter, priorityFilter, sortBy])

  if (loading || !project) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-ink" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Loading...</p>
      </div>
    )
  }

  const dot = colorMap[project.color] ?? 'bg-sage'
  const totalTasks = tasks.length
  const doneTasks = tasks.filter(t => t.status === 'done').length
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

  return (
    <div className="min-h-full min-w-[900px]">
      {/* Header */}
      <div className={cn('px-8 pt-8 pb-6 border-b border-mushroom/50 border-l-4', borderMap[project.color] ?? 'border-l-sage')}>
        <button
          onClick={() => router.push('/projects')}
          className="flex items-center gap-1.5 text-xs text-ink hover:text-ink-dark mb-4 transition-colors cursor-pointer"
          style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Projects
        </button>

        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <span className={cn('w-3 h-3 rounded-full shrink-0', dot)} />
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
                    className="text-4xl bg-transparent border-b-2 border-ink outline-none text-ink-dark"
                    style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700 }}
                  />
                  <button onClick={saveName} className="text-thyme hover:text-thyme/70 cursor-pointer"><Check className="w-5 h-5" /></button>
                  <button onClick={() => setEditingName(false)} className="text-ink hover:text-tomato cursor-pointer"><X className="w-5 h-5" /></button>
                </div>
              ) : (
                <h1
                  className="text-4xl text-ink-dark cursor-pointer hover:text-ink transition-colors"
                  style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700 }}
                  onDoubleClick={() => setEditingName(true)}
                >
                  {project.name}
                </h1>
              )}
              <button
                onClick={() => setEditingName(true)}
                className="opacity-0 group-hover:opacity-100 text-ink hover:text-ink-dark transition-all cursor-pointer"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </div>

            {editingDesc ? (
              <div className="ml-6 flex items-start gap-2 mt-1">
                <textarea
                  autoFocus
                  value={descValue}
                  onChange={e => setDescValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') setEditingDesc(false) }}
                  rows={2}
                  placeholder="Add a description…"
                  className="flex-1 text-sm bg-oatmilk border border-mushroom rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-ink/20 text-ink-dark resize-none"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                />
                <button onClick={saveDesc} className="text-thyme hover:text-thyme/70 cursor-pointer mt-1"><Check className="w-4 h-4" /></button>
                <button onClick={() => { setDescValue(project.description ?? ''); setEditingDesc(false) }} className="text-ink hover:text-tomato cursor-pointer mt-1"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <p
                className="text-sm text-ink ml-6 mt-1 cursor-pointer hover:text-ink-dark transition-colors min-h-[1.25rem]"
                style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                onDoubleClick={() => setEditingDesc(true)}
                title="Double-click to edit description"
              >
                {project.description ?? <span className="opacity-40 italic">Add a description…</span>}
              </p>
            )}

            {/* Tags */}
            <div className="flex items-center gap-1.5 flex-wrap mt-3 ml-6">
              {projectTags.map(t => (
                <TagChip key={t.id} tag={t} onRemove={() => removeProjectTag(t)} />
              ))}
              <TagPicker selectedTags={projectTags} onAdd={addProjectTag} onRemove={removeProjectTag} />
            </div>

            {/* Progress */}
            <div className="flex items-center gap-4 mt-4 ml-6">
              <StatusBadge status={project.status} />
              <span className="text-xs text-ink" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                {doneTasks}/{totalTasks} tasks complete
              </span>
              {totalTasks > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-32 h-1.5 bg-mushroom/50 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', dot)}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-ink-dark">{progress}%</span>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={deleteProject}
            className="flex items-center gap-1.5 text-xs text-ink hover:text-tomato transition-colors px-3 py-1.5 rounded-lg hover:bg-oatmilk cursor-pointer"
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete Project
          </button>
        </div>
      </div>

      {/* Task filters + sort */}
      <div className="px-8 py-3 border-b border-mushroom/30 flex items-center gap-4 flex-wrap">
        {/* Status filter */}
        <div className="flex gap-1">
          {[{ value: 'all', label: 'All' }, ...taskGroups.map(g => ({ value: g.status, label: g.label }))].map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                statusFilter === f.value
                  ? 'bg-ink-dark text-cream'
                  : 'text-ink-dark hover:bg-oatmilk'
              )}
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            >
              {f.label}
              <span className="ml-1.5 opacity-60">
                {f.value === 'all' ? tasks.length : tasks.filter(t => t.status === f.value).length}
              </span>
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-mushroom/50 shrink-0" />

        {/* Priority filter */}
        <div className="flex gap-1">
          {[
            { value: 'all', label: 'Any priority' },
            { value: 'urgent', label: 'Urgent' },
            { value: 'high', label: 'High' },
            { value: 'medium', label: 'Medium' },
            { value: 'low', label: 'Low' },
          ].map(f => (
            <button
              key={f.value}
              onClick={() => setPriorityFilter(f.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer',
                priorityFilter === f.value
                  ? 'bg-ink-dark text-cream'
                  : 'text-ink-dark hover:bg-oatmilk'
              )}
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Hide done toggle + sort — right-aligned */}
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => setHideDone(v => !v)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer',
              hideDone ? 'bg-ink-dark text-cream' : 'text-ink-dark hover:bg-oatmilk'
            )}
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
          >
            Hide done
          </button>
        <div className="flex items-center gap-2">
          <ArrowUpDown className="w-3.5 h-3.5 text-ink/50 shrink-0" />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="text-xs text-ink bg-transparent border border-mushroom rounded-lg px-2.5 py-1.5 outline-none cursor-pointer hover:border-ink/40 transition-colors"
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
          >
            <option value="default">Default order</option>
            <option value="priority">Priority</option>
            <option value="status">Status</option>
            <option value="due_asc">Due date ↑</option>
            <option value="due_desc">Due date ↓</option>
            <option value="title">Title A–Z</option>
            <option value="created">Newest first</option>
          </select>
        </div>
        </div>
      </div>

      {/* Tasks */}
      <div className="p-8 space-y-2">
        <div className="pb-2">
          <AddTaskForm projectId={project.id} onAdded={(t) => setTasks(prev => [t, ...prev])} />
        </div>

        {filteredTasks.length === 0 && (statusFilter !== 'all' || priorityFilter !== 'all') ? (
          <p className="text-sm text-ink py-4" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
            No tasks match the current filters.
          </p>
        ) : (
          filteredTasks.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              onUpdate={handleTaskUpdate}
              onDelete={handleTaskDelete}
            />
          ))
        )}
      </div>
    </div>
  )
}
