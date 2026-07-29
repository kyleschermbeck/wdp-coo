'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Textarea, Select } from '@/components/ui/Input'
import { TagChip, TagPicker } from '@/components/ui/TagPicker'
import { Project, ProjectColor, ProjectStatus, Tag } from '@/lib/types'
import { cn } from '@/lib/utils'

const colors: { value: ProjectColor; dot: string }[] = [
  { value: 'sage',       dot: 'bg-sage' },
  { value: 'terracotta', dot: 'bg-terracotta' },
  { value: 'butter',     dot: 'bg-butter' },
  { value: 'tomato',     dot: 'bg-tomato' },
  { value: 'blueberry',  dot: 'bg-blueberry' },
  { value: 'thyme',      dot: 'bg-thyme' },
  { value: 'candy',      dot: 'bg-candy' },
  { value: 'citrus',     dot: 'bg-citrus' },
]

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (p: Project) => void
}

export function NewProjectModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<ProjectStatus>('planning')
  const [color, setColor] = useState<ProjectColor>('sage')
  const [dueDate, setDueDate] = useState('')
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function reset() {
    setName(''); setDescription(''); setStatus('planning')
    setColor('sage'); setDueDate(''); setTags([]); setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Project name is required'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, status, color, due_date: dueDate || null }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }

      // Assign any selected tags
      await Promise.all(tags.map(tag =>
        fetch(`/api/projects/${data.id}/tags`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag_id: tag.id }),
        })
      ))

      onCreated({ ...data, tags })
      reset()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose() }} title="New Project">
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="Project Name"
          placeholder="e.g. Q3 Wholesale Push"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error}
          autoFocus
        />

        <Textarea
          label="Description"
          placeholder="What's this project about?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ProjectStatus)}
            options={[
              { value: 'planning', label: 'Planning' },
              { value: 'active',   label: 'Active' },
              { value: 'on_hold',  label: 'On Hold' },
              { value: 'complete', label: 'Complete' },
            ]}
          />
          <Input
            label="Due Date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>

        {/* Color */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-ink-dark uppercase tracking-wide"
            style={{ fontFamily: "'Jost', system-ui, sans-serif", fontSize: '11px', letterSpacing: '0.08em' }}>
            Color
          </label>
          <div className="flex gap-2 flex-wrap">
            {colors.map((c) => (
              <button key={c.value} type="button" onClick={() => setColor(c.value)}
                className={cn('w-7 h-7 rounded-full transition-all cursor-pointer', c.dot,
                  color === c.value ? 'ring-2 ring-offset-2 ring-ink-dark scale-110' : 'hover:scale-110')}
              />
            ))}
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-ink-dark uppercase tracking-wide"
            style={{ fontFamily: "'Jost', system-ui, sans-serif", fontSize: '11px', letterSpacing: '0.08em' }}>
            Tags
          </label>
          <div className="flex items-center gap-1.5 flex-wrap">
            {tags.map(t => (
              <TagChip key={t.id} tag={t} onRemove={() => setTags(prev => prev.filter(x => x.id !== t.id))} />
            ))}
            <TagPicker
              selectedTags={tags}
              onAdd={tag => setTags(prev => [...prev, tag])}
              onRemove={tag => setTags(prev => prev.filter(t => t.id !== tag.id))}
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={() => { reset(); onClose() }}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={loading}>
            {loading ? 'Creating...' : 'Create Project'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
