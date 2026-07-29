'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Calendar, Trash2, FolderInput, Sparkles, Loader2, Plus, Upload, Check, FileText, ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import { Task, Subtask, Tag, TaskStatus, TaskPriority } from '@/lib/types'
import { TagChip, TagPicker } from '@/components/ui/TagPicker'
import { cn } from '@/lib/utils'
import { format, parseISO } from 'date-fns'
import Link from 'next/link'

interface RecipeData {
  ingredients: string
  about: string
  why: string
  steps: string
  considerations: string
  nutrition: string
  keywords: string
  recipe_kit_id: string
}

const EMPTY_RECIPE: RecipeData = { ingredients: '', about: '', why: '', steps: '', considerations: '', nutrition: '', keywords: '', recipe_kit_id: '' }

interface TaskAttachment {
  id: number
  task_id: number
  title: string
  content_type: string
  content: string
  created_at: string
}

const CONTENT_MODES = [
  { id: 'Recipe Only',            label: 'Recipe Fields',          desc: 'Writes / improves ingredients, about, steps, tips' },
  { id: 'Blog Package',           label: 'Blog Package',           desc: 'Title, intro, body, FAQ, related recipes' },
  { id: 'Instagram Package',      label: 'Instagram Package',      desc: 'Feed caption, carousel, stories, Threads, Facebook' },
  { id: 'Reel Package',           label: 'Reel Package',           desc: 'Hook, shot list, voiceover, B-roll, editing notes' },
  { id: 'Pinterest Package',      label: 'Pinterest Package',      desc: 'Pin title, description, keywords, graphic text' },
  { id: 'Email Campaign',         label: 'Email Campaign',         desc: 'Subject lines, preview text, recipe + product email' },
  { id: 'Photography Direction',  label: 'Photography Direction',  desc: 'Hero shot, styling, lighting, prop & composition notes' },
]

const CREATIVE_STUDIO_AGENT_ID = 3

interface Props {
  task: Task | null
  onClose: () => void
  onUpdate: (t: Task) => void
  onDelete: (id: number) => void
  onSubtaskToggle?: (s: Subtask) => void
  onOpenSubtask?: (s: Subtask) => void
  onConvertToSubtask?: (subtask: Subtask) => void
}

function isRecipeProject(task: Task | null): boolean {
  return !!task?.project_name?.toLowerCase().includes('recipe')
}

const LABEL = "block text-[10px] font-semibold text-ink uppercase tracking-widest mb-2"
const LABEL_STYLE = { fontFamily: "'Jost', system-ui, sans-serif", letterSpacing: '0.12em' }
const FONT = { fontFamily: "'Jost', system-ui, sans-serif" }
const TEXTAREA_CLASS = "w-full px-3 py-2.5 text-sm bg-white border border-mushroom rounded-xl outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink text-ink-dark placeholder:text-ink/40 resize-none transition-all"

const COLOR_HEX: Record<string, string> = {
  sage: '#9BAE9A', terracotta: '#C27A54', butter: '#DFC97B', tomato: '#C14B3A',
  blueberry: '#78B7C5', thyme: '#5A7A5C', candy: '#D4789A', citrus: '#E8A23A',
}

const CHIP_STATUS: Record<string, { bg: string; color: string }> = {
  todo:        { bg: 'rgba(216,210,198,0.45)', color: '#747474' },
  in_progress: { bg: 'rgba(120,183,197,0.18)', color: '#3d7684' },
  review:      { bg: 'rgba(240,215,122,0.28)', color: '#8a6f00' },
  done:        { bg: 'rgba(155,174,154,0.22)', color: '#4a6e49' },
}

const CHIP_PRIORITY: Record<string, { bg: string; color: string }> = {
  low:    { bg: 'rgba(216,210,198,0.3)', color: '#747474' },
  medium: { bg: 'rgba(120,183,197,0.15)', color: '#3d7684' },
  high:   { bg: 'rgba(228,185,158,0.3)', color: '#a35a37' },
  urgent: { bg: 'rgba(193,75,58,0.12)', color: '#C14B3A' },
}

const CHIP_SELECT: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999,
  cursor: 'pointer', outline: 'none', appearance: 'none', WebkitAppearance: 'none',
  fontFamily: "'Jost', system-ui, sans-serif",
}

export function TaskDetailDrawer({ task, onClose, onUpdate, onDelete, onSubtaskToggle, onOpenSubtask, onConvertToSubtask }: Props) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [status, setStatus] = useState<TaskStatus>('todo')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [tags, setTags] = useState<Tag[]>([])
  const [saving, setSaving] = useState(false)
  const [promoting, setPromoting] = useState(false)

  // Recipe state
  const ingredientRefs = useRef<(HTMLInputElement | null)[]>([])
  const stepRefs = useRef<(HTMLTextAreaElement | null)[]>([])
  const [recipe, setRecipe] = useState<RecipeData>(EMPTY_RECIPE)
  const [agentLoading, setAgentLoading] = useState(false)
  const [agentError, setAgentError] = useState('')
  const [pushingKit, setPushingKit] = useState(false)
  const [kitMessage, setKitMessage] = useState('')

  // Subtask state
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  const [subtaskAdding, setSubtaskAdding] = useState(false)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragIndexRef = useRef<number | null>(null)

  // Dependency state
  interface TaskDep { id: number; depends_on_id: number; title: string; status: TaskStatus; priority: string; due_date: string | null; project_name: string | null }
  const [dependencies, setDependencies] = useState<TaskDep[]>([])
  const [allTasks, setAllTasks] = useState<Task[]>([])
  const [depSearch, setDepSearch] = useState('')
  const [showDepList, setShowDepList] = useState(false)
  const depInputRef = useRef<HTMLInputElement>(null)

  // Projects for move-to-project picker
  const [allProjects, setAllProjects] = useState<{ id: number; name: string }[]>([])

  // Nest-under-task picker
  const [nestSearch, setNestSearch] = useState('')
  const [showNestList, setShowNestList] = useState(false)
  const [converting, setConverting] = useState(false)
  const nestInputRef = useRef<HTMLInputElement>(null)

  // Content generation state
  const [showContentModal, setShowContentModal] = useState(false)
  const [selectedModes, setSelectedModes] = useState<string[]>(['Recipe Only'])
  const [extraInstructions, setExtraInstructions] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatingStatus, setGeneratingStatus] = useState('')
  const [attachments, setAttachments] = useState<TaskAttachment[]>([])
  const [expandedAttachment, setExpandedAttachment] = useState<number | null>(null)

  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recipeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const open = task !== null

  useEffect(() => {
    if (!task) return
    setTitle(task.title)
    setNotes(task.notes ?? '')
    setStartDate(task.start_date ?? '')
    setDueDate(task.due_date ?? '')
    setStatus(task.status)
    setPriority(task.priority)
    setAgentError('')

    if (task.recipe_data) {
      try { setRecipe(JSON.parse(task.recipe_data)) } catch { setRecipe(EMPTY_RECIPE) }
    } else {
      setRecipe(EMPTY_RECIPE)
    }

    fetch(`/api/tasks/${task.id}/tags`)
      .then(r => r.json())
      .then(data => setTags(Array.isArray(data) ? data : []))

    fetch(`/api/subtasks?task_id=${task.id}`)
      .then(r => r.json())
      .then(data => setSubtasks(Array.isArray(data) ? data : []))

    fetch(`/api/tasks/${task.id}/attachments`)
      .then(r => r.json())
      .then(data => setAttachments(Array.isArray(data) ? data : []))

    fetch(`/api/tasks/dependencies?task_id=${task.id}`)
      .then(r => r.json())
      .then(data => setDependencies(Array.isArray(data) ? data : []))

    setDependencies([])
    setDepSearch('')
    setShowDepList(false)
    setNewSubtaskTitle('')
    setExpandedAttachment(null)
  }, [task?.id])

  useEffect(() => {
    fetch('/api/tasks')
      .then(r => r.json())
      .then(data => setAllTasks(Array.isArray(data) ? data : []))
    fetch('/api/projects')
      .then(r => r.json())
      .then(data => setAllProjects(Array.isArray(data) ? data : []))
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  async function save(patch: Partial<Task>) {
    if (!task) return
    setSaving(true)
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...task,
        title: title || task.title,
        notes,
        recipe_data: JSON.stringify(recipe),
        start_date: startDate || null,
        due_date: dueDate || null,
        status,
        priority,
        ...patch,
      }),
    })
    const updated = await res.json()
    onUpdate({ ...updated, project_name: task.project_name, project_color: task.project_color, tags })
    setSaving(false)
  }

  async function promoteToProject() {
    if (!task) return
    setPromoting(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}/promote`, { method: 'POST' })
      const data = await res.json() as { ok?: boolean; project_id?: number; error?: string }
      if (!res.ok || data.error) { setPromoting(false); return }
      onDelete(task.id)
      onClose()
      router.push(`/projects/${data.project_id}`)
    } catch {
      setPromoting(false)
    }
  }

  function handleNotesChange(val: string) {
    setNotes(val)
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => save({ notes: val }), 800)
  }

  function handleRecipeChange(field: keyof RecipeData, val: string) {
    const next = { ...recipe, [field]: val }
    setRecipe(next)
    if (recipeTimer.current) clearTimeout(recipeTimer.current)
    recipeTimer.current = setTimeout(() => {
      if (!task) return
      fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...task, notes, recipe_data: JSON.stringify(next), due_date: dueDate || null, status, priority }),
      }).then(r => r.json()).then(updated => onUpdate({ ...updated, project_name: task.project_name, project_color: task.project_color, tags }))
    }, 800)
  }

  function getLines(field: 'ingredients' | 'steps'): string[] {
    const raw = recipe[field]
    if (!raw.trim()) return ['']
    return raw.split('\n')
  }

  function setLines(field: 'ingredients' | 'steps', lines: string[]) {
    handleRecipeChange(field, lines.join('\n'))
  }

  async function pushToRecipeKit() {
    if (!task) return
    setPushingKit(true)
    setKitMessage('')
    try {
      const res = await fetch('/api/agent/recipe-kit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe_name: task.title, ...recipe }),
      })
      const data = await res.json()
      if (data.error) {
        setKitMessage(data.error)
      } else {
        // Lock: store the RecipeKit ID in recipe_data
        handleRecipeChange('recipe_kit_id', data.recipe_kit_id ?? 'pushed')
      }
    } catch {
      setKitMessage('Something went wrong.')
    } finally {
      setPushingKit(false)
    }
  }

  function openContentModal() {
    setAgentError('')
    setShowContentModal(true)
  }

  async function generateContent() {
    if (!task || selectedModes.length === 0) return
    setShowContentModal(false)
    setAgentLoading(true)
    setGenerating(true)
    setAgentError('')

    const includesRecipe = selectedModes.includes('Recipe Only')
    const extraModes = selectedModes.filter(m => m !== 'Recipe Only')

    const prompt = `You are generating content for the following Weeknight Dinner Party recipe.

## Task Information

**Recipe Name:** ${task.title}${task.description ? `\n**Description:** ${task.description}` : ''}

**Current Recipe Data:**
- Ingredients: ${recipe.ingredients || 'Not yet provided'}
- About This Recipe: ${recipe.about || 'Not yet written'}
- Why You'll Like This: ${recipe.why || 'Not yet written'}
- Steps: ${recipe.steps || 'Not yet written'}
- Tips & Considerations: ${recipe.considerations || 'Not yet written'}
- Nutrition Notes: ${recipe.nutrition || 'Not yet written'}
- Keywords: ${recipe.keywords || 'Not yet written'}
${notes ? `\n**Notes:** ${notes}` : ''}
${extraInstructions.trim() ? `\n**Additional Instructions from User:** ${extraInstructions.trim()}` : ''}

---

## Requested Deliverables

${selectedModes.join(', ')}

---

## Output Instructions

${includesRecipe ? `First, output a JSON block with the complete recipe fields (write any that are empty, improve any that exist to match the WDP brand voice):

\`\`\`json
{
  "ingredients": "...",
  "about": "...",
  "why": "...",
  "steps": "...",
  "considerations": "...",
  "nutrition": "...",
  "keywords": "..."
}
\`\`\`

` : ''}${extraModes.length > 0 ? `Then produce each of the following content packages in full, clearly labeled with a markdown heading:\n${extraModes.map(m => `- ${m}`).join('\n')}` : ''}`

    try {
      setGeneratingStatus('Connecting to Creative Studio…')
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: CREATIVE_STUDIO_AGENT_ID,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      if (!res.ok || !res.body) throw new Error('API error')

      setGeneratingStatus('Writing content…')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        fullText += decoder.decode(value, { stream: true })
      }

      // Parse recipe JSON block if requested
      if (includesRecipe) {
        const jsonMatch = fullText.match(/```json\s*([\s\S]*?)```/)
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[1])
            const next: RecipeData = {
              ingredients: parsed.ingredients ?? recipe.ingredients,
              about: parsed.about ?? recipe.about,
              why: parsed.why ?? recipe.why,
              steps: parsed.steps ?? recipe.steps,
              considerations: parsed.considerations ?? recipe.considerations,
              nutrition: parsed.nutrition ?? recipe.nutrition,
              keywords: parsed.keywords ?? recipe.keywords,
              recipe_kit_id: recipe.recipe_kit_id,
            }
            setRecipe(next)
            await fetch(`/api/tasks/${task.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...task, notes, recipe_data: JSON.stringify(next), due_date: dueDate || null, status, priority }),
            }).then(r => r.json()).then(updated => onUpdate({ ...updated, project_name: task.project_name, project_color: task.project_color, tags }))
          } catch { /* ignore parse error */ }
        }
      }

      // Save extra content as attachment
      if (extraModes.length > 0) {
        const contentAfterJson = includesRecipe
          ? fullText.replace(/```json[\s\S]*?```/, '').trim()
          : fullText.trim()

        if (contentAfterJson) {
          setGeneratingStatus('Saving content…')
          const title = extraModes.join(' + ')
          const res2 = await fetch(`/api/tasks/${task.id}/attachments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, content_type: extraModes.join(','), content: contentAfterJson }),
          })
          const newAttachment = await res2.json()
          setAttachments(prev => [newAttachment, ...prev])
          setExpandedAttachment(newAttachment.id)
        }
      }
    } catch {
      setAgentError('Something went wrong generating content. Try again.')
    } finally {
      setAgentLoading(false)
      setGenerating(false)
      setGeneratingStatus('')
    }
  }

  async function addTag(tag: Tag) {
    if (!task) return
    await fetch(`/api/tasks/${task.id}/tags`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_id: tag.id }),
    })
    const next = [...tags, tag]
    setTags(next)
    onUpdate({ ...task, notes, due_date: dueDate || null, status, priority, tags: next })
  }

  async function removeTag(tag: Tag) {
    if (!task) return
    await fetch(`/api/tasks/${task.id}/tags`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_id: tag.id }),
    })
    const next = tags.filter(t => t.id !== tag.id)
    setTags(next)
    onUpdate({ ...task, notes, due_date: dueDate || null, status, priority, tags: next })
  }

  async function addSubtask() {
    if (!task || !newSubtaskTitle.trim()) return
    setSubtaskAdding(true)
    const res = await fetch('/api/subtasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: task.id, title: newSubtaskTitle.trim() }),
    })
    const created = await res.json() as Subtask
    setSubtasks(prev => [...prev, created])
    setNewSubtaskTitle('')
    setSubtaskAdding(false)
  }

  async function toggleSubtask(s: Subtask) {
    const newCompleted = !s.completed
    const newStatus: TaskStatus = newCompleted ? 'done' : 'todo'
    const updated = { ...s, completed: newCompleted, status: newStatus }
    setSubtasks(prev => prev.map(sub => sub.id === s.id ? updated : sub))
    onSubtaskToggle?.(updated)
    await fetch(`/api/subtasks/${s.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: s.title, notes: s.notes, due_date: s.due_date, completed: newCompleted, status: newStatus }),
    })
  }

  async function deleteSubtask(id: number) {
    setSubtasks(prev => prev.filter(s => s.id !== id))
    await fetch(`/api/subtasks/${id}`, { method: 'DELETE' })
  }

  async function handleSubtaskDrop(dropIndex: number) {
    const fromIndex = dragIndexRef.current
    if (fromIndex === null || fromIndex === dropIndex) {
      setDragOverIndex(null)
      dragIndexRef.current = null
      return
    }
    const reordered = [...subtasks]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(dropIndex, 0, moved)
    setSubtasks(reordered)
    setDragOverIndex(null)
    dragIndexRef.current = null
    await fetch('/api/subtasks/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: reordered.map(s => s.id) }),
    })
  }

  async function updateSubtaskDueDate(s: Subtask, date: string) {
    const updated = { ...s, due_date: date || null }
    setSubtasks(prev => prev.map(sub => sub.id === s.id ? updated : sub))
    await fetch(`/api/subtasks/${s.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: s.title, notes: s.notes, due_date: date || null, completed: s.completed, status: s.status }),
    })
  }

  async function addDependency(dependsOnId: number) {
    if (!task) return
    const res = await fetch('/api/tasks/dependencies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: task.id, depends_on_id: dependsOnId }),
    })
    if (res.ok) {
      const dep = await res.json()
      setDependencies(prev => [...prev, dep])
      setDepSearch('')
      setShowDepList(false)
    }
  }

  async function moveToProject(projectId: number | null) {
    if (!task) return
    const targetProject = allProjects.find(p => p.id === projectId)
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...task, title, notes, recipe_data: JSON.stringify(recipe), due_date: dueDate || null, status, priority, project_id: projectId }),
    }).then(r => r.json()).then(updated => onUpdate({ ...updated, project_name: targetProject?.name ?? null, project_color: task.project_color, tags }))
  }

  async function convertToSubtask(parentTaskId: number) {
    if (!task) return
    setConverting(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}/convert-to-subtask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_task_id: parentTaskId }),
      })
      if (!res.ok) { setConverting(false); return }
      const subtask = await res.json() as Subtask
      onConvertToSubtask?.(subtask)
      onDelete(task.id)
      onClose()
    } catch {
      setConverting(false)
    }
  }

  async function removeDependency(dependsOnId: number) {
    if (!task) return
    await fetch(`/api/tasks/dependencies?task_id=${task.id}&depends_on_id=${dependsOnId}`, { method: 'DELETE' })
    setDependencies(prev => prev.filter(d => d.depends_on_id !== dependsOnId))
  }

  const isRecipe = isRecipeProject(task)

  const accentColor = COLOR_HEX[task?.project_color ?? ''] ?? '#9BAE9A'
  const chipStatus = CHIP_STATUS[status] ?? CHIP_STATUS.todo
  const chipPriority = CHIP_PRIORITY[priority] ?? CHIP_PRIORITY.medium

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30" style={{ backgroundColor: 'rgba(44,44,44,0.2)' }} onClick={onClose} />
      )}
      <div className={cn(
        'fixed top-0 right-0 h-full bg-cream border-l border-mushroom z-40',
        'transition-transform duration-300 ease-in-out flex flex-col',
        isRecipe ? 'w-[560px]' : 'w-96',
        open ? 'translate-x-0 shadow-2xl' : 'translate-x-full'
      )}>
        {!task ? null : (
          <>
            {/* Color strip */}
            <div style={{ height: 4, background: accentColor, flexShrink: 0 }} />

            {/* Header */}
            <div style={{ padding: '10px 20px', borderBottom: '1px solid rgba(216,210,198,0.6)', flexShrink: 0, ...FONT }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: '#9BA69A', margin: '0 0 3px' }}>
                    {isRecipe ? 'Recipe' : 'Task'}
                  </p>
                  {task.project_name && (
                    <Link
                      href={`/projects/${task.project_id}`}
                      onClick={onClose}
                      style={{ fontSize: 12, color: '#747474', fontWeight: 500, textDecoration: 'none' }}
                      className="hover:text-ink-dark transition-colors"
                    >
                      {task.project_name}
                    </Link>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                  {saving && <span style={{ fontSize: 11, color: '#9BA69A', marginRight: 4 }}>Saving…</span>}
                  <button onClick={promoteToProject} disabled={promoting} title="Promote to project"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 5, color: '#9BA69A', display: 'flex', borderRadius: 6 }}
                    className="hover:text-blueberry transition-colors disabled:opacity-40">
                    <FolderInput style={{ width: 15, height: 15 }} />
                  </button>
                  <button onClick={() => { onDelete(task.id); onClose() }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 5, color: '#9BA69A', display: 'flex', borderRadius: 6 }}
                    className="hover:text-tomato transition-colors">
                    <Trash2 style={{ width: 15, height: 15 }} />
                  </button>
                  <button onClick={onClose}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 5, color: '#9BA69A', display: 'flex', borderRadius: 6 }}
                    className="hover:text-ink-dark transition-colors">
                    <X style={{ width: 15, height: 15 }} />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto" style={{ padding: '18px 20px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Title — large serif */}
              <div>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  onBlur={() => { if (title.trim() && title !== task.title) save({ title }) }}
                  placeholder="Task title…"
                  style={{
                    width: '100%', fontFamily: "'Cormorant Garamond', Georgia, serif",
                    fontSize: 24, fontWeight: 600, color: '#2C2C2C',
                    background: 'transparent', border: 'none', outline: 'none',
                    borderBottom: '1px solid rgba(216,210,198,0.6)', paddingBottom: 8,
                    lineHeight: 1.2,
                  }}
                />
              </div>

              {/* Chips: status + priority + date range */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <select
                  value={status}
                  onChange={e => { const v = e.target.value as TaskStatus; setStatus(v); save({ status: v }) }}
                  style={{ ...CHIP_SELECT, border: `1px solid ${chipStatus.color}55`, background: chipStatus.bg, color: chipStatus.color }}
                >
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="review">Review</option>
                  <option value="done">Done</option>
                </select>

                <select
                  value={priority}
                  onChange={e => { const v = e.target.value as TaskPriority; setPriority(v); save({ priority: v }) }}
                  style={{ ...CHIP_SELECT, border: `1px solid ${chipPriority.color}55`, background: chipPriority.bg, color: chipPriority.color }}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>

                {/* Date range chip */}
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                  padding: '4px 10px', borderRadius: 999,
                  background: 'rgba(216,210,198,0.25)', border: '1px solid rgba(216,210,198,0.6)',
                  ...FONT, fontSize: 11, color: '#747474', position: 'relative',
                }}>
                  <Calendar style={{ width: 11, height: 11, flexShrink: 0 }} />
                  <span>{startDate ? format(parseISO(startDate), 'MMM d') : 'Start'}</span>
                  <span style={{ opacity: 0.4 }}>→</span>
                  <span style={{ color: dueDate ? '#2C2C2C' : undefined, fontWeight: dueDate ? 600 : 400 }}>
                    {dueDate ? format(parseISO(dueDate), 'MMM d') : 'Due'}
                  </span>
                  <div style={{ position: 'absolute', inset: 0, opacity: 0, pointerEvents: 'none', display: 'flex' }}>
                    <input type="date" value={startDate}
                      onChange={e => { setStartDate(e.target.value); save({ start_date: e.target.value || null }) }}
                      style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', pointerEvents: 'auto', width: '50%' }} />
                    <input type="date" value={dueDate}
                      onChange={e => { setDueDate(e.target.value); save({ due_date: e.target.value || null }) }}
                      style={{ position: 'absolute', inset: 0, left: '50%', opacity: 0, cursor: 'pointer', pointerEvents: 'auto', width: '50%' }} />
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
                <label className={LABEL} style={LABEL_STYLE}>Tags</label>
                <div className="flex flex-wrap gap-1.5 items-center">
                  {tags.map(t => <TagChip key={t.id} tag={t} onRemove={() => removeTag(t)} />)}
                  <TagPicker selectedTags={tags} onAdd={addTag} onRemove={removeTag} />
                </div>
              </div>

              {/* Project */}
              <div>
                <label className={LABEL} style={LABEL_STYLE}>Project</label>
                <select
                  value={task.project_id ?? ''}
                  onChange={e => moveToProject(e.target.value ? Number(e.target.value) : null)}
                  className="w-full text-sm bg-white border border-mushroom rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-ink/20 cursor-pointer text-ink-dark"
                  style={FONT}
                >
                  <option value="">No Project</option>
                  {allProjects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Nest under task */}
              <div>
                <label className={LABEL} style={LABEL_STYLE}>Nest under task</label>
                <div className="relative">
                  <input
                    ref={nestInputRef}
                    value={nestSearch}
                    onChange={e => { setNestSearch(e.target.value); setShowNestList(true) }}
                    onFocus={() => setShowNestList(true)}
                    onBlur={() => setTimeout(() => setShowNestList(false), 150)}
                    placeholder={converting ? 'Converting…' : 'Search tasks…'}
                    disabled={converting}
                    className="w-full px-2.5 py-1.5 text-sm bg-white border border-mushroom rounded-lg outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink text-ink-dark placeholder:text-ink/30 transition-all disabled:opacity-50"
                    style={FONT}
                  />
                  {showNestList && (() => {
                    const q = nestSearch.toLowerCase()
                    const filtered = allTasks.filter(t => {
                      if (t.id === task?.id) return false
                      if (!q && !nestSearch) return false
                      if (task?.project_id ? t.project_id !== task.project_id : t.project_id !== null) return false
                      return !q || t.title.toLowerCase().includes(q)
                    }).slice(0, 8)
                    if (filtered.length === 0) return null
                    return (
                      <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-mushroom rounded-lg shadow-lg overflow-hidden">
                        {filtered.map(t => (
                          <button
                            key={t.id}
                            onMouseDown={() => convertToSubtask(t.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-oatmilk transition-colors cursor-pointer"
                          >
                            <span className="text-xs text-ink-dark flex-1 min-w-0 truncate" style={FONT}>{t.title}</span>
                            {t.project_name && <span className="text-[10px] text-ink/40 shrink-0" style={FONT}>{t.project_name}</span>}
                          </button>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* Subtasks */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className={LABEL} style={LABEL_STYLE}>Subtasks</label>
                  {subtasks.length > 0 && (
                    <span className="text-[10px] text-ink/40" style={FONT}>
                      {subtasks.filter(s => !!s.completed).length}/{subtasks.length} done
                    </span>
                  )}
                </div>

                {subtasks.length > 0 && (
                  <div className="space-y-0.5 mb-3">
                    {subtasks.map((s, i) => (
                      <div
                        key={s.id}
                        draggable
                        onDragStart={() => { dragIndexRef.current = i }}
                        onDragOver={e => { e.preventDefault(); setDragOverIndex(i) }}
                        onDrop={() => handleSubtaskDrop(i)}
                        onDragEnd={() => { setDragOverIndex(null); dragIndexRef.current = null }}
                        className={cn(
                          'flex items-center gap-2 group rounded-lg px-1 py-1.5 hover:bg-oatmilk/60 transition-all',
                          dragOverIndex === i && 'border-t-2 border-blueberry'
                        )}
                      >
                        <GripVertical className="w-3.5 h-3.5 text-mushroom opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing shrink-0" />
                        <button
                          onClick={() => toggleSubtask(s)}
                          className={cn(
                            'w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all cursor-pointer',
                            !!s.completed
                              ? 'bg-ink border-ink'
                              : 'border-mushroom bg-white hover:border-ink'
                          )}
                        >
                          {!!s.completed && <Check className="w-2.5 h-2.5 text-cream" />}
                        </button>
                        <span
                          onClick={() => onOpenSubtask?.(s)}
                          className={cn('text-sm flex-1 min-w-0', !!s.completed ? 'text-ink/40 line-through' : 'text-ink-dark', onOpenSubtask ? 'cursor-pointer hover:underline' : '')}
                          style={FONT}
                        >
                          {s.title}
                        </span>
                        {/* Due date — calendar icon always visible, invisible date input overlaid */}
                        <label
                          className="relative shrink-0 flex items-center gap-1 cursor-pointer"
                          title={s.due_date ? 'Change due date' : 'Set due date'}
                        >
                          <Calendar className="w-3 h-3" style={{ color: s.due_date ? (new Date(s.due_date + 'T00:00:00') < new Date(new Date().toDateString()) && !s.completed ? '#C14B3A' : '#9BA69A') : 'rgba(44,44,44,0.2)' }} />
                          {s.due_date && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: new Date(s.due_date + 'T00:00:00') < new Date(new Date().toDateString()) && !s.completed ? '#C14B3A' : '#747474', ...FONT }}>
                              {format(parseISO(s.due_date), 'MMM d')}
                            </span>
                          )}
                          <input
                            type="date"
                            value={s.due_date || ''}
                            onChange={e => updateSubtaskDueDate(s, e.target.value)}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full"
                            tabIndex={-1}
                          />
                        </label>
                        <button
                          onClick={() => deleteSubtask(s.id)}
                          className="text-ink/20 hover:text-tomato transition-colors cursor-pointer p-0.5 shrink-0 opacity-0 group-hover:opacity-100"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    value={newSubtaskTitle}
                    onChange={e => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addSubtask() }}
                    placeholder="Add a subtask…"
                    className="flex-1 px-2.5 py-1.5 text-sm bg-white border border-mushroom rounded-lg outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink text-ink-dark placeholder:text-ink/30 transition-all"
                    style={FONT}
                  />
                  <button
                    onClick={addSubtask}
                    disabled={!newSubtaskTitle.trim() || subtaskAdding}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer disabled:opacity-40"
                    style={{ ...FONT, borderColor: 'rgba(44,44,44,0.2)', color: '#2C2C2C' }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add
                  </button>
                </div>
              </div>

              {/* ── Dependencies ── */}
              <div className="border-t border-mushroom pt-4">
                <p className={LABEL} style={LABEL_STYLE}>Blocked by</p>
                {dependencies.length > 0 && (
                  <div className="flex flex-col gap-1.5 mb-3">
                    {dependencies.map(dep => {
                      const isDone = dep.status === 'done'
                      return (
                        <div key={dep.depends_on_id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-oatmilk border border-mushroom group">
                          <div style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, background: isDone ? '#9BAE9A' : dep.status === 'in_progress' ? '#78B7C5' : '#D8D2C6' }} />
                          <span className={cn('text-xs flex-1 min-w-0 truncate', isDone ? 'text-ink/40 line-through' : 'text-ink-dark')} style={FONT}>
                            {dep.title}
                          </span>
                          {dep.project_name && (
                            <span className="text-[10px] text-ink/40 shrink-0" style={FONT}>{dep.project_name}</span>
                          )}
                          <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 999, flexShrink: 0, background: isDone ? 'rgba(155,174,154,0.2)' : 'rgba(216,210,198,0.5)', color: isDone ? '#4a6e49' : '#747474', ...FONT }}>
                            {isDone ? 'Done' : dep.status === 'in_progress' ? 'In Progress' : dep.status === 'review' ? 'Review' : 'To Do'}
                          </span>
                          <button onClick={() => removeDependency(dep.depends_on_id)} className="text-ink/20 hover:text-tomato transition-colors cursor-pointer p-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
                {/* Search bar dependency picker */}
                <div className="relative">
                  <input
                    ref={depInputRef}
                    value={depSearch}
                    onChange={e => { setDepSearch(e.target.value); setShowDepList(true) }}
                    onFocus={() => setShowDepList(true)}
                    onBlur={() => setTimeout(() => setShowDepList(false), 150)}
                    placeholder="Search tasks to block on…"
                    className="w-full px-2.5 py-1.5 text-sm bg-white border border-mushroom rounded-lg outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink text-ink-dark placeholder:text-ink/30 transition-all"
                    style={FONT}
                  />
                  {showDepList && (() => {
                    const q = depSearch.toLowerCase()
                    const filtered = allTasks.filter(t => {
                      if (t.id === task?.id) return false
                      if (dependencies.find(d => d.depends_on_id === t.id)) return false
                      // Scope to same project; if no project, scope to other unassigned tasks
                      if (task?.project_id ? t.project_id !== task.project_id : t.project_id !== null) return false
                      return !q || t.title.toLowerCase().includes(q)
                    }).slice(0, 8)
                    if (filtered.length === 0) return null
                    return (
                      <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-mushroom rounded-lg shadow-lg overflow-hidden">
                        {filtered.map(t => (
                          <button
                            key={t.id}
                            onMouseDown={() => addDependency(t.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-oatmilk transition-colors cursor-pointer"
                          >
                            <span className="text-xs text-ink-dark flex-1 min-w-0 truncate" style={FONT}>{t.title}</span>
                            {t.project_name && <span className="text-[10px] text-ink/40 shrink-0" style={FONT}>{t.project_name}</span>}
                          </button>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* ── Recipe sections ── */}
              {isRecipe && (
                <div className="space-y-4">
                  <div className="border-t border-mushroom pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[10px] font-semibold text-ink uppercase tracking-widest" style={LABEL_STYLE}>
                        Recipe Content
                      </p>
                      <div className="flex items-center gap-2">
                        <a
                          href="https://admin.shopify.com/store/eiy0fe-13/apps/recipe-kit"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                          style={{ ...FONT, background: 'rgba(120,183,197,0.12)', border: '1px solid rgba(120,183,197,0.3)', color: '#3d7684' }}
                        >
                          <Upload className="w-3.5 h-3.5" /> Open RecipeKit ↗
                        </a>
                        <button
                          onClick={openContentModal}
                          disabled={agentLoading || !!recipe.recipe_kit_id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                          style={{ ...FONT, background: 'rgba(194,122,84,0.1)', border: '1px solid rgba(194,122,84,0.3)', color: '#a35a37' }}
                        >
                          {agentLoading
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {generatingStatus || 'Writing…'}</>
                            : <><Sparkles className="w-3.5 h-3.5" /> Write with Agent</>
                          }
                        </button>
                      </div>
                    </div>
                    {kitMessage && (
                      <p className="text-xs bg-oatmilk border border-mushroom rounded-lg px-3 py-2 mb-3" style={{ ...FONT, color: kitMessage.toLowerCase().includes('error') || kitMessage.toLowerCase().includes('wrong') ? '#C14B3A' : '#3d7684' }}>
                        {kitMessage}
                      </p>
                    )}
                  </div>

                  {agentError && (
                    <p className="text-xs text-tomato bg-tomato/5 border border-tomato/20 rounded-lg px-3 py-2" style={FONT}>
                      {agentError}
                    </p>
                  )}

                  {/* Ingredients — one input per line */}
                  <div>
                    <label className={LABEL} style={LABEL_STYLE}>Ingredients</label>
                    <div className="space-y-1.5">
                      {getLines('ingredients').map((line, i, arr) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <span className="text-xs text-ink/30 w-4 text-right shrink-0" style={FONT}>{i + 1}</span>
                          <input
                            ref={el => { ingredientRefs.current[i] = el }}
                            value={line}
                            disabled={!!recipe.recipe_kit_id}
                            onChange={e => {
                              if (recipe.recipe_kit_id) return
                              const next = [...arr]; next[i] = e.target.value; setLines('ingredients', next)
                            }}
                            onKeyDown={e => {
                              if (recipe.recipe_kit_id) return
                              if (e.key === 'Enter') { e.preventDefault(); const next = [...arr]; next.splice(i + 1, 0, ''); setLines('ingredients', next); setTimeout(() => ingredientRefs.current[i + 1]?.focus(), 0) }
                              if (e.key === 'Backspace' && line === '' && arr.length > 1) { e.preventDefault(); const next = arr.filter((_, j) => j !== i); setLines('ingredients', next); setTimeout(() => ingredientRefs.current[Math.max(0, i - 1)]?.focus(), 0) }
                            }}
                            placeholder={i === 0 ? '2 tbsp WDP House Seasoning' : 'Add ingredient…'}
                            className={'flex-1 px-2.5 py-1.5 text-sm bg-white border border-mushroom rounded-lg outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink text-ink-dark placeholder:text-ink/30 transition-all' + (recipe.recipe_kit_id ? ' opacity-50 cursor-not-allowed' : '')}
                            style={FONT}
                          />
                          {arr.length > 1 && !recipe.recipe_kit_id && (
                            <button onClick={() => setLines('ingredients', arr.filter((_, j) => j !== i))}
                              className="text-ink/20 hover:text-tomato transition-colors cursor-pointer p-0.5 shrink-0">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                      {!recipe.recipe_kit_id && (
                        <button
                          onClick={() => setLines('ingredients', [...getLines('ingredients'), ''])}
                          className="flex items-center gap-1 text-xs text-ink/40 hover:text-ink transition-colors cursor-pointer mt-1"
                          style={FONT}
                        >
                          <Plus className="w-3 h-3" /> Add ingredient
                        </button>
                      )}
                    </div>
                  </div>

                  {/* About */}
                  <div>
                    <label className={LABEL} style={LABEL_STYLE}>About This Recipe</label>
                    <textarea
                      value={recipe.about}
                      onChange={e => handleRecipeChange('about', e.target.value)}
                      disabled={!!recipe.recipe_kit_id}
                      placeholder="What makes this dish special?"
                      rows={3}
                      className={TEXTAREA_CLASS + (recipe.recipe_kit_id ? ' opacity-50 cursor-not-allowed' : '')}
                      style={FONT}
                    />
                  </div>

                  {/* Why */}
                  <div>
                    <label className={LABEL} style={LABEL_STYLE}>Why You&apos;ll Like This</label>
                    <textarea
                      value={recipe.why}
                      onChange={e => handleRecipeChange('why', e.target.value)}
                      disabled={!!recipe.recipe_kit_id}
                      placeholder="Flavor, texture, weeknight simplicity…"
                      rows={3}
                      className={TEXTAREA_CLASS + (recipe.recipe_kit_id ? ' opacity-50 cursor-not-allowed' : '')}
                      style={FONT}
                    />
                  </div>

                  {/* Steps — one input per step */}
                  <div>
                    <label className={LABEL} style={LABEL_STYLE}>Steps</label>
                    <div className="space-y-1.5">
                      {getLines('steps').map((line, i, arr) => (
                        <div key={i} className="flex items-start gap-1.5">
                          <span className="text-xs text-ink/40 w-4 text-right shrink-0 mt-2 font-semibold" style={FONT}>{i + 1}</span>
                          <textarea
                            ref={el => { stepRefs.current[i] = el }}
                            value={line}
                            disabled={!!recipe.recipe_kit_id}
                            onChange={e => {
                              if (recipe.recipe_kit_id) return
                              const next = [...arr]; next[i] = e.target.value; setLines('steps', next)
                            }}
                            onKeyDown={e => {
                              if (recipe.recipe_kit_id) return
                              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const next = [...arr]; next.splice(i + 1, 0, ''); setLines('steps', next); setTimeout(() => stepRefs.current[i + 1]?.focus(), 0) }
                              if (e.key === 'Backspace' && line === '' && arr.length > 1) { e.preventDefault(); const next = arr.filter((_, j) => j !== i); setLines('steps', next); setTimeout(() => stepRefs.current[Math.max(0, i - 1)]?.focus(), 0) }
                            }}
                            placeholder={i === 0 ? 'Preheat oven to 425°F…' : 'Next step…'}
                            rows={2}
                            className={'flex-1 px-2.5 py-1.5 text-sm bg-white border border-mushroom rounded-lg outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink text-ink-dark placeholder:text-ink/30 resize-none transition-all' + (recipe.recipe_kit_id ? ' opacity-50 cursor-not-allowed' : '')}
                            style={FONT}
                          />
                          {arr.length > 1 && !recipe.recipe_kit_id && (
                            <button onClick={() => setLines('steps', arr.filter((_, j) => j !== i))}
                              className="text-ink/20 hover:text-tomato transition-colors cursor-pointer p-0.5 shrink-0 mt-1">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                      {!recipe.recipe_kit_id && (
                        <button
                          onClick={() => setLines('steps', [...getLines('steps'), ''])}
                          className="flex items-center gap-1 text-xs text-ink/40 hover:text-ink transition-colors cursor-pointer mt-1"
                          style={FONT}
                        >
                          <Plus className="w-3 h-3" /> Add step
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Considerations */}
                  <div>
                    <label className={LABEL} style={LABEL_STYLE}>Recipe Considerations</label>
                    <textarea
                      value={recipe.considerations}
                      onChange={e => handleRecipeChange('considerations', e.target.value)}
                      disabled={!!recipe.recipe_kit_id}
                      placeholder="Substitutions, make-ahead tips, what to serve alongside…"
                      rows={3}
                      className={TEXTAREA_CLASS + (recipe.recipe_kit_id ? ' opacity-50 cursor-not-allowed' : '')}
                      style={FONT}
                    />
                  </div>

                  {/* Nutrition */}
                  <div>
                    <label className={LABEL} style={LABEL_STYLE}>Nutritional Info</label>
                    <textarea
                      value={recipe.nutrition}
                      onChange={e => handleRecipeChange('nutrition', e.target.value)}
                      disabled={!!recipe.recipe_kit_id}
                      placeholder="Calories, macros, or key nutrients per serving…"
                      rows={3}
                      className={TEXTAREA_CLASS + (recipe.recipe_kit_id ? ' opacity-50 cursor-not-allowed' : '')}
                      style={FONT}
                    />
                  </div>

                  {/* Keywords */}
                  <div>
                    <label className={LABEL} style={LABEL_STYLE}>Keywords</label>
                    <textarea
                      value={recipe.keywords}
                      onChange={e => handleRecipeChange('keywords', e.target.value)}
                      disabled={!!recipe.recipe_kit_id}
                      placeholder="weeknight dinner, easy chicken, spice blend…"
                      rows={2}
                      className={TEXTAREA_CLASS + (recipe.recipe_kit_id ? ' opacity-50 cursor-not-allowed' : '')}
                      style={FONT}
                    />
                  </div>

                  {/* Locked banner */}
                  {recipe.recipe_kit_id && (
                    <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border" style={{ background: 'rgba(120,183,197,0.08)', borderColor: 'rgba(120,183,197,0.3)' }}>
                      <div className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 shrink-0" style={{ color: '#3d7684' }} />
                        <span className="text-xs font-semibold" style={{ ...FONT, color: '#3d7684' }}>
                          Pushed to RecipeKit · Editing locked
                        </span>
                      </div>
                      {recipe.recipe_kit_id !== 'pushed' && (
                        <a
                          href={`https://app.recipekit.app/recipes/${recipe.recipe_kit_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold underline underline-offset-2"
                          style={{ ...FONT, color: '#3d7684' }}
                        >
                          View in RecipeKit ↗
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Notes (always shown, label changes for recipe projects) */}
              <div>
                <label className={LABEL} style={LABEL_STYLE}>{isRecipe ? 'Additional Notes' : 'Notes'}</label>
                <textarea
                  value={notes}
                  onChange={e => handleNotesChange(e.target.value)}
                  placeholder="Add notes, context, or links…"
                  rows={isRecipe ? 3 : 8}
                  className={TEXTAREA_CLASS}
                  style={FONT}
                />
              </div>

              {/* Generated attachments */}
              {isRecipe && attachments.length > 0 && (
                <div>
                  <label className={LABEL} style={LABEL_STYLE}>Generated Content</label>
                  <div className="space-y-2">
                    {attachments.map(att => (
                      <div key={att.id} className="border border-mushroom rounded-xl overflow-hidden bg-white">
                        <div className="flex items-center gap-2 px-3 py-2.5">
                          <FileText className="w-3.5 h-3.5 text-ink/40 shrink-0" />
                          <span className="flex-1 text-sm font-semibold text-ink-dark truncate" style={FONT}>{att.title}</span>
                          <span className="text-[10px] text-ink/30 shrink-0" style={FONT}>
                            {new Date(att.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                          <button
                            onClick={() => setExpandedAttachment(expandedAttachment === att.id ? null : att.id)}
                            className="text-ink/40 hover:text-ink transition-colors cursor-pointer shrink-0"
                          >
                            {expandedAttachment === att.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={async () => {
                              await fetch(`/api/task-attachments/${att.id}`, { method: 'DELETE' })
                              setAttachments(prev => prev.filter(a => a.id !== att.id))
                              if (expandedAttachment === att.id) setExpandedAttachment(null)
                            }}
                            className="text-ink/20 hover:text-tomato transition-colors cursor-pointer shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {expandedAttachment === att.id && (
                          <div className="border-t border-mushroom px-3 py-3 max-h-96 overflow-y-auto">
                            <pre className="text-xs text-ink-dark whitespace-pre-wrap leading-relaxed" style={FONT}>{att.content}</pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Content selection modal */}
      {showContentModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: 'rgba(44,44,44,0.45)', backdropFilter: 'blur(2px)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowContentModal(false) }}
        >
          <div className="bg-cream rounded-2xl shadow-2xl w-[480px] max-h-[90vh] overflow-y-auto" style={{ border: '1px solid rgba(44,44,44,0.1)' }}>
            <div className="px-6 pt-6 pb-4 border-b border-mushroom">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-4 h-4 text-terracotta" />
                  <span className="font-semibold text-ink-dark" style={{ ...FONT, fontSize: 15 }}>Creative Studio</span>
                </div>
                <button onClick={() => setShowContentModal(false)} className="text-ink/30 hover:text-ink cursor-pointer transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-ink/50 mt-1.5" style={FONT}>
                Select what you&apos;d like the agent to produce for <strong className="text-ink/70">{task?.title}</strong>
              </p>
            </div>

            <div className="px-6 py-4 space-y-2">
              {CONTENT_MODES.map(mode => {
                const checked = selectedModes.includes(mode.id)
                return (
                  <label
                    key={mode.id}
                    className={cn(
                      'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all',
                      checked
                        ? 'border-terracotta/40 bg-terracotta/5'
                        : 'border-mushroom bg-white hover:border-ink/20'
                    )}
                  >
                    <div className={cn(
                      'w-4 h-4 rounded border-2 shrink-0 mt-0.5 flex items-center justify-center transition-all',
                      checked ? 'bg-terracotta border-terracotta' : 'border-mushroom bg-white'
                    )}>
                      {checked && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={() => setSelectedModes(prev =>
                        prev.includes(mode.id) ? prev.filter(m => m !== mode.id) : [...prev, mode.id]
                      )}
                    />
                    <div>
                      <div className="text-sm font-semibold text-ink-dark" style={FONT}>{mode.label}</div>
                      <div className="text-xs text-ink/50 mt-0.5" style={FONT}>{mode.desc}</div>
                    </div>
                  </label>
                )
              })}
            </div>

            <div className="px-6 pb-4">
              <label className="block text-[10px] font-semibold text-ink uppercase tracking-widest mb-2" style={LABEL_STYLE}>
                Additional Instructions (optional)
              </label>
              <textarea
                value={extraInstructions}
                onChange={e => setExtraInstructions(e.target.value)}
                placeholder="e.g. Make the tone more casual, focus on the spice blend, write for a beginner audience…"
                rows={3}
                className="w-full px-3 py-2.5 text-sm bg-white border border-mushroom rounded-xl outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink text-ink-dark placeholder:text-ink/40 resize-none transition-all"
                style={FONT}
              />
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={generateContent}
                disabled={selectedModes.length === 0}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer disabled:opacity-40"
                style={{ ...FONT, background: '#a35a37', color: '#fff', border: 'none' }}
              >
                <Sparkles className="w-4 h-4" />
                Generate {selectedModes.length > 0 ? `(${selectedModes.length} selected)` : ''}
              </button>
              <button
                onClick={() => setShowContentModal(false)}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-mushroom text-ink/60 cursor-pointer hover:border-ink/30 transition-all"
                style={FONT}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
