'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, X, Check, Tag, Pencil, Trash2 } from 'lucide-react'
import { Tag as TagType, ProjectColor } from '@/lib/types'
import { cn } from '@/lib/utils'

const COLOR_OPTIONS: { value: ProjectColor; bg: string; label: string }[] = [
  { value: 'sage',       bg: 'bg-sage',       label: 'Sage' },
  { value: 'terracotta', bg: 'bg-terracotta', label: 'Terracotta' },
  { value: 'butter',     bg: 'bg-butter',     label: 'Butter' },
  { value: 'tomato',     bg: 'bg-tomato',     label: 'Tomato' },
  { value: 'blueberry',  bg: 'bg-blueberry',  label: 'Blueberry' },
  { value: 'thyme',      bg: 'bg-thyme',      label: 'Thyme' },
  { value: 'candy',      bg: 'bg-candy',      label: 'Candy' },
  { value: 'citrus',     bg: 'bg-citrus',     label: 'Citrus' },
]

const TAG_BG: Record<string, string> = {
  sage: 'bg-sage-light text-ink-dark', terracotta: 'bg-terracotta-light text-ink-dark',
  butter: 'bg-butter-light text-ink-dark', tomato: 'bg-tomato-light text-ink-dark',
  blueberry: 'bg-blueberry-light text-ink-dark', thyme: 'bg-thyme-light text-ink-dark',
  candy: 'bg-candy-light text-ink-dark', citrus: 'bg-citrus-light text-ink-dark',
}

const TAG_DOT: Record<string, string> = {
  sage: 'bg-sage', terracotta: 'bg-terracotta', butter: 'bg-butter', tomato: 'bg-tomato',
  blueberry: 'bg-blueberry', thyme: 'bg-thyme', candy: 'bg-candy', citrus: 'bg-citrus',
}

function ColorSwatch({ value, selected, onSelect }: { value: ProjectColor; selected: boolean; onSelect: () => void }) {
  const opt = COLOR_OPTIONS.find(c => c.value === value)!
  return (
    <button
      type="button"
      title={opt.label}
      onClick={onSelect}
      className={cn(
        'w-6 h-6 rounded-full cursor-pointer transition-all shrink-0',
        opt.bg,
        selected ? 'ring-2 ring-offset-1 ring-ink-dark scale-110' : 'hover:scale-105'
      )}
    />
  )
}

export function TagChip({ tag, onRemove }: { tag: TagType; onRemove?: () => void }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold',
      TAG_BG[tag.color] ?? 'bg-mushroom text-ink-dark'
    )}
      style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', TAG_DOT[tag.color])} />
      {tag.name}
      {onRemove && (
        <button onClick={onRemove} className="hover:opacity-60 transition-opacity cursor-pointer ml-0.5">
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  )
}

interface TagPickerProps {
  selectedTags: TagType[]
  onAdd: (tag: TagType) => void
  onRemove: (tag: TagType) => void
}

export function TagPicker({ selectedTags, onAdd, onRemove }: TagPickerProps) {
  const [open, setOpen] = useState(false)
  const [allTags, setAllTags] = useState<TagType[]>([])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<ProjectColor>('sage')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState<ProjectColor>('sage')
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/tags').then(r => r.json()).then(setAllTags)
  }, [open])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
        setEditingId(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selectedIds = new Set(selectedTags.map(t => t.id))

  async function createTag() {
    if (!newName.trim()) return
    setSaving(true)
    const res = await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), color: newColor }),
    })
    const tag = await res.json()
    setAllTags(prev => [...prev, tag])
    onAdd(tag)
    setNewName(''); setNewColor('sage'); setCreating(false); setSaving(false)
  }

  function startEdit(tag: TagType) {
    setEditingId(tag.id)
    setEditName(tag.name)
    setEditColor(tag.color)
    setCreating(false)
  }

  async function saveEdit(tag: TagType) {
    if (!editName.trim()) return
    const res = await fetch(`/api/tags/${tag.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim(), color: editColor }),
    })
    const updated = await res.json()
    setAllTags(prev => prev.map(t => t.id === updated.id ? updated : t))
    setEditingId(null)
  }

  async function deleteTag(tag: TagType) {
    await fetch(`/api/tags/${tag.id}`, { method: 'DELETE' })
    setAllTags(prev => prev.filter(t => t.id !== tag.id))
    if (selectedIds.has(tag.id)) onRemove(tag)
    setEditingId(null)
  }

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-ink hover:bg-oatmilk hover:text-ink-dark transition-all cursor-pointer border border-dashed border-mushroom"
        style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
      >
        <Tag className="w-3 h-3" />
        Tags
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-cream border border-mushroom rounded-xl shadow-lg z-20 overflow-hidden">
          {/* Tag list */}
          <div className="p-2 space-y-0.5 max-h-56 overflow-y-auto">
            {allTags.length === 0 && !creating && (
              <p className="text-xs text-ink px-2 py-1" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                No tags yet
              </p>
            )}
            {allTags.map(tag => {
              const selected = selectedIds.has(tag.id)

              if (editingId === tag.id) {
                return (
                  <div key={tag.id} className="p-2 bg-oatmilk rounded-lg space-y-2">
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(tag); if (e.key === 'Escape') setEditingId(null) }}
                      className="w-full px-2 py-1 text-xs bg-white border border-mushroom rounded-lg outline-none focus:ring-1 focus:ring-ink/20 text-ink-dark"
                      style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                    />
                    <div className="flex gap-1.5">
                      {COLOR_OPTIONS.map(c => (
                        <ColorSwatch key={c.value} value={c.value} selected={editColor === c.value} onSelect={() => setEditColor(c.value)} />
                      ))}
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => saveEdit(tag)}
                        disabled={!editName.trim()}
                        className="flex-1 py-1 text-xs bg-ink-dark text-cream rounded-lg font-semibold disabled:opacity-50 cursor-pointer"
                        style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTag(tag)}
                        className="py-1 px-2 text-xs border border-tomato/40 text-tomato rounded-lg cursor-pointer hover:bg-tomato-light transition-colors"
                        style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="flex-1 py-1 text-xs border border-mushroom rounded-lg text-ink cursor-pointer hover:bg-white"
                        style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )
              }

              return (
                <div key={tag.id} className="group/tag flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-oatmilk transition-all">
                  <button
                    type="button"
                    onClick={() => selected ? onRemove(tag) : onAdd(tag)}
                    className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer text-left"
                  >
                    <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', TAG_DOT[tag.color])} />
                    <span className="text-xs text-ink-dark truncate" style={{ fontFamily: "'Jost', system-ui, sans-serif", fontWeight: 500 }}>
                      {tag.name}
                    </span>
                    {selected && <Check className="w-3 h-3 text-ink shrink-0" />}
                  </button>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); startEdit(tag) }}
                    className="opacity-0 group-hover/tag:opacity-100 text-ink/50 hover:text-ink transition-all cursor-pointer shrink-0"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              )
            })}
          </div>

          {/* Create new tag */}
          <div className="border-t border-mushroom">
            {creating ? (
              <div className="p-2 space-y-2">
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') createTag(); if (e.key === 'Escape') setCreating(false) }}
                  placeholder="Tag name"
                  className="w-full px-2 py-1 text-xs bg-oatmilk border border-mushroom rounded-lg outline-none focus:ring-1 focus:ring-ink/20 text-ink-dark"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                />
                <div className="flex gap-1.5">
                  {COLOR_OPTIONS.map(c => (
                    <ColorSwatch key={c.value} value={c.value} selected={newColor === c.value} onSelect={() => setNewColor(c.value)} />
                  ))}
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={createTag}
                    disabled={saving || !newName.trim()}
                    className="flex-1 py-1 text-xs bg-ink-dark text-cream rounded-lg font-semibold disabled:opacity-50 cursor-pointer"
                    style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                  >
                    {saving ? '…' : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreating(false)}
                    className="flex-1 py-1 text-xs border border-mushroom rounded-lg text-ink cursor-pointer hover:bg-oatmilk"
                    style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setCreating(true); setEditingId(null) }}
                className="flex items-center gap-1.5 w-full px-3 py-2 text-xs text-ink hover:bg-oatmilk transition-all cursor-pointer"
                style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
              >
                <Plus className="w-3 h-3" /> New tag
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
