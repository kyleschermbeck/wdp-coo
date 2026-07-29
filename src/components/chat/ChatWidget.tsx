'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { X, Send, Leaf, ChevronDown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { marked } from 'marked'

marked.setOptions({ breaks: true })

interface Agent { id: number; name: string; description: string | null; active: number }
interface Message { role: 'user' | 'assistant'; content: string }

const FONT = { fontFamily: "'Jost', system-ui, sans-serif" }
const STORAGE_KEY = (agentId: number) => `chat_history_agent_${agentId}`

export function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [agentId, setAgentId] = useState<number | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    fetch('/api/agents')
      .then(r => r.json())
      .then((data: Agent[]) => {
        const active = data.filter(a => a.active)
        setAgents(active)
        if (active.length > 0) {
          const id = active[0].id
          setAgentId(id)
          try {
            const saved = localStorage.getItem(STORAGE_KEY(id))
            if (saved) setMessages(JSON.parse(saved))
          } catch { /* ignore */ }
        }
      })
  }, [])

  // Persist messages to localStorage when they change
  useEffect(() => {
    if (agentId === null) return
    try {
      localStorage.setItem(STORAGE_KEY(agentId), JSON.stringify(messages))
    } catch { /* ignore */ }
  }, [messages, agentId])

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        toggleRef.current && !toggleRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || streaming || !agentId) return
    const next: Message[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setStreaming(true)

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agentId, messages: next }),
    })

    if (!res.ok || !res.body) { setStreaming(false); return }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let assistantText = ''
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      assistantText += decoder.decode(value, { stream: true })
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: assistantText }
        return updated
      })
    }
    setStreaming(false)
  }

  const activeAgent = agents.find(a => a.id === agentId)

  return (
    <>
      {/* Toggle button */}
      <button
        ref={toggleRef}
        onClick={() => setOpen(v => !v)}
        className={cn(
          'fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all cursor-pointer',
          open ? 'bg-ink text-cream' : 'bg-ink text-cream hover:bg-ink-dark'
        )}
        title="Open assistant"
      >
        {open ? <X className="w-5 h-5" /> : <Leaf className="w-5 h-5" />}
      </button>

      {/* Panel */}
      <div ref={panelRef} className={cn(
        'fixed bottom-22 right-6 z-50 w-[400px] bg-cream border border-mushroom rounded-2xl shadow-2xl flex flex-col transition-all duration-200 origin-bottom-right',
        open ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
      )} style={{ height: 560 }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-mushroom shrink-0">
          <div className="flex items-center gap-2">
            <Leaf className="w-4 h-4 text-ink" />
            <select
              value={agentId ?? ''}
              onChange={e => {
                const id = Number(e.target.value)
                setAgentId(id)
                try {
                  const saved = localStorage.getItem(STORAGE_KEY(id))
                  setMessages(saved ? JSON.parse(saved) : [])
                } catch { setMessages([]) }
              }}
              className="text-sm font-semibold text-ink-dark bg-transparent border-none outline-none cursor-pointer"
              style={FONT}
            >
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <ChevronDown className="w-3 h-3 text-ink/40" />
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={() => { setMessages([]); if (agentId) try { localStorage.removeItem(STORAGE_KEY(agentId)) } catch { /* ignore */ } }}
                className="text-xs text-ink/40 hover:text-ink transition-colors cursor-pointer"
                style={FONT}
              >
                Clear
              </button>
            )}
            <button onClick={() => setOpen(false)} className="text-ink/40 hover:text-ink cursor-pointer transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <Leaf className="w-8 h-8 text-mushroom mb-3" />
              <p className="text-sm font-medium text-ink-dark" style={FONT}>{activeAgent?.name ?? 'Assistant'}</p>
              {activeAgent?.description && (
                <p className="text-xs text-ink/50 mt-1" style={FONT}>{activeAgent.description}</p>
              )}
              <p className="text-xs text-ink/40 mt-4" style={FONT}>Ask me anything about WDP.</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              {m.role === 'user' ? (
                <div
                  className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed bg-ink text-cream rounded-br-sm"
                  style={{ ...FONT, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                >
                  {m.content}
                </div>
              ) : (
                <div
                  className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed bg-white border border-mushroom/60 text-ink-dark rounded-bl-sm chat-prose"
                  style={{ ...FONT, wordBreak: 'break-word' }}
                >
                  {m.content
                    ? <div dangerouslySetInnerHTML={{ __html: marked.parse(m.content) as string }} />
                    : streaming && i === messages.length - 1
                      ? <span className="inline-flex items-center gap-1 text-ink/40"><Loader2 className="w-3 h-3 animate-spin" /> Thinking…</span>
                      : null
                  }
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-3 pb-3 pt-2 border-t border-mushroom shrink-0">
          <div className="flex items-end gap-2 bg-white border border-mushroom rounded-xl px-3 py-2 focus-within:border-ink transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px' }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Ask anything…"
              rows={1}
              className="flex-1 text-sm text-ink-dark bg-transparent outline-none resize-none placeholder:text-ink/30"
              style={{ ...FONT, minHeight: 24, maxHeight: 120 }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || streaming}
              className="shrink-0 w-7 h-7 rounded-lg bg-ink text-cream flex items-center justify-center disabled:opacity-30 cursor-pointer disabled:cursor-default transition-opacity mb-0.5"
            >
              {streaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </div>
          <p className="text-[10px] text-ink/30 mt-1.5 text-center" style={FONT}>Enter to send · Shift+Enter for newline</p>
        </div>
      </div>
    </>
  )
}
