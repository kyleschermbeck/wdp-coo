'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, FileText, Trash2, ChevronLeft, Tag, Save, Link2,
  Bold, Italic, Underline, Strikethrough,
  List, ListOrdered, ListTodo, Minus, FolderOpen, ChevronDown,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Superscript, Subscript, Link as LinkIcon, Highlighter,
  Code, TextQuote, IndentIncrease, IndentDecrease,
  Check, X, ExternalLink, Type, Baseline, ArrowRight,
} from 'lucide-react'
import { TagChip, TagPicker } from '@/components/ui/TagPicker'
import { Tag as TagType } from '@/lib/types'

const FONT  = "'Jost', system-ui, sans-serif"
const SERIF = "'Cormorant Garamond', Georgia, serif"

const CATEGORIES = [
  { value: 'planning',   label: 'Planning',   color: '#9B59B6' },
  { value: 'campaign',   label: 'Campaign',   color: '#1877F2' },
  { value: 'operations', label: 'Operations', color: '#C27A54' },
  { value: 'reference',  label: 'Reference',  color: '#4A7C8A' },
]
function catMeta(cat: string) { return CATEGORIES.find(c => c.value === cat) ?? CATEGORIES[0] }

interface PlanningDoc {
  id: number; title: string; body: string; category: string
  project_id?: number | null; created_at: string; updated_at: string; excerpt?: string
}
interface Task { id: number; title: string; status: string; priority: string }
interface FullTask extends Task {
  description?: string | null; notes?: string | null; due_date?: string | null
  start_date?: string | null; project_name?: string | null; project_color?: string | null; project_id?: number | null
}
interface Project { id: number; name: string; status: string; color?: string }
interface Subtask {
  id: number; task_id: number; title: string; completed: boolean; status: string
  notes?: string | null; due_date?: string | null; sort_order?: number
}
// TagType is imported from @/lib/types via TagPicker import

// ── Convert legacy markdown → HTML for backward compat ──────────────────────
function markdownToHtml(md: string): string {
  if (!md || md.includes('<p>') || md.includes('<h1>') || md.includes('<strong>')) return md
  // Strip empty bold/italic markers used as decorators (****) and leading/trailing whitespace
  const cleaned = md.replace(/\*{2,4}/g, m => m.length === 4 ? '' : m)
  const lines = cleaned.split(/\r?\n/)
  const out: string[] = []
  let inUl = false, inOl = false
  const closeList = () => {
    if (inUl) { out.push('</ul>'); inUl = false }
    if (inOl) { out.push('</ol>'); inOl = false }
  }
  for (const raw of lines) {
    let line = raw
    // inline bold/italic
    line = line.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    line = line.replace(/\*(.+?)\*/g, '<em>$1</em>')
    // headings (must check before inline processing)
    if (/^### /.test(line)) { closeList(); out.push(`<h3>${line.slice(4).replace(/\[\[task:(\d+)\]\]/g, '<span contenteditable="false" data-task-id="$1" class="wdp-task-chip">📋 Task #$1</span>')}</h3>`); continue }
    if (/^## /.test(line))  { closeList(); out.push(`<h2>${line.slice(3).replace(/\[\[task:(\d+)\]\]/g, '<span contenteditable="false" data-task-id="$1" class="wdp-task-chip">📋 Task #$1</span>')}</h2>`); continue }
    if (/^# /.test(line))   { closeList(); out.push(`<h1>${line.slice(2).replace(/\[\[task:(\d+)\]\]/g, '<span contenteditable="false" data-task-id="$1" class="wdp-task-chip">📋 Task #$1</span>')}</h1>`); continue }
    // task chips (for non-heading lines)
    line = line.replace(/\[\[task:(\d+)\]\]/g, '<span contenteditable="false" data-task-id="$1" class="wdp-task-chip">📋 Task #$1</span>')
    // hr
    if (/^---/.test(line)) { closeList(); out.push('<hr>'); continue }
    // ul
    if (/^- /.test(line)) {
      if (inOl) { out.push('</ol>'); inOl = false }
      if (!inUl) { out.push('<ul>'); inUl = true }
      out.push(`<li>${line.slice(2)}</li>`); continue
    }
    // ol
    if (/^\d+\. /.test(line)) {
      if (inUl) { out.push('</ul>'); inUl = false }
      if (!inOl) { out.push('<ol>'); inOl = true }
      out.push(`<li>${line.replace(/^\d+\. /, '')}</li>`); continue
    }
    closeList()
    if (line.trim() === '') { out.push('<p><br></p>'); continue }
    out.push(`<p>${line}</p>`)
  }
  closeList()
  return out.join('\n')
}

// ── Chip style injected into saved HTML ─────────────────────────────────────
function taskChipHtml(task: Task) {
  return `<span contenteditable="false" data-task-id="${task.id}" class="wdp-task-chip">📋 ${task.title.replace(/</g, '&lt;')}</span>`
}

// ── Toolbar button (mousedown prevents blur) ────────────────────────────────
function TBtn({ icon: Icon, label, active, onAction }: { icon: React.ElementType; label: string; active?: boolean; onAction: () => void }) {
  return (
    <button
      title={label}
      onMouseDown={e => e.preventDefault()}
      onClick={onAction}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: 5, border: 'none', cursor: 'pointer',
        background: active ? 'var(--wdp-surface)' : 'transparent',
        color: active ? 'var(--wdp-ink)' : 'var(--wdp-ink-mid)',
        fontWeight: active ? 700 : 400,
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--wdp-surface)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      <Icon size={14} strokeWidth={active ? 2.5 : 1.75} />
    </button>
  )
}

const STATUS_OPTIONS = ['todo', 'in_progress', 'review', 'blocked', 'done']
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent']
const STATUS_COLORS: Record<string, string> = {
  todo: '#9B9B9B', in_progress: '#4A90D9', review: '#9B59B6', blocked: '#E74C3C', done: '#27AE60'
}
const PRIORITY_COLORS: Record<string, string> = {
  low: '#9B9B9B', medium: '#F39C12', high: '#E67E22', urgent: '#E74C3C'
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const,
  color: 'var(--wdp-ink-mid)', marginBottom: 6,
}

function TaskSidePanel({ task, saving, onClose, onChange }: {
  task: FullTask; saving: boolean
  onClose: () => void
  onChange: (patch: Partial<FullTask>) => void
}) {
  const [localNotes, setLocalNotes] = useState(task.notes ?? '')
  const [subtasks, setSubtasks] = useState<Subtask[]>([])
  const [newSubtask, setNewSubtask] = useState('')
  const [subtaskAdding, setSubtaskAdding] = useState(false)
  const [tags, setTags] = useState<TagType[]>([])
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const subtaskInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLocalNotes(task.notes ?? '')
    setSubtasks([])
    setTags([])
    fetch(`/api/subtasks?task_id=${task.id}`)
      .then(r => r.json())
      .then(d => setSubtasks(Array.isArray(d) ? d : []))
    fetch(`/api/tasks/${task.id}/tags`)
      .then(r => r.json())
      .then(d => setTags(Array.isArray(d) ? d : []))
  }, [task.id])

  function saveNotes(val: string) {
    setLocalNotes(val)
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => onChange({ notes: val }), 600)
  }

  async function toggleSubtask(s: Subtask) {
    const completed = !s.completed
    const status = completed ? 'done' : 'todo'
    setSubtasks(prev => prev.map(x => x.id === s.id ? { ...x, completed, status } : x))
    await fetch(`/api/subtasks/${s.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: s.title, notes: s.notes, due_date: s.due_date, completed, status }),
    })
  }

  async function addSubtask() {
    if (!newSubtask.trim()) return
    setSubtaskAdding(true)
    const res = await fetch('/api/subtasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: task.id, title: newSubtask.trim() }),
    })
    const created = await res.json() as Subtask
    setSubtasks(prev => [...prev, created])
    setNewSubtask('')
    setSubtaskAdding(false)
    subtaskInputRef.current?.focus()
  }

  async function deleteSubtask(id: number) {
    setSubtasks(prev => prev.filter(s => s.id !== id))
    await fetch(`/api/subtasks/${id}`, { method: 'DELETE' })
  }

  async function addTag(tag: TagType) {
    if (tags.find(t => t.id === tag.id)) return
    await fetch(`/api/tasks/${task.id}/tags`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_id: tag.id }),
    })
    setTags(prev => [...prev, tag])
  }

  async function removeTag(tag: TagType) {
    await fetch(`/api/tasks/${task.id}/tags`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_id: tag.id }),
    })
    setTags(prev => prev.filter(t => t.id !== tag.id))
  }

  const done = subtasks.filter(s => s.completed).length
  const total = subtasks.length

  return (
    <div style={{
      width: 320, flexShrink: 0, borderLeft: '1px solid var(--wdp-border)',
      display: 'flex', flexDirection: 'column',
      background: 'var(--wdp-panel-bg, #F7F7F5)',
      fontFamily: FONT, animation: 'slideInRight 0.18s ease',
    }}>
      <style>{`@keyframes slideInRight { from { transform: translateX(20px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--wdp-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)' }}>Task</div>
          {task.project_name && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: task.project_color ?? '#9B9B9B' }} />
              <span style={{ fontSize: 9, color: 'var(--wdp-ink-mid)' }}>{task.project_name}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {saving && <span style={{ fontSize: 9, color: 'var(--wdp-ink-dim)' }}>saving…</span>}
          <a href={`/tasks`} title="Open in Tasks" style={{ display: 'flex', alignItems: 'center', color: 'var(--wdp-ink-mid)', padding: '2px 3px' }}>
            <ExternalLink size={12} />
          </a>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--wdp-ink-mid)', display: 'flex', alignItems: 'center', padding: '2px 3px' }}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>

        {/* Title */}
        <textarea
          value={task.title}
          onChange={e => onChange({ title: e.target.value })}
          rows={2}
          style={{
            width: '100%', fontFamily: FONT, fontSize: 15, fontWeight: 700,
            color: 'var(--wdp-ink)', background: 'transparent', border: 'none', outline: 'none',
            resize: 'none', lineHeight: 1.4, marginBottom: 14,
          }}
        />

        {/* Status + Priority */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          <div>
            <div style={SECTION_LABEL}>Status</div>
            <select
              value={task.status}
              onChange={e => onChange({ status: e.target.value })}
              style={{
                width: '100%', fontFamily: FONT, fontSize: 11, padding: '5px 7px',
                border: '1px solid var(--wdp-border)', borderRadius: 5,
                background: 'var(--wdp-surface)', color: STATUS_COLORS[task.status] ?? 'var(--wdp-ink)',
                fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize',
              }}
            >
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div>
            <div style={SECTION_LABEL}>Priority</div>
            <select
              value={task.priority}
              onChange={e => onChange({ priority: e.target.value })}
              style={{
                width: '100%', fontFamily: FONT, fontSize: 11, padding: '5px 7px',
                border: '1px solid var(--wdp-border)', borderRadius: 5,
                background: 'var(--wdp-surface)', color: PRIORITY_COLORS[task.priority] ?? 'var(--wdp-ink)',
                fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize',
              }}
            >
              {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        {/* Due date */}
        <div style={{ marginBottom: 16 }}>
          <div style={SECTION_LABEL}>Due date</div>
          <input
            type="date"
            value={task.due_date?.slice(0, 10) ?? ''}
            onChange={e => onChange({ due_date: e.target.value || null })}
            style={{ fontFamily: FONT, fontSize: 11, padding: '5px 7px', border: '1px solid var(--wdp-border)', borderRadius: 5, background: 'var(--wdp-surface)', color: 'var(--wdp-ink)', width: '100%', cursor: 'pointer' }}
          />
        </div>

        {/* Tags */}
        <div style={{ marginBottom: 16 }}>
          <div style={SECTION_LABEL}>Tags</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
            {tags.map(tag => (
              <TagChip key={tag.id} tag={tag} onRemove={() => removeTag(tag)} />
            ))}
            <TagPicker selectedTags={tags} onAdd={addTag} onRemove={removeTag} />
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid var(--wdp-border)', margin: '4px 0 16px' }} />

        {/* Subtasks */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={SECTION_LABEL}>
              Subtasks{total > 0 ? ` · ${done}/${total}` : ''}
            </div>
          </div>

          {/* Progress bar */}
          {total > 0 && (
            <div style={{ height: 3, borderRadius: 2, background: 'var(--wdp-border)', marginBottom: 10, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(done / total) * 100}%`, background: '#27AE60', borderRadius: 2, transition: 'width 0.25s ease' }} />
            </div>
          )}

          {/* Subtask list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {subtasks.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '5px 6px', borderRadius: 6, background: 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--wdp-surface)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Checkbox */}
                <button
                  onClick={() => toggleSubtask(s)}
                  style={{
                    flexShrink: 0, width: 16, height: 16, marginTop: 1, borderRadius: 4,
                    border: `1.5px solid ${s.completed ? '#27AE60' : 'var(--wdp-border)'}`,
                    background: s.completed ? '#27AE60' : 'transparent',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: 0, transition: 'all 0.12s',
                  }}
                >
                  {s.completed && <Check size={9} strokeWidth={3} color="#fff" />}
                </button>
                {/* Title */}
                <span style={{
                  flex: 1, fontSize: 12, lineHeight: 1.5,
                  color: s.completed ? 'var(--wdp-ink-dim)' : 'var(--wdp-ink)',
                  textDecoration: s.completed ? 'line-through' : 'none',
                }}>
                  {s.title}
                </span>
                {/* Delete */}
                <button
                  onClick={() => deleteSubtask(s.id)}
                  style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--wdp-ink-dim)', padding: '1px 2px', opacity: 0, transition: 'opacity 0.1s' }}
                  className="subtask-delete-btn"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>

          {/* Add subtask input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, border: '1.5px dashed var(--wdp-border)', flexShrink: 0 }} />
            <input
              ref={subtaskInputRef}
              value={newSubtask}
              onChange={e => setNewSubtask(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubtask() } }}
              placeholder="Add subtask…"
              style={{
                flex: 1, fontFamily: FONT, fontSize: 12, background: 'transparent',
                border: 'none', outline: 'none', color: 'var(--wdp-ink)',
              }}
            />
            {newSubtask.trim() && (
              <button
                onClick={addSubtask}
                disabled={subtaskAdding}
                style={{ flexShrink: 0, padding: '2px 7px', borderRadius: 5, border: 'none', background: 'var(--wdp-neon, #D7FF10)', fontFamily: FONT, fontSize: 10, fontWeight: 700, color: '#000', cursor: 'pointer' }}
              >
                Add
              </button>
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid var(--wdp-border)', margin: '4px 0 16px' }} />

        {/* Description */}
        {task.description && (
          <div style={{ marginBottom: 14 }}>
            <div style={SECTION_LABEL}>Description</div>
            <div style={{ fontSize: 12, color: 'var(--wdp-ink)', lineHeight: 1.6 }}>{task.description}</div>
          </div>
        )}

        {/* Notes */}
        <div style={{ marginBottom: 14 }}>
          <div style={SECTION_LABEL}>Notes</div>
          <textarea
            value={localNotes}
            onChange={e => saveNotes(e.target.value)}
            placeholder="Add a note…"
            rows={4}
            style={{
              width: '100%', fontFamily: FONT, fontSize: 12, color: 'var(--wdp-ink)',
              background: 'var(--wdp-surface)', border: '1px solid var(--wdp-border)',
              borderRadius: 6, padding: '8px 10px', resize: 'vertical', outline: 'none',
              lineHeight: 1.6,
            }}
          />
        </div>

      </div>

      {/* Footer — show delete-on-hover for subtasks via CSS */}
      <style>{`.subtask-delete-btn { opacity: 0 } div:hover > .subtask-delete-btn { opacity: 1 }`}</style>
    </div>
  )
}

export default function DocsPage() {
  const router = useRouter()
  const [docs, setDocs] = useState<PlanningDoc[]>([])
  const [activeDoc, setActiveDoc] = useState<PlanningDoc | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [saving, setSaving] = useState(false)
  const [taskPickerOpen, setTaskPickerOpen] = useState(false)
  const [taskSearch, setTaskSearch] = useState('')
  const [projectPickerOpen, setProjectPickerOpen] = useState(false)
  const [formatState, setFormatState] = useState({
    bold: false, italic: false, underline: false, strikethrough: false,
    superscript: false, subscript: false, blockTag: 'p', align: 'left',
  })
  const [colorPicker, setColorPicker] = useState<'text' | 'highlight' | null>(null)
  const [linkDialog, setLinkDialog] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [fontSize, setFontSize] = useState('14')
  const [fontFamily, setFontFamily] = useState('sans')
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 })
  const [taskPanel, setTaskPanel] = useState<FullTask | null>(null)
  const [taskPanelSaving, setTaskPanelSaving] = useState(false)
  const editorRef       = useRef<HTMLDivElement>(null)
  const saveTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeDocRef    = useRef<PlanningDoc | null>(null)
  const savedRangeRef   = useRef<Range | null>(null)   // saved selection when editor blurs
  activeDocRef.current  = activeDoc

  // ── Save / restore selection across toolbar interactions ──────────────────
  function saveSelection() {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange()
    }
  }

  function restoreSelection() {
    const saved = savedRangeRef.current
    if (!saved) return
    editorRef.current?.focus()
    const sel = window.getSelection()
    if (sel) { sel.removeAllRanges(); sel.addRange(saved) }
  }

  // Close color pickers / link dialog on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('[data-toolbar-popup]')) {
        setColorPicker(null)
        setLinkDialog(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  // ── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/planning-docs').then(r => r.json()).then((d: { docs: PlanningDoc[] }) => setDocs(d.docs ?? [])).catch(() => {})
    fetch('/api/tasks').then(r => r.json()).then((d: Task[] | { tasks?: Task[] }) => {
      setTasks(Array.isArray(d) ? d : (d.tasks ?? []))
    }).catch(() => {})
    fetch('/api/projects').then(r => r.json()).then((d: Project[] | { projects?: Project[] }) => {
      setProjects(Array.isArray(d) ? d : (d.projects ?? []))
    }).catch(() => {})
  }, [])

  // ── Set innerHTML when active doc changes ──────────────────────────────────
  useEffect(() => {
    if (editorRef.current && activeDoc) {
      editorRef.current.innerHTML = activeDoc.body || ''
    }
  }, [activeDoc?.id]) // only on ID change (not every body update)

  // ── Auto-save ──────────────────────────────────────────────────────────────
  const scheduleSave = useCallback((doc: PlanningDoc, htmlBody: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true)
      await fetch(`/api/planning-docs/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: doc.title, body: htmlBody, category: doc.category, project_id: doc.project_id ?? null }),
      })
      setSaving(false)
      setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, excerpt: htmlBody.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 100) } : d))
    }, 800)
  }, [])

  function handleEditorInput() {
    const doc = activeDocRef.current
    if (!doc || !editorRef.current) return
    const html = editorRef.current.innerHTML
    scheduleSave(doc, html)
  }

  function updateDocMeta(patch: Partial<PlanningDoc>) {
    const doc = activeDocRef.current
    if (!doc) return
    const updated = { ...doc, ...patch }
    setActiveDoc(updated)
    const html = editorRef.current?.innerHTML ?? updated.body
    scheduleSave(updated, html)
  }

  // ── Polling format state ───────────────────────────────────────────────────
  function pollFormatState() {
    const bold        = document.queryCommandState('bold')
    const italic      = document.queryCommandState('italic')
    const underline   = document.queryCommandState('underline')
    const strikethrough = document.queryCommandState('strikeThrough')
    const superscript = document.queryCommandState('superscript')
    const subscript   = document.queryCommandState('subscript')
    const block       = document.queryCommandValue('formatBlock').toLowerCase() || 'p'
    const alignLeft   = document.queryCommandState('justifyLeft')
    const alignCenter = document.queryCommandState('justifyCenter')
    const alignRight  = document.queryCommandState('justifyRight')
    const alignFull   = document.queryCommandState('justifyFull')
    const align = alignFull ? 'justify' : alignRight ? 'right' : alignCenter ? 'center' : 'left'
    setFormatState({ bold, italic, underline, strikethrough, superscript, subscript, blockTag: block, align })

    // Try to read font size from selection
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const el = sel.getRangeAt(0).startContainer.parentElement
      if (el) {
        const computed = window.getComputedStyle(el)
        const px = parseFloat(computed.fontSize)
        if (!isNaN(px)) setFontSize(String(Math.round(px)))
      }
    }
  }

  // ── Formatting commands ────────────────────────────────────────────────────
  function execFmt(cmd: string, value?: string) {
    // If editor doesn't have focus (user clicked toolbar), restore saved selection first
    if (document.activeElement !== editorRef.current) restoreSelection()
    document.execCommand(cmd, false, value)
    editorRef.current?.focus()
    pollFormatState()
    if (activeDocRef.current && editorRef.current) scheduleSave(activeDocRef.current, editorRef.current.innerHTML)
  }

  function setBlock(tag: string) {
    const current = document.queryCommandValue('formatBlock').toLowerCase()
    execFmt('formatBlock', current === tag ? 'p' : tag)
  }

  function insertDivider() {
    execFmt('insertHorizontalRule')
  }

  // ── Apply span style to selection (font-size, font-family) ─────────────────
  function applySpanStyle(property: string, value: string) {
    const editor = editorRef.current
    if (!editor) return
    // Always restore the selection we saved on blur before touching the DOM
    restoreSelection()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (range.collapsed) return
    try {
      const fragment = range.extractContents()
      const span = document.createElement('span')
      span.style.setProperty(property, value)
      span.appendChild(fragment)
      range.insertNode(span)
      sel.removeAllRanges()
      const newRange = document.createRange()
      newRange.selectNodeContents(span)
      sel.addRange(newRange)
      savedRangeRef.current = newRange.cloneRange()
    } catch {
      // selection spanned elements — fall back to execCommand with styleWithCSS
      document.execCommand('styleWithCSS', false, 'true')
      if (property === 'font-size') document.execCommand('fontSize', false, '4')
      if (property === 'font-family') document.execCommand('fontName', false, value)
    }
    editor.focus()
    if (activeDocRef.current) scheduleSave(activeDocRef.current, editor.innerHTML)
  }

  // ── Insert hyperlink ───────────────────────────────────────────────────────
  function confirmLink() {
    const url = linkUrl.trim()
    if (!url) return
    const fullUrl = url.startsWith('http') ? url : `https://${url}`
    execFmt('createLink', fullUrl)
    // Make link open in new tab
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const anchor = sel.getRangeAt(0).startContainer.parentElement?.closest('a') as HTMLAnchorElement | null
      if (anchor) { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer' }
    }
    setLinkDialog(false)
    setLinkUrl('')
    if (activeDocRef.current && editorRef.current) scheduleSave(activeDocRef.current, editorRef.current.innerHTML)
  }

  // ── Insert checklist ───────────────────────────────────────────────────────
  function insertChecklist() {
    execFmt('insertHTML', '<ul class="wdp-checklist"><li><span class="wdp-cb" contenteditable="false" data-checked="false">☐</span>&nbsp;</li></ul>')
  }

  // ── Apply font size ────────────────────────────────────────────────────────
  function applyFontSize(size: string) {
    setFontSize(size)
    applySpanStyle('font-size', `${size}px`)
  }

  // ── Apply font family ──────────────────────────────────────────────────────
  const FONT_FAMILIES: Record<string, string> = {
    sans:  "'Jost', system-ui, sans-serif",
    serif: "'Cormorant Garamond', Georgia, serif",
    mono:  "'SF Mono', 'Fira Code', Consolas, monospace",
  }
  function applyFontFamily(key: string) {
    setFontFamily(key)
    applySpanStyle('font-family', FONT_FAMILIES[key])
  }

  function insertTaskLink(task: Task) {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      range.deleteContents()
      // Insert chip as non-editable span
      const tmp = document.createElement('span')
      tmp.innerHTML = taskChipHtml(task) + '&#8203;' // zero-width space after chip
      const chip = tmp.firstChild!
      const zwsp = tmp.lastChild!
      range.insertNode(zwsp)
      range.insertNode(chip)
      range.setStartAfter(zwsp)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
    }
    setTaskPickerOpen(false)
    // Save the new HTML
    setTimeout(() => {
      if (activeDocRef.current && editorRef.current) {
        scheduleSave(activeDocRef.current, editorRef.current.innerHTML)
      }
    }, 0)
  }

  // ── New / load doc ─────────────────────────────────────────────────────────
  async function newDoc() {
    const res = await fetch('/api/planning-docs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Untitled', body: '', category: 'planning' }),
    })
    const d = await res.json() as { doc: PlanningDoc }
    const full = { ...d.doc, body: '' }
    setDocs(prev => [full, ...prev])
    setActiveDoc(full)
    setTimeout(() => { editorRef.current?.focus() }, 80)
  }

  async function loadDoc(doc: PlanningDoc) {
    const res = await fetch(`/api/planning-docs/${doc.id}`)
    const d = await res.json() as { doc: PlanningDoc }
    const rawBody = d.doc.body ?? ''
    // Convert legacy markdown to HTML if needed
    const htmlBody = rawBody.includes('<') ? rawBody : markdownToHtml(rawBody)
    setActiveDoc({ ...d.doc, body: htmlBody })
  }

  async function deleteDoc(id: number) {
    if (!confirm('Delete this doc?')) return
    await fetch(`/api/planning-docs/${id}`, { method: 'DELETE' })
    setDocs(prev => prev.filter(d => d.id !== id))
    if (activeDocRef.current?.id === id) setActiveDoc(null)
  }

  const filteredTasks = tasks.filter(t =>
    t.status !== 'done' && t.title.toLowerCase().includes(taskSearch.toLowerCase())
  )

  const groupedDocs: Record<string, PlanningDoc[]> = {}
  for (const d of docs) {
    if (!groupedDocs[d.category]) groupedDocs[d.category] = []
    groupedDocs[d.category].push(d)
  }

  const activeProject = projects.find(p => p.id === activeDoc?.project_id)

  function sendToRecipeLab() {
    const sel = window.getSelection()
    let text = ''
    if (sel && sel.toString().trim()) {
      text = sel.toString().trim()
    } else if (editorRef.current) {
      text = editorRef.current.innerText.trim()
    }
    if (!text) return
    router.push(`/recipes?idea=${encodeURIComponent(text)}`)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--wdp-ground)', fontFamily: FONT, overflow: 'hidden' }}>

      {/* ── Global editor styles ─────────────────────────────────────── */}
      <style>{`
        .wdp-editor { outline: none; }
        .wdp-editor h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 30px; font-weight: 400; margin: 26px 0 8px; letter-spacing: -0.02em; }
        .wdp-editor h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 22px; font-weight: 400; margin: 22px 0 6px; }
        .wdp-editor h3 { font-family: 'Jost', system-ui, sans-serif; font-size: 15px; font-weight: 700; margin: 18px 0 5px; letter-spacing: 0.01em; }
        .wdp-editor h4 { font-family: 'Jost', system-ui, sans-serif; font-size: 13px; font-weight: 700; margin: 14px 0 4px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--wdp-ink-mid); }
        .wdp-editor p  { margin: 0 0 8px; }
        .wdp-editor ul { list-style-type: disc; padding-left: 22px; margin: 4px 0 10px; }
        .wdp-editor ol { list-style-type: decimal; padding-left: 22px; margin: 4px 0 10px; }
        .wdp-editor li { margin: 4px 0; display: list-item; }
        .wdp-editor hr { border: none; border-top: 1px solid var(--wdp-border); margin: 20px 0; }
        .wdp-editor b, .wdp-editor strong { font-weight: 700 !important; }
        .wdp-editor i, .wdp-editor em, .wdp-editor span[style*="italic"] { font-style: italic !important; }
        .wdp-editor u { text-decoration: underline; }
        .wdp-editor s, .wdp-editor strike { text-decoration: line-through; }
        .wdp-editor sup { font-size: 0.72em; vertical-align: super; line-height: 0; }
        .wdp-editor sub { font-size: 0.72em; vertical-align: sub; line-height: 0; }
        .wdp-editor blockquote {
          border-left: 3px solid var(--wdp-accent, #C27A54);
          padding: 4px 0 4px 16px; margin: 12px 0;
          color: var(--wdp-ink-mid); font-style: italic;
        }
        .wdp-editor pre {
          background: var(--wdp-surface2, #F2EDE5); border-radius: 8px;
          padding: 12px 16px; font-family: 'SF Mono', 'Fira Code', Consolas, monospace;
          font-size: 12.5px; line-height: 1.65; overflow-x: auto; margin: 12px 0;
          border: 1px solid var(--wdp-border); white-space: pre; tab-size: 2;
        }
        .wdp-editor code {
          background: var(--wdp-surface2, #F2EDE5); padding: 2px 5px;
          border-radius: 4px; font-family: 'SF Mono', 'Fira Code', Consolas, monospace;
          font-size: 0.87em; border: 1px solid var(--wdp-border);
        }
        .wdp-editor a { color: var(--wdp-accent, #C27A54); text-decoration: underline; cursor: pointer; }
        .wdp-editor a:hover { opacity: 0.75; }
        .wdp-checklist { list-style: none !important; padding-left: 4px !important; }
        .wdp-checklist li { display: flex !important; align-items: baseline; gap: 7px; }
        .wdp-cb { cursor: pointer; user-select: none; font-size: 14px; line-height: 1; color: var(--wdp-ink-mid); transition: color 0.1s; }
        .wdp-cb[data-checked="true"] { color: var(--wdp-accent, #C27A54); }
        .wdp-task-chip {
          display: inline-flex; align-items: center; gap: 4px;
          background: rgba(215,255,16,0.12); border: 1px solid rgba(215,255,16,0.35);
          border-radius: 5px; padding: 2px 8px;
          font-size: 11px; font-family: 'Jost', system-ui, sans-serif;
          color: #8AA800; user-select: none; cursor: pointer;
          vertical-align: middle; margin: 0 2px;
          pointer-events: auto; transition: background 0.1s;
        }
        .wdp-task-chip:hover { background: rgba(215,255,16,0.22); border-color: rgba(215,255,16,0.55); }
        .wdp-editor:empty:before { content: attr(data-placeholder); color: var(--wdp-ink-dim); font-style: italic; }
        .wdp-color-swatch { width: 18px; height: 18px; border-radius: 3px; cursor: pointer; border: 1.5px solid transparent; transition: transform 0.1s, border-color 0.1s; flex-shrink: 0; }
        .wdp-color-swatch:hover { transform: scale(1.15); border-color: rgba(0,0,0,0.2); }
        .wdp-toolbar-sep { width: 1px; height: 20px; background: var(--wdp-border); margin: 0 3px; flex-shrink: 0; }
      `}</style>

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid var(--wdp-border)', display: 'flex', flexDirection: 'column', background: 'var(--wdp-panel-bg, #F7F7F5)' }}>
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--wdp-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Link href="/chat" style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--wdp-ink-mid)', textDecoration: 'none', fontSize: 11 }}>
              <ChevronLeft size={13} /> Back
            </Link>
            <button onClick={newDoc} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 6, background: 'var(--wdp-neon, #D7FF10)', border: 'none', cursor: 'pointer', fontFamily: FONT, fontSize: 11, fontWeight: 700, color: '#000' }}>
              <Plus size={11} /> New
            </button>
          </div>
          <div style={{ fontFamily: FONT, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)' }}>Planning Docs</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>
          {Object.keys(groupedDocs).length === 0 && (
            <div style={{ padding: '20px 12px', fontSize: 12, color: 'var(--wdp-ink-mid)', textAlign: 'center' }}>No docs yet.<br />Click New to start.</div>
          )}
          {CATEGORIES.map(cat => {
            const catDocs = groupedDocs[cat.value]
            if (!catDocs?.length) return null
            return (
              <div key={cat.value} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', marginBottom: 4 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
                  <span style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)' }}>{cat.label}</span>
                </div>
                {catDocs.map(doc => (
                  <button key={doc.id} onClick={() => loadDoc(doc)}
                    style={{ width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 7, background: activeDoc?.id === doc.id ? 'var(--wdp-surface)' : 'transparent', border: activeDoc?.id === doc.id ? '1px solid var(--wdp-border)' : '1px solid transparent', cursor: 'pointer', marginBottom: 2 }}>
                    <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: 'var(--wdp-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.title || 'Untitled'}</div>
                    {doc.excerpt && <div style={{ fontFamily: FONT, fontSize: 10, color: 'var(--wdp-ink-mid)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.excerpt.replace(/<[^>]+>/g, '').slice(0, 60)}</div>}
                    <div style={{ fontFamily: FONT, fontSize: 9, color: 'var(--wdp-ink-dim)', marginTop: 3 }}>{new Date(doc.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Main editor area ─────────────────────────────────────────── */}
      {activeDoc ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'row', minWidth: 0, overflow: 'hidden' }}>
        {/* Editor column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* Title bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', borderBottom: '1px solid var(--wdp-border)', background: 'var(--wdp-ground)', flexShrink: 0 }}>
            <input value={activeDoc.title} onChange={e => updateDocMeta({ title: e.target.value })} placeholder="Untitled"
              style={{ flex: 1, fontFamily: SERIF, fontSize: 20, fontWeight: 400, background: 'transparent', border: 'none', outline: 'none', color: 'var(--wdp-ink)' }} />

            {/* Project picker */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button onClick={() => setProjectPickerOpen(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 6, border: '1px solid var(--wdp-border)', background: 'var(--wdp-surface)', cursor: 'pointer', fontFamily: FONT, fontSize: 11, color: activeProject ? 'var(--wdp-ink)' : 'var(--wdp-ink-mid)' }}>
                <FolderOpen size={11} />
                {activeProject ? activeProject.name : 'Add to project'}
                <ChevronDown size={10} />
              </button>
              {projectPickerOpen && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 50, background: 'var(--wdp-ground)', border: '1px solid var(--wdp-border)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.14)', width: 220, overflow: 'hidden' }}>
                  <button onClick={() => { updateDocMeta({ project_id: null }); setProjectPickerOpen(false) }}
                    style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FONT, fontSize: 12, color: 'var(--wdp-ink-mid)', borderBottom: '1px solid var(--wdp-border)' }}>
                    — No project
                  </button>
                  {projects.filter(p => p.status === 'active').map(p => (
                    <button key={p.id} onClick={() => { updateDocMeta({ project_id: p.id }); setProjectPickerOpen(false) }}
                      style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: activeDoc.project_id === p.id ? 'var(--wdp-surface)' : 'transparent', border: 'none', cursor: 'pointer', fontFamily: FONT, fontSize: 12, color: 'var(--wdp-ink)', borderBottom: '1px solid var(--wdp-border)' }}>
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Category */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <Tag size={11} style={{ color: 'var(--wdp-ink-mid)' }} />
              <select value={activeDoc.category} onChange={e => updateDocMeta({ category: e.target.value })}
                style={{ fontFamily: FONT, fontSize: 11, background: 'var(--wdp-surface)', border: '1px solid var(--wdp-border)', borderRadius: 5, padding: '3px 7px', color: catMeta(activeDoc.category).color, cursor: 'pointer' }}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            {/* Save state */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: FONT, fontSize: 10, color: 'var(--wdp-ink-mid)', flexShrink: 0 }}>
              <Save size={10} style={{ opacity: saving ? 1 : 0.3 }} />
              {saving ? 'Saving…' : 'Saved'}
            </div>
            <button onClick={() => deleteDoc(activeDoc.id)}
              style={{ display: 'flex', alignItems: 'center', padding: '4px 6px', borderRadius: 5, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--wdp-ink-mid)', opacity: 0.45 }}>
              <Trash2 size={13} />
            </button>
          </div>

          {/* Formatting toolbar */}
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 1, padding: '4px 12px', borderBottom: '1px solid var(--wdp-border)', background: 'var(--wdp-panel-bg, #F7F7F5)', flexShrink: 0, overflowX: 'auto', overflowY: 'visible' }}
          >
            {/* Block style */}
            <select
              onMouseDown={() => saveSelection()}
              value={formatState.blockTag}
              onChange={e => { setBlock(e.target.value); e.currentTarget.blur() }}
              style={{ fontFamily: FONT, fontSize: 11, background: 'var(--wdp-surface)', border: '1px solid var(--wdp-border)', borderRadius: 5, padding: '3px 5px', cursor: 'pointer', color: 'var(--wdp-ink)', minWidth: 110, flexShrink: 0 }}
            >
              <option value="p">Paragraph</option>
              <option value="h1">Heading 1</option>
              <option value="h2">Heading 2</option>
              <option value="h3">Heading 3</option>
              <option value="h4">Heading 4</option>
              <option value="blockquote">Quote</option>
              <option value="pre">Code block</option>
            </select>

            {/* Font family */}
            <select
              onMouseDown={() => saveSelection()}
              value={fontFamily}
              onChange={e => applyFontFamily(e.target.value)}
              style={{ fontFamily: FONT, fontSize: 11, background: 'var(--wdp-surface)', border: '1px solid var(--wdp-border)', borderRadius: 5, padding: '3px 5px', cursor: 'pointer', color: 'var(--wdp-ink)', minWidth: 72, marginLeft: 4, flexShrink: 0 }}
            >
              <option value="sans">Sans</option>
              <option value="serif">Serif</option>
              <option value="mono">Mono</option>
            </select>

            {/* Font size */}
            <select
              onMouseDown={() => saveSelection()}
              value={fontSize}
              onChange={e => applyFontSize(e.target.value)}
              style={{ fontFamily: FONT, fontSize: 11, background: 'var(--wdp-surface)', border: '1px solid var(--wdp-border)', borderRadius: 5, padding: '3px 4px', cursor: 'pointer', color: 'var(--wdp-ink)', minWidth: 52, marginLeft: 4, flexShrink: 0 }}
            >
              {['8','9','10','11','12','14','16','18','20','22','24','26','28','36','48','72'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <div className="wdp-toolbar-sep" style={{ marginLeft: 6 }} />

            {/* Bold / Italic / Underline / Strikethrough */}
            <TBtn icon={Bold}          label="Bold (⌘B)"         active={formatState.bold}          onAction={() => execFmt('bold')} />
            <TBtn icon={Italic}        label="Italic (⌘I)"       active={formatState.italic}        onAction={() => execFmt('italic')} />
            <TBtn icon={Underline}     label="Underline (⌘U)"    active={formatState.underline}     onAction={() => execFmt('underline')} />
            <TBtn icon={Strikethrough} label="Strikethrough"      active={formatState.strikethrough} onAction={() => execFmt('strikeThrough')} />

            <div className="wdp-toolbar-sep" />

            {/* Text color */}
            <button
              data-toolbar-popup
              title="Text color"
              onMouseDown={e => e.preventDefault()}
              onClick={e => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setPopupPos({ x: r.left, y: r.bottom + 4 }); saveSelection(); setColorPicker(v => v === 'text' ? null : 'text') }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 5, border: 'none', cursor: 'pointer', background: colorPicker === 'text' ? 'var(--wdp-surface)' : 'transparent', gap: 1 }}
            >
              <Baseline size={12} strokeWidth={1.75} style={{ color: 'var(--wdp-ink-mid)' }} />
              <div style={{ width: 14, height: 3, borderRadius: 1, background: 'var(--wdp-ink)', marginTop: 1 }} />
            </button>

            {/* Highlight color */}
            <button
              data-toolbar-popup
              title="Highlight color"
              onMouseDown={e => e.preventDefault()}
              onClick={e => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setPopupPos({ x: r.left, y: r.bottom + 4 }); saveSelection(); setColorPicker(v => v === 'highlight' ? null : 'highlight') }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 5, border: 'none', cursor: 'pointer', background: colorPicker === 'highlight' ? 'var(--wdp-surface)' : 'transparent', gap: 1 }}
            >
              <Highlighter size={12} strokeWidth={1.75} style={{ color: 'var(--wdp-ink-mid)' }} />
              <div style={{ width: 14, height: 3, borderRadius: 1, background: '#F1C40F', marginTop: 1 }} />
            </button>

            <div className="wdp-toolbar-sep" />

            {/* Alignment */}
            <TBtn icon={AlignLeft}    label="Align left"    active={formatState.align === 'left'}    onAction={() => execFmt('justifyLeft')} />
            <TBtn icon={AlignCenter}  label="Align center"  active={formatState.align === 'center'}  onAction={() => execFmt('justifyCenter')} />
            <TBtn icon={AlignRight}   label="Align right"   active={formatState.align === 'right'}   onAction={() => execFmt('justifyRight')} />
            <TBtn icon={AlignJustify} label="Justify"       active={formatState.align === 'justify'} onAction={() => execFmt('justifyFull')} />

            <div className="wdp-toolbar-sep" />

            {/* Superscript / Subscript */}
            <TBtn icon={Superscript} label="Superscript" active={formatState.superscript} onAction={() => execFmt('superscript')} />
            <TBtn icon={Subscript}   label="Subscript"   active={formatState.subscript}   onAction={() => execFmt('subscript')} />

            <div className="wdp-toolbar-sep" />

            {/* Link */}
            <button
              data-toolbar-popup
              title="Insert link (⌘K)"
              onMouseDown={e => e.preventDefault()}
              onClick={e => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); const l = Math.min(r.left, window.innerWidth - 300); setPopupPos({ x: l, y: r.bottom + 4 }); saveSelection(); setLinkDialog(v => !v); setLinkUrl('') }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 5, border: 'none', cursor: 'pointer', background: linkDialog ? 'var(--wdp-surface)' : 'transparent', color: 'var(--wdp-ink-mid)' }}
              onMouseEnter={e => { if (!linkDialog) e.currentTarget.style.background = 'var(--wdp-surface)' }}
              onMouseLeave={e => { if (!linkDialog) e.currentTarget.style.background = 'transparent' }}
            >
              <LinkIcon size={14} strokeWidth={1.75} />
            </button>

            <div className="wdp-toolbar-sep" />

            {/* Lists + checklist */}
            <TBtn icon={List}        label="Bullet list"    onAction={() => execFmt('insertUnorderedList')} />
            <TBtn icon={ListOrdered} label="Numbered list"  onAction={() => execFmt('insertOrderedList')} />
            <TBtn icon={ListTodo}    label="Checklist"      onAction={insertChecklist} />
            <TBtn icon={IndentDecrease} label="Outdent (⌘[)"  onAction={() => execFmt('outdent')} />
            <TBtn icon={IndentIncrease} label="Indent (⌘])"   onAction={() => execFmt('indent')} />

            <div className="wdp-toolbar-sep" />

            {/* Divider + clear */}
            <TBtn icon={Minus}   label="Horizontal rule"  onAction={insertDivider} />
            <TBtn icon={Type}    label="Clear formatting"  onAction={() => execFmt('removeFormat')} />

            {/* → Recipe Lab — far right */}
            <div style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              {activeDoc && (
                <button
                  onMouseDown={e => e.preventDefault()}
                  onClick={sendToRecipeLab}
                  title="Send selected text (or whole doc) to Recipe Lab"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 6, border: '1px solid rgba(194,122,84,0.35)', background: 'rgba(194,122,84,0.08)', cursor: 'pointer', fontFamily: FONT, fontSize: 11, fontWeight: 600, color: '#C27A54', whiteSpace: 'nowrap' }}
                >
                  <ArrowRight size={11} /> Recipe Lab
                </button>
              )}

            {/* Task link picker */}
            <div style={{ position: 'relative', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
              <button onMouseDown={e => e.preventDefault()} onClick={() => { setTaskPickerOpen(v => !v); setTaskSearch('') }}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 6, border: '1px solid var(--wdp-border)', background: 'var(--wdp-surface)', cursor: 'pointer', fontFamily: FONT, fontSize: 11, color: 'var(--wdp-ink-mid)', whiteSpace: 'nowrap' }}>
                <Link2 size={11} /> Link task
              </button>
              {taskPickerOpen && (
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 100, background: 'var(--wdp-ground)', border: '1px solid var(--wdp-border)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', width: 280, maxHeight: 300, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--wdp-border)' }}>
                    <input autoFocus value={taskSearch} onChange={e => setTaskSearch(e.target.value)} placeholder="Search tasks…"
                      style={{ width: '100%', fontFamily: FONT, fontSize: 12, background: 'transparent', border: 'none', outline: 'none', color: 'var(--wdp-ink)' }} />
                  </div>
                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    {filteredTasks.slice(0, 12).map(task => (
                      <button key={task.id} onMouseDown={e => e.preventDefault()} onClick={() => insertTaskLink(task)}
                        style={{ width: '100%', textAlign: 'left', padding: '7px 12px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FONT, fontSize: 12, color: 'var(--wdp-ink)', borderBottom: '1px solid var(--wdp-border)' }}>
                        <div style={{ fontWeight: 600 }}>{task.title}</div>
                        <div style={{ fontSize: 10, color: 'var(--wdp-ink-mid)', marginTop: 2, textTransform: 'capitalize' }}>{task.priority} · {task.status}</div>
                      </button>
                    ))}
                    {filteredTasks.length === 0 && <div style={{ padding: '12px', fontSize: 11, color: 'var(--wdp-ink-mid)', textAlign: 'center' }}>No open tasks</div>}
                  </div>
                </div>
              )}
            </div>
            </div>{/* end far-right flex wrapper */}
          </div>

          {/* Color / highlight / link popups — fixed to avoid overflow clipping */}
          {colorPicker === 'text' && (
            <div data-toolbar-popup style={{ position: 'fixed', top: popupPos.y, left: popupPos.x, zIndex: 200, background: 'var(--wdp-surface)', border: '1px solid var(--wdp-border)', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.14)', padding: 10, width: 190 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)', marginBottom: 7 }}>Text Color</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {['#2C2C2C','#434343','#666666','#999999','#cccccc','#ffffff',
                  '#C27A54','#E8522A','#E74C3C','#E67E22','#F39C12','#F1C40F',
                  '#27AE60','#16A085','#2980B9','#1877F2','#8E44AD','#BDC3C7',
                  '#D7FF10','#80E6A6','#78B7C5','#F8AFA8','#F0D77A','#9BAE9A'].map(c => (
                  <div key={c} className="wdp-color-swatch"
                    style={{ background: c, border: c === '#ffffff' ? '1.5px solid var(--wdp-border)' : '1.5px solid transparent' }}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { execFmt('foreColor', c); setColorPicker(null) }} />
                ))}
              </div>
              <button onMouseDown={e => e.preventDefault()} onClick={() => { execFmt('foreColor', 'inherit'); setColorPicker(null) }}
                style={{ marginTop: 8, width: '100%', padding: '4px 0', background: 'var(--wdp-surface2)', border: '1px solid var(--wdp-border)', borderRadius: 5, fontFamily: FONT, fontSize: 10, color: 'var(--wdp-ink-mid)', cursor: 'pointer' }}>
                Reset color
              </button>
            </div>
          )}
          {colorPicker === 'highlight' && (
            <div data-toolbar-popup style={{ position: 'fixed', top: popupPos.y, left: popupPos.x, zIndex: 200, background: 'var(--wdp-surface)', border: '1px solid var(--wdp-border)', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.14)', padding: 10, width: 190 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--wdp-ink-mid)', marginBottom: 7 }}>Highlight</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {['#ffff00','#00ff00','#00ffff','#ff9900','#ff00ff','#ff0000',
                  '#ffe599','#b6d7a8','#a2c4c9','#9fc5e8','#b4a7d6','#ea9999',
                  '#fce5cd','#d9ead3','#d0e0e3','#cfe2f3','#d9d2e9','#fff2cc',
                  '#D7FF10','#f4cccc','#c9daf8'].map(c => (
                  <div key={c} className="wdp-color-swatch" style={{ background: c }}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { execFmt('hiliteColor', c); setColorPicker(null) }} />
                ))}
              </div>
              <button onMouseDown={e => e.preventDefault()} onClick={() => { execFmt('hiliteColor', 'transparent'); setColorPicker(null) }}
                style={{ marginTop: 8, width: '100%', padding: '4px 0', background: 'var(--wdp-surface2)', border: '1px solid var(--wdp-border)', borderRadius: 5, fontFamily: FONT, fontSize: 10, color: 'var(--wdp-ink-mid)', cursor: 'pointer' }}>
                Remove highlight
              </button>
            </div>
          )}
          {linkDialog && (
            <div data-toolbar-popup style={{ position: 'fixed', top: popupPos.y, left: popupPos.x, zIndex: 200, background: 'var(--wdp-surface)', border: '1px solid var(--wdp-border)', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.14)', padding: '8px 10px', width: 280, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                autoFocus
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmLink() } if (e.key === 'Escape') setLinkDialog(false) }}
                placeholder="https://…"
                style={{ flex: 1, fontFamily: FONT, fontSize: 12, background: 'transparent', border: 'none', outline: 'none', color: 'var(--wdp-ink)' }}
              />
              <button onMouseDown={e => e.preventDefault()} onClick={confirmLink}
                style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--wdp-accent, #C27A54)', fontFamily: FONT, fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer' }}>
                Apply
              </button>
              <button onMouseDown={e => e.preventDefault()} onClick={() => setLinkDialog(false)}
                style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--wdp-ink-dim)', display: 'flex', alignItems: 'center', padding: '2px' }}>
                <X size={13} />
              </button>
            </div>
          )}

          {/* Editor — contenteditable */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div
              ref={editorRef}
              className="wdp-editor"
              contentEditable
              suppressContentEditableWarning
              data-placeholder="Start writing…"
              onInput={handleEditorInput}
              onKeyDown={e => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); execFmt('bold') }
                if ((e.metaKey || e.ctrlKey) && e.key === 'i') { e.preventDefault(); execFmt('italic') }
                if ((e.metaKey || e.ctrlKey) && e.key === 'u') { e.preventDefault(); execFmt('underline') }
                if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setLinkDialog(true); setLinkUrl('') }
                if ((e.metaKey || e.ctrlKey) && e.key === '[') { e.preventDefault(); execFmt('outdent') }
                if ((e.metaKey || e.ctrlKey) && e.key === ']') { e.preventDefault(); execFmt('indent') }
                if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'X') { e.preventDefault(); execFmt('strikeThrough') }
              }}
              onBlur={saveSelection}
              onKeyUp={() => { pollFormatState(); saveSelection() }}
              onMouseUp={e => {
                pollFormatState()
                saveSelection()
                // Close task popover when clicking outside a chip
                // (don't close task panel on editor click — user may want to keep it open)
              }}
              onClick={async e => {
                const target = e.target as HTMLElement
                const chip = target.closest('.wdp-task-chip') as HTMLElement | null
                if (chip) {
                  const taskId = Number(chip.dataset.taskId)
                  const res = await fetch(`/api/tasks/${taskId}`)
                  if (res.ok) {
                    const full = await res.json() as FullTask
                    setTaskPanel(full)
                  }
                }
                // Toggle checklist checkboxes
                const cb = target.closest('.wdp-cb') as HTMLElement | null
                if (cb) {
                  const checked = cb.dataset.checked === 'true'
                  cb.dataset.checked = String(!checked)
                  cb.textContent = !checked ? '☑' : '☐'
                  if (activeDocRef.current && editorRef.current) scheduleSave(activeDocRef.current, editorRef.current.innerHTML)
                }
              }}
              style={{
                minHeight: '100%',
                padding: '32px 60px',
                fontFamily: FONT, fontSize: 14, lineHeight: 1.8,
                color: 'var(--wdp-ink)',
                background: 'var(--wdp-ground)',
              }}
            />
          </div>
        </div>
        {taskPanel && (
          <TaskSidePanel
            task={taskPanel}
            saving={taskPanelSaving}
            onClose={() => setTaskPanel(null)}
            onChange={async (patch) => {
              const next = { ...taskPanel, ...patch }
              setTaskPanel(next as FullTask)
              setTaskPanelSaving(true)
              const res = await fetch(`/api/tasks/${taskPanel.id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patch),
              })
              if (res.ok) setTaskPanel(await res.json() as FullTask)
              setTaskPanelSaving(false)
            }}
          />
        )}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <FileText size={40} style={{ color: 'var(--wdp-ink-dim)', opacity: 0.3 }} />
          <div style={{ fontFamily: SERIF, fontSize: 22, color: 'var(--wdp-ink-mid)' }}>No doc selected</div>
          <div style={{ fontFamily: FONT, fontSize: 13, color: 'var(--wdp-ink-dim)' }}>Choose a doc from the sidebar or create a new one.</div>
          <button onClick={newDoc} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, background: 'var(--wdp-neon, #D7FF10)', border: 'none', cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 700, color: '#000', marginTop: 4 }}>
            <Plus size={14} /> New planning doc
          </button>
        </div>
      )}
    </div>
  )
}

 
