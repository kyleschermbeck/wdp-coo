'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { BookOpen, Upload, Trash2, FileText, File, ExternalLink, Loader2, X, LayoutGrid } from 'lucide-react'

const FONT = { fontFamily: "'Jost', system-ui, sans-serif" }

interface Doc {
  id: number
  original_name: string
  file_type: string
  file_size: number
  content_text: string | null
  task_id: number | null
  task_title: string | null
  subtask_id: number | null
  subtask_title: string | null
  created_at: string
}

function fileIcon(type: string) {
  if (type.includes('pdf')) return <FileText className="w-4 h-4 text-terracotta/70" />
  if (type.includes('word') || type.includes('docx')) return <File className="w-4 h-4 text-blueberry/70" />
  return <File className="w-4 h-4 text-ink/40" />
}

function fileSize(bytes: number) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function extLabel(type: string, name: string) {
  if (type.includes('pdf') || name.endsWith('.pdf')) return 'PDF'
  if (type.includes('word') || name.endsWith('.docx')) return 'Word'
  if (name.endsWith('.md')) return 'Markdown'
  if (name.endsWith('.csv')) return 'CSV'
  return 'Text'
}

export default function KnowledgePage() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [preview, setPreview] = useState<Doc | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/documents')
    const data = await res.json()
    setDocs(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    for (const file of Array.from(files)) {
      const form = new FormData()
      form.append('file', file)
      await fetch('/api/documents', { method: 'POST', body: form })
    }
    await load()
    setUploading(false)
  }

  async function deleteDoc(id: number) {
    await fetch(`/api/documents/${id}`, { method: 'DELETE' })
    setDocs(prev => prev.filter(d => d.id !== id))
    if (preview?.id === id) setPreview(null)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    upload(e.dataTransfer.files)
  }

  const wordCount = (text: string | null) =>
    text ? text.trim().split(/\s+/).filter(Boolean).length.toLocaleString() : '—'

  return (
    <div className="h-full flex flex-col bg-cream" style={FONT}>
      {/* Header */}
      <div className="px-8 py-6 border-b border-mushroom flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blueberry/10 flex items-center justify-center">
          <BookOpen className="w-4 h-4 text-blueberry" strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-ink-dark">Knowledge Base</h1>
          <p className="text-xs text-ink/50">Upload docs — Rose Mary can search them when answering your questions</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-ink/40">{docs.length} document{docs.length !== 1 ? 's' : ''}</span>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-4 py-2 bg-blueberry text-cream rounded-lg text-xs font-semibold hover:bg-blueberry/90 transition-all disabled:opacity-60"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Upload
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.md,.csv"
            className="hidden"
            onChange={e => upload(e.target.files)}
          />
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Document list */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`mb-5 border-2 border-dashed rounded-xl px-6 py-8 text-center transition-all cursor-pointer ${
              dragOver
                ? 'border-blueberry/60 bg-blueberry/5'
                : 'border-mushroom hover:border-blueberry/30 hover:bg-oatmilk/40'
            }`}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className={`w-6 h-6 mx-auto mb-2 transition-colors ${dragOver ? 'text-blueberry' : 'text-ink/20'}`} />
            <p className="text-sm text-ink/40">
              {dragOver ? 'Drop to upload' : 'Drag & drop files here, or click to browse'}
            </p>
            <p className="text-[10px] text-ink/25 mt-1">PDF, Word (.docx), Text, Markdown, CSV — up to 20 MB each</p>
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-xs text-ink/40 py-6 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading…
            </div>
          )}

          {!loading && docs.length === 0 && (
            <div className="text-center py-12 text-ink/30">
              <BookOpen className="w-8 h-8 mx-auto mb-3 opacity-30" strokeWidth={1.5} />
              <p className="text-sm">No documents yet</p>
              <p className="text-xs mt-1">Upload your first file above — wholesale guides, brand guidelines, pricing sheets, anything useful</p>
            </div>
          )}

          {!loading && docs.length > 0 && (
            <div className="space-y-2">
              {docs.map(doc => (
                <div
                  key={doc.id}
                  onClick={() => setPreview(preview?.id === doc.id ? null : doc)}
                  className={`flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-all cursor-pointer ${
                    preview?.id === doc.id
                      ? 'bg-oatmilk border-blueberry/20'
                      : 'bg-cream border-mushroom/60 hover:bg-oatmilk/60 hover:border-mushroom'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-oatmilk border border-mushroom/60 flex items-center justify-center shrink-0">
                    {fileIcon(doc.file_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-dark truncate">{doc.original_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-semibold text-ink/30 uppercase tracking-wider">
                        {extLabel(doc.file_type, doc.original_name)}
                      </span>
                      <span className="text-[10px] text-ink/25">·</span>
                      <span className="text-[10px] text-ink/30">{fileSize(doc.file_size)}</span>
                      <span className="text-[10px] text-ink/25">·</span>
                      <span className="text-[10px] text-ink/30">{wordCount(doc.content_text)} words indexed</span>
                      {(doc.task_title || doc.subtask_title) && (
                        <>
                          <span className="text-[10px] text-ink/25">·</span>
                          <span className="flex items-center gap-1 text-[10px] text-blueberry/60">
                            <LayoutGrid className="w-2.5 h-2.5" />
                            {doc.subtask_title ?? doc.task_title}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-ink/25">
                      {new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); deleteDoc(doc.id) }}
                      className="p-1.5 rounded-lg text-ink/20 hover:text-terracotta hover:bg-terracotta/8 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Preview panel */}
        {preview && (
          <div className="w-[380px] shrink-0 border-l border-mushroom flex flex-col">
            <div className="px-5 py-4 border-b border-mushroom flex items-center gap-3">
              {fileIcon(preview.file_type)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink-dark truncate">{preview.original_name}</p>
                <p className="text-[10px] text-ink/40">{wordCount(preview.content_text)} words · {fileSize(preview.file_size)}</p>
              </div>
              <button onClick={() => setPreview(null)} className="text-ink/30 hover:text-ink transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            {preview.task_title && (
              <div className="px-5 py-2.5 border-b border-mushroom/60 flex items-center gap-1.5">
                <LayoutGrid className="w-3 h-3 text-blueberry/60" />
                <span className="text-[10px] text-blueberry/70">Attached to task:</span>
                <span className="text-[10px] font-semibold text-ink-dark">{preview.task_title}</span>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-5">
              {preview.content_text ? (
                <pre className="text-xs text-ink/60 whitespace-pre-wrap leading-relaxed font-sans" style={FONT}>
                  {preview.content_text.slice(0, 6000)}
                  {preview.content_text.length > 6000 && '\n\n… (preview truncated)'}
                </pre>
              ) : (
                <p className="text-xs text-ink/30 italic">No text could be extracted from this file.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
