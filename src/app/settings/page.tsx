'use client'

import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, XCircle, RefreshCw, Download, ChevronDown, ChevronUp, Save, Zap, Trash2, Plus, Bot } from 'lucide-react'

const FONT = "'Jost', system-ui, sans-serif"
const SERIF = "'Cormorant Garamond', Georgia, serif"
const CREAM = '#FAF8F4'
const OATMILK = '#F2EDE5'
const MUSHROOM = '#D8D2C6'
const INK = '#2C2C2C'
const INK_LIGHT = 'rgba(44,44,44,0.55)'
const BORDER = `1px solid ${MUSHROOM}`

const TABS = ['Appearance', 'Business Profile', 'Agents', 'Integrations', 'Data']

const AGENTS = [
  {
    id: 'email_analyze',
    name: 'Email Analyzer',
    description: 'Reads incoming emails and extracts priority, action items, category, and sentiment.',
    operations: ['analyze'],
    model: 'claude-haiku-4-5-20251001',
    promptKey: 'agent_prompt:email_analyze',
    defaultPrompt: `You are an AI assistant helping a small business owner manage their email.
Analyze this email and return a JSON object with:
- priority: "urgent" | "high" | "normal" | "low"
- category: "order" | "wholesale" | "vendor" | "customer" | "marketing" | "admin" | "personal" | "other"
- sentiment: "positive" | "neutral" | "negative"
- action_required: true | false
- action_items: string[] (list of specific actions needed)
- summary: string (1-2 sentence summary)
- suggested_response: string | null`,
  },
  {
    id: 'email_draft',
    name: 'Email Draft Writer',
    description: 'Drafts reply emails in the WDP brand voice based on context and tone instructions.',
    operations: ['draft_reply', 'generate_draft'],
    model: 'claude-haiku-4-5-20251001',
    promptKey: 'agent_prompt:email_draft',
    defaultPrompt: `You are writing on behalf of Kyle at Weeknight Dinner Party, a premium spice blend brand.
Your tone is warm, professional, and genuine — like a real person, not a corporate email.
Write a reply that addresses the key points naturally.
Keep it concise. Sign off as "Kyle" unless instructed otherwise.`,
  },
  {
    id: 'recipe_writer',
    name: 'Recipe Writer',
    description: 'Generates recipe content (about, why, steps, considerations) for WDP spice blends.',
    operations: ['recipe_writer'],
    model: 'claude-haiku-4-5-20251001',
    promptKey: 'agent_prompt:recipe_writer',
    defaultPrompt: `You are a food writer for Weeknight Dinner Party, a premium spice blend brand.
Your writing is warm, confident, and approachable — like a friend who happens to cook really well.
You make weeknight cooking feel elevated but never intimidating.`,
  },
]

const ACCENT_THEMES = [
  { id: 'terracotta', label: 'Terracotta', hex: '#C17A5E' },
  { id: 'sage',       label: 'Sage',       hex: '#7A9E7E' },
  { id: 'thyme',      label: 'Thyme',      hex: '#6B7C5C' },
  { id: 'butter',     label: 'Butter',     hex: '#E8C84A' },
  { id: 'blueberry',  label: 'Blueberry',  hex: '#4A5568' },
  { id: 'candy',      label: 'Candy',      hex: '#D4688C' },
]

type Settings = Record<string, string>
type UsageRow = { operation: string; model: string; input_tokens: number; output_tokens: number; call_count: number }

// Apply appearance settings to the document immediately (no page reload needed)
function applyAppearance(fontSize: string, density: string) {
  try {
    // Apply zoom directly via inline style — CSS attribute selectors don't survive Tailwind v4 compilation
    const zoomMap: Record<string, string> = { sm: '0.88', md: '1', lg: '1.12' }
    document.documentElement.style.zoom = zoomMap[fontSize] ?? '1'

    // Sidebar density — compact reduces nav link padding
    const navLinks = document.querySelectorAll<HTMLElement>('nav a')
    navLinks.forEach(a => {
      if (density === 'compact') {
        a.style.paddingTop = '0.375rem'
        a.style.paddingBottom = '0.375rem'
      } else {
        a.style.paddingTop = ''
        a.style.paddingBottom = ''
      }
    })

    localStorage.setItem('wdp_font_size', fontSize)
    localStorage.setItem('wdp_density', density)
  } catch { /* localStorage unavailable */ }
}

function cardStyle(extra?: React.CSSProperties): React.CSSProperties {
  return { background: '#fff', border: BORDER, borderRadius: 10, padding: '20px 24px', ...extra }
}

function FieldLabel({ text }: { text: string }) {
  return (
    <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: INK_LIGHT, marginBottom: 6 }}>
      {text}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, multiline, type }: { value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; type?: string }) {
  const shared: React.CSSProperties = {
    fontFamily: FONT, fontSize: 14, color: INK, background: CREAM,
    border: BORDER, borderRadius: 7, padding: '9px 12px',
    width: '100%', outline: 'none', boxSizing: 'border-box' as const,
    resize: multiline ? 'vertical' as const : undefined,
  }
  if (multiline) return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={5} style={shared} />
  return <input type={type ?? 'text'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={shared} />
}

// ─── Appearance ─────────────────────────────────
function AppearanceTab({ settings, onSave }: { settings: Settings; onSave: (p: Settings) => void }) {
  const [fontSize, setFontSize] = useState('md')
  const [accent, setAccent]     = useState('terracotta')
  const [density, setDensity]   = useState('comfortable')
  const [dirty, setDirty]       = useState(false)
  const [applied, setApplied]   = useState(false)

  useEffect(() => {
    setFontSize(settings['appearance:font_size'] ?? localStorage.getItem('wdp_font_size') ?? 'md')
    setAccent(settings['appearance:accent'] ?? 'terracotta')
    setDensity(settings['appearance:density'] ?? localStorage.getItem('wdp_density') ?? 'comfortable')
    setDirty(false)
  }, [settings])

  function set<T>(setter: (v: T) => void, v: T) { setter(v); setDirty(true); setApplied(false) }

  function handleSave() {
    applyAppearance(fontSize, density)
    onSave({ 'appearance:font_size': fontSize, 'appearance:accent': accent, 'appearance:density': density })
    setDirty(false)
    setApplied(true)
    setTimeout(() => setApplied(false), 2500)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={cardStyle()}>
        <FieldLabel text="Font Size" />
        <div style={{ display: 'flex', gap: 10 }}>
          {(['sm', 'md', 'lg'] as const).map(sz => (
            <button key={sz} onClick={() => set(setFontSize, sz)} style={{
              fontFamily: FONT, fontWeight: 600,
              fontSize: sz === 'sm' ? 12 : sz === 'md' ? 14 : 17,
              padding: '8px 20px', borderRadius: 7, cursor: 'pointer',
              background: fontSize === sz ? INK : CREAM,
              color: fontSize === sz ? '#fff' : INK,
              border: fontSize === sz ? `1px solid ${INK}` : BORDER,
            }}>
              {sz === 'sm' ? 'Small' : sz === 'md' ? 'Medium' : 'Large'}
            </button>
          ))}
        </div>
        <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT, marginTop: 8, marginBottom: 0 }}>
          Scales all text and UI elements across the entire Command Center.
        </p>
      </div>

      <div style={cardStyle()}>
        <FieldLabel text="Accent Color" />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {ACCENT_THEMES.map(t => (
            <button key={t.id} onClick={() => set(setAccent, t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 14px', borderRadius: 7, cursor: 'pointer',
              background: accent === t.id ? t.hex + '20' : CREAM,
              border: accent === t.id ? `2px solid ${t.hex}` : BORDER,
              fontFamily: FONT, fontSize: 13, fontWeight: 600, color: INK,
            }}>
              <span style={{ width: 14, height: 14, borderRadius: '50%', background: t.hex, display: 'inline-block', flexShrink: 0 }} />
              {t.label}
            </button>
          ))}
        </div>
        <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT, marginTop: 8, marginBottom: 0 }}>
          Accent color preference is saved for future theme updates.
        </p>
      </div>

      <div style={cardStyle()}>
        <FieldLabel text="Sidebar Density" />
        <div style={{ display: 'flex', gap: 10 }}>
          {(['comfortable', 'compact'] as const).map(d => (
            <button key={d} onClick={() => set(setDensity, d)} style={{
              fontFamily: FONT, fontWeight: 600, fontSize: 13,
              padding: '8px 18px', borderRadius: 7, cursor: 'pointer',
              background: density === d ? INK : CREAM,
              color: density === d ? '#fff' : INK,
              border: density === d ? `1px solid ${INK}` : BORDER,
            }}>
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
        <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT, marginTop: 8, marginBottom: 0 }}>
          Compact mode reduces sidebar nav item height.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={handleSave}
          disabled={!dirty}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            fontFamily: FONT, fontWeight: 600, fontSize: 13.5,
            background: dirty ? INK : MUSHROOM,
            color: '#fff', border: 'none',
            padding: '10px 20px', borderRadius: 8,
            cursor: dirty ? 'pointer' : 'default',
          }}
        >
          <Save size={14} /> Apply &amp; Save
        </button>
        {applied && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#2E7D32', fontFamily: FONT, fontSize: 13, fontWeight: 600 }}>
            <CheckCircle size={14} /> Applied across the app
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Business Profile ────────────────────────────
function BusinessProfileTab({ settings, onSave }: { settings: Settings; onSave: (p: Settings) => void }) {
  const [brandName,     setBrandName]     = useState('')
  const [ownerName,     setOwnerName]     = useState('')
  const [storeUrl,      setStoreUrl]      = useState('')
  const [donationCause, setDonationCause] = useState('')
  const [channels,      setChannels]      = useState('')
  const [voice,         setVoice]         = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setBrandName(settings['biz:brand_name'] ?? 'Weeknight Dinner Party')
    setOwnerName(settings['biz:owner_name'] ?? 'Kyle')
    setStoreUrl(settings['biz:store_url'] ?? '')
    setDonationCause(settings['biz:donation_cause'] ?? '')
    setChannels(settings['biz:channels'] ?? 'Shopify, Faire, Retail, Amazon')
    setVoice(settings['biz:voice'] ?? 'Warm, witty, and approachable. Like a friend who cooks really well.')
    setDirty(false)
  }, [settings])

  const ch = useCallback((setter: (v: string) => void) => (v: string) => { setter(v); setDirty(true) }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <p style={{ fontFamily: FONT, fontSize: 13.5, color: INK_LIGHT, margin: 0 }}>
        This context is surfaced to agents so they understand your brand when generating copy, analyzing emails, and making recommendations.
      </p>
      <div style={cardStyle()}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <div>
            <FieldLabel text="Brand Name" />
            <TextInput value={brandName} onChange={ch(setBrandName)} placeholder="e.g. Weeknight Dinner Party" />
          </div>
          <div>
            <FieldLabel text="Owner / Primary Contact" />
            <TextInput value={ownerName} onChange={ch(setOwnerName)} placeholder="e.g. Kyle" />
          </div>
          <div>
            <FieldLabel text="Store URL" />
            <TextInput value={storeUrl} onChange={ch(setStoreUrl)} placeholder="e.g. weeknightdinnerparty.com" />
          </div>
          <div>
            <FieldLabel text="Donation / Mission Cause" />
            <TextInput value={donationCause} onChange={ch(setDonationCause)} placeholder="e.g. Feeding America" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <FieldLabel text="Sales Channels" />
            <TextInput value={channels} onChange={ch(setChannels)} placeholder="e.g. Shopify, Faire, Amazon" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <FieldLabel text="Brand Voice (used in agent prompts)" />
            <TextInput value={voice} onChange={ch(setVoice)} placeholder="Describe your tone and style…" multiline />
          </div>
        </div>
      </div>
      {dirty && (
        <button
          onClick={() => {
            onSave({ 'biz:brand_name': brandName, 'biz:owner_name': ownerName, 'biz:store_url': storeUrl, 'biz:donation_cause': donationCause, 'biz:channels': channels, 'biz:voice': voice })
            setDirty(false)
          }}
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 7, fontFamily: FONT, fontWeight: 600, fontSize: 13.5, background: INK, color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer' }}
        >
          <Save size={14} /> Save Profile
        </button>
      )}
    </div>
  )
}

// ─── Agents ─────────────────────────────────────
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'claude-sonnet-4-6':         { input: 3.00, output: 15.00 },
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

interface DbAgent {
  id: number
  name: string
  description: string | null
  system_prompt: string
  model: string
  active: number
}

function AgentsTab({ settings: _settings, onSave: _onSave }: { settings: Settings; onSave: (p: Settings) => void }) {
  const [agents, setAgents]           = useState<DbAgent[]>([])
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [expandedId, setExpandedId]   = useState<number | null>(null)
  const [editDraft, setEditDraft]     = useState<Partial<DbAgent>>({})
  const [saving, setSaving]           = useState(false)
  const [showCreate, setShowCreate]   = useState(false)
  const [newDraft, setNewDraft]       = useState({ name: '', description: '', system_prompt: '', model: 'claude-sonnet-4-6' })
  const [creating, setCreating]       = useState(false)

  const [usageRows, setUsageRows]     = useState<UsageRow[]>([])
  const [totalCost, setTotalCost]     = useState(0)
  const [totalTokens, setTotalTokens] = useState(0)
  const [loadingUsage, setLoadingUsage] = useState(true)

  useEffect(() => {
    loadAgents()
    fetch('/api/email/usage').then(r => r.json()).then(data => {
      setUsageRows(data.anthropic?.by_operation ?? [])
      setTotalCost(data.anthropic?.estimated_cost_usd ?? 0)
      setTotalTokens(data.anthropic?.total_tokens ?? 0)
      setLoadingUsage(false)
    }).catch(() => setLoadingUsage(false))
  }, [])

  function loadAgents() {
    setLoadingAgents(true)
    fetch('/api/agents').then(r => r.json()).then((data: DbAgent[]) => {
      setAgents(data)
      setLoadingAgents(false)
    }).catch(() => setLoadingAgents(false))
  }

  function openEdit(agent: DbAgent) {
    if (expandedId === agent.id) { setExpandedId(null); return }
    setExpandedId(agent.id)
    setEditDraft({ name: agent.name, description: agent.description ?? '', system_prompt: agent.system_prompt, model: agent.model, active: agent.active })
  }

  async function saveAgent(id: number) {
    setSaving(true)
    await fetch(`/api/agents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editDraft),
    })
    setSaving(false)
    setExpandedId(null)
    loadAgents()
  }

  async function deleteAgent(id: number) {
    if (!confirm('Delete this agent? This cannot be undone.')) return
    await fetch(`/api/agents/${id}`, { method: 'DELETE' })
    if (expandedId === id) setExpandedId(null)
    loadAgents()
  }

  async function toggleActive(agent: DbAgent) {
    await fetch(`/api/agents/${agent.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...agent, description: agent.description ?? '', active: agent.active ? 0 : 1 }),
    })
    loadAgents()
  }

  async function createAgent() {
    if (!newDraft.name.trim()) return
    setCreating(true)
    await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newDraft),
    })
    setCreating(false)
    setShowCreate(false)
    setNewDraft({ name: '', description: '', system_prompt: '', model: 'claude-sonnet-4-6' })
    loadAgents()
  }

  const activeCount = agents.filter(a => a.active).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <div style={cardStyle({ padding: '16px 20px' })}>
          <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK_LIGHT, marginBottom: 6 }}>Total Tokens Used</div>
          <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600, color: INK }}>{loadingUsage ? '—' : fmt(totalTokens)}</div>
        </div>
        <div style={cardStyle({ padding: '16px 20px' })}>
          <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK_LIGHT, marginBottom: 6 }}>Estimated API Cost</div>
          <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600, color: INK }}>{loadingUsage ? '—' : `$${totalCost.toFixed(4)}`}</div>
          <div style={{ fontFamily: FONT, fontSize: 11, color: INK_LIGHT, marginTop: 6 }}>
            Estimated cost is approximate.{' '}
            <a href="https://console.anthropic.com/settings/cost" target="_blank" rel="noopener noreferrer" style={{ color: INK_LIGHT, textDecoration: 'underline' }}>
              View actual billing on Anthropic Console ↗
            </a>
          </div>
        </div>
        <div style={cardStyle({ padding: '16px 20px' })}>
          <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK_LIGHT, marginBottom: 6 }}>Active Agents</div>
          <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600, color: INK }}>{loadingAgents ? '—' : String(activeCount)}</div>
        </div>
      </div>

      {/* Agent list */}
      {loadingAgents ? (
        <div style={{ fontFamily: FONT, fontSize: 13, color: INK_LIGHT, padding: '16px 0' }}>Loading agents…</div>
      ) : (
        <>
          {agents.map(agent => {
            const isOpen = expandedId === agent.id
            return (
              <div key={agent.id} style={cardStyle({ padding: 0, overflow: 'hidden' })}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: agent.active ? OATMILK : '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Bot size={16} color={agent.active ? INK : INK_LIGHT} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: agent.active ? INK : INK_LIGHT }}>{agent.name}</div>
                    <div style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agent.description || agent.model}</div>
                  </div>
                  <button
                    title={agent.active ? 'Deactivate' : 'Activate'}
                    onClick={() => toggleActive(agent)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', color: agent.active ? '#4a9f6f' : INK_LIGHT }}
                  >
                    {agent.active ? <CheckCircle size={16} /> : <XCircle size={16} />}
                  </button>
                  <button
                    onClick={() => openEdit(agent)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', color: INK_LIGHT }}
                  >
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>

                {isOpen && (
                  <div style={{ borderTop: BORDER, padding: '18px 20px', background: CREAM, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <FieldLabel text="Name" />
                        <input
                          value={editDraft.name ?? ''}
                          onChange={e => setEditDraft(prev => ({ ...prev, name: e.target.value }))}
                          style={{ fontFamily: FONT, fontSize: 13, color: INK, background: '#fff', border: BORDER, borderRadius: 7, padding: '8px 12px', width: '100%', outline: 'none', boxSizing: 'border-box' as const }}
                        />
                      </div>
                      <div>
                        <FieldLabel text="Model" />
                        <select
                          value={editDraft.model ?? 'claude-sonnet-4-6'}
                          onChange={e => setEditDraft(prev => ({ ...prev, model: e.target.value }))}
                          style={{ fontFamily: FONT, fontSize: 13, color: INK, background: '#fff', border: BORDER, borderRadius: 7, padding: '8px 12px', width: '100%', outline: 'none', boxSizing: 'border-box' as const }}
                        >
                          <option value="claude-haiku-4-5-20251001">claude-haiku-4-5 (fast)</option>
                          <option value="claude-sonnet-4-6">claude-sonnet-4-6 (balanced)</option>
                          <option value="claude-opus-4-8">claude-opus-4-8 (powerful)</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <FieldLabel text="Description" />
                      <input
                        value={editDraft.description ?? ''}
                        onChange={e => setEditDraft(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Short description of what this agent does"
                        style={{ fontFamily: FONT, fontSize: 13, color: INK, background: '#fff', border: BORDER, borderRadius: 7, padding: '8px 12px', width: '100%', outline: 'none', boxSizing: 'border-box' as const }}
                      />
                    </div>
                    <div>
                      <FieldLabel text="System Prompt" />
                      <textarea
                        value={editDraft.system_prompt ?? ''}
                        onChange={e => setEditDraft(prev => ({ ...prev, system_prompt: e.target.value }))}
                        rows={8}
                        style={{ fontFamily: 'monospace', fontSize: 12.5, color: INK, background: '#fff', border: BORDER, borderRadius: 7, padding: '10px 14px', width: '100%', outline: 'none', boxSizing: 'border-box' as const, resize: 'vertical', lineHeight: 1.6 }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        onClick={() => saveAgent(agent.id)}
                        disabled={saving}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontWeight: 600, fontSize: 13, background: INK, color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 7, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
                      >
                        <Save size={13} /> Save
                      </button>
                      <button
                        onClick={() => deleteAgent(agent.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontWeight: 600, fontSize: 13, color: '#c0392b', background: CREAM, border: '1px solid rgba(192,57,43,0.25)', padding: '8px 16px', borderRadius: 7, cursor: 'pointer' }}
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                      <button
                        onClick={() => setExpandedId(null)}
                        style={{ fontFamily: FONT, fontWeight: 600, fontSize: 13, color: INK_LIGHT, background: CREAM, border: BORDER, padding: '8px 16px', borderRadius: 7, cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Create new agent */}
          {showCreate ? (
            <div style={cardStyle({ padding: '18px 20px' })}>
              <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: INK, marginBottom: 14 }}>New Agent</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <FieldLabel text="Name" />
                    <input
                      value={newDraft.name}
                      onChange={e => setNewDraft(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Agent name"
                      autoFocus
                      style={{ fontFamily: FONT, fontSize: 13, color: INK, background: '#fff', border: BORDER, borderRadius: 7, padding: '8px 12px', width: '100%', outline: 'none', boxSizing: 'border-box' as const }}
                    />
                  </div>
                  <div>
                    <FieldLabel text="Model" />
                    <select
                      value={newDraft.model}
                      onChange={e => setNewDraft(prev => ({ ...prev, model: e.target.value }))}
                      style={{ fontFamily: FONT, fontSize: 13, color: INK, background: '#fff', border: BORDER, borderRadius: 7, padding: '8px 12px', width: '100%', outline: 'none', boxSizing: 'border-box' as const }}
                    >
                      <option value="claude-haiku-4-5-20251001">claude-haiku-4-5 (fast)</option>
                      <option value="claude-sonnet-4-6">claude-sonnet-4-6 (balanced)</option>
                      <option value="claude-opus-4-8">claude-opus-4-8 (powerful)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <FieldLabel text="Description" />
                  <input
                    value={newDraft.description}
                    onChange={e => setNewDraft(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Short description of what this agent does"
                    style={{ fontFamily: FONT, fontSize: 13, color: INK, background: '#fff', border: BORDER, borderRadius: 7, padding: '8px 12px', width: '100%', outline: 'none', boxSizing: 'border-box' as const }}
                  />
                </div>
                <div>
                  <FieldLabel text="System Prompt" />
                  <textarea
                    value={newDraft.system_prompt}
                    onChange={e => setNewDraft(prev => ({ ...prev, system_prompt: e.target.value }))}
                    placeholder="You are a helpful assistant for Weeknight Dinner Party…"
                    rows={6}
                    style={{ fontFamily: 'monospace', fontSize: 12.5, color: INK, background: '#fff', border: BORDER, borderRadius: 7, padding: '10px 14px', width: '100%', outline: 'none', boxSizing: 'border-box' as const, resize: 'vertical', lineHeight: 1.6 }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={createAgent}
                    disabled={!newDraft.name.trim() || creating}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontWeight: 600, fontSize: 13, background: INK, color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 7, cursor: 'pointer', opacity: !newDraft.name.trim() || creating ? 0.5 : 1 }}
                  >
                    <Plus size={13} /> Create Agent
                  </button>
                  <button
                    onClick={() => { setShowCreate(false); setNewDraft({ name: '', description: '', system_prompt: '', model: 'claude-sonnet-4-6' }) }}
                    style={{ fontFamily: FONT, fontWeight: 600, fontSize: 13, color: INK_LIGHT, background: CREAM, border: BORDER, padding: '8px 16px', borderRadius: 7, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontWeight: 600, fontSize: 13, color: INK, background: CREAM, border: BORDER, borderRadius: 10, padding: '12px 20px', cursor: 'pointer', width: '100%', justifyContent: 'center' }}
            >
              <Plus size={15} /> Add New Agent
            </button>
          )}
        </>
      )}

      {/* Anthropic API Key */}
      <AnthropicApiKeySection />

      {/* API usage log */}
      {!loadingUsage && usageRows.length > 0 && (
        <div style={cardStyle()}>
          <FieldLabel text="API Usage Log (by operation)" />
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT, fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: BORDER }}>
                {['Operation', 'Model', 'Calls', 'Input', 'Output', 'Est. Cost'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: INK_LIGHT }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usageRows.map((row, i) => {
                const p = PRICING[row.model] ?? { input: 1, output: 5 }
                const cost = (row.input_tokens / 1e6) * p.input + (row.output_tokens / 1e6) * p.output
                return (
                  <tr key={i} style={{ borderBottom: i < usageRows.length - 1 ? `1px solid ${OATMILK}` : 'none' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 600 }}>{row.operation}</td>
                    <td style={{ padding: '8px 10px', color: INK_LIGHT }}>{row.model}</td>
                    <td style={{ padding: '8px 10px' }}>{row.call_count}</td>
                    <td style={{ padding: '8px 10px' }}>{fmt(row.input_tokens)}</td>
                    <td style={{ padding: '8px 10px' }}>{fmt(row.output_tokens)}</td>
                    <td style={{ padding: '8px 10px' }}>${cost.toFixed(5)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Anthropic API Key ───────────────────────────
function AnthropicApiKeySection() {
  const [keyInput, setKeyInput] = useState('')
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/settings/api-key').then(r => r.json()).then(d => setHasKey(!!d.has_key)).catch(() => setHasKey(false))
  }, [])

  async function saveKey() {
    if (!keyInput.trim()) return
    setSaving(true); setError(''); setSaved(false)
    try {
      const res = await fetch('/api/settings/api-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: keyInput.trim() }) })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Failed to save'); return }
      setHasKey(true); setSaved(true); setKeyInput('')
      setTimeout(() => setSaved(false), 2500)
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  return (
    <div style={cardStyle()}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#FF6B3514', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 18 }}>🔑</span>
        </div>
        <div>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: INK }}>Anthropic API Key</div>
          <div style={{ fontFamily: FONT, fontSize: 12.5, color: INK_LIGHT }}>Required for AI agents and content generation</div>
        </div>
        {hasKey === true && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, background: '#E8F5E9', border: '1px solid #C8E6C9' }}>
            <CheckCircle size={13} color="#2E7D32" />
            <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 12, color: '#2E7D32' }}>Key saved</span>
          </div>
        )}
      </div>
      <FieldLabel text={hasKey ? 'Update API Key' : 'Enter API Key'} />
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          type="password"
          value={keyInput}
          onChange={e => setKeyInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') saveKey() }}
          placeholder="sk-ant-api03-…"
          style={{ flex: 1, fontFamily: FONT, fontSize: 13, padding: '9px 12px', borderRadius: 7, border: BORDER, background: '#fff', color: INK, outline: 'none' }}
        />
        <button
          onClick={saveKey}
          disabled={saving || !keyInput.trim()}
          style={{ fontFamily: FONT, fontWeight: 600, fontSize: 13, background: saving ? MUSHROOM : INK, color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 7, cursor: saving || !keyInput.trim() ? 'default' : 'pointer', opacity: !keyInput.trim() ? 0.5 : 1 }}
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
        </button>
      </div>
      {error && <p style={{ fontFamily: FONT, fontSize: 12, color: '#c0392b', marginTop: 8 }}>{error}</p>}
      <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT, marginTop: 10 }}>
        Get your key at <strong>console.anthropic.com</strong> → API Keys. The key is stored server-side in <code>.env.local</code>.
      </p>
    </div>
  )
}

// ─── Integrations ────────────────────────────────
type IntgStatus = { connected: boolean; detail?: string; lastSynced?: string; savedUserId?: string }

function IntegrationRow({
  name, desc, color, status, loading, configPanel,
}: {
  name: string
  desc: string
  color: string
  status: IntgStatus
  loading: boolean
  configPanel: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div style={cardStyle({ padding: 0, overflow: 'hidden' })}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px' }}>
        <div style={{ width: 40, height: 40, borderRadius: 9, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `1.5px solid ${color}30` }}>
          <div style={{ width: 16, height: 16, borderRadius: 4, background: color }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: INK }}>{name}</div>
          <div style={{ fontFamily: FONT, fontSize: 12.5, color: INK_LIGHT }}>{desc}</div>
          {status.detail && <div style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT, marginTop: 2 }}>{status.detail}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {status.lastSynced && (
            <span style={{ fontFamily: FONT, fontSize: 11, color: INK_LIGHT }}>
              Last sync: {new Date(status.lastSynced).toLocaleDateString()}
            </span>
          )}
          {loading ? (
            <div style={{ width: 90, height: 28, borderRadius: 20, background: MUSHROOM }} />
          ) : status.connected ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, background: '#E8F5E9', border: '1px solid #C8E6C9' }}>
              <CheckCircle size={13} color="#2E7D32" />
              <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 12, color: '#2E7D32' }}>Connected</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, background: OATMILK, border: BORDER }}>
              <XCircle size={13} color={INK_LIGHT} />
              <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 12, color: INK_LIGHT }}>Not connected</span>
            </div>
          )}
          <button
            onClick={() => setOpen(o => !o)}
            style={{ fontFamily: FONT, fontWeight: 600, fontSize: 12, color: INK, background: CREAM, border: BORDER, padding: '6px 14px', borderRadius: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            Configure {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>
      {open && (
        <div style={{ borderTop: BORDER, padding: '18px 20px', background: CREAM }}>
          {configPanel}
        </div>
      )}
    </div>
  )
}

function ShopifyConfig({ onConnected }: { onConnected: () => void }) {
  const [storeUrl, setStoreUrl]   = useState('')
  const [token, setToken]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  async function connect() {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/shopify/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ store_url: storeUrl, access_token: token }) })
      const data = await res.json() as { success?: boolean; error?: string }
      if (!res.ok || !data.success) { setError(data.error ?? 'Connection failed'); return }
      onConnected()
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  async function disconnect() {
    if (!confirm('Disconnect Shopify? This will clear your store credentials.')) return
    await fetch('/api/shopify/connect', { method: 'DELETE' }).catch(() => {})
    onConnected()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <FieldLabel text="Store URL" />
          <TextInput value={storeUrl} onChange={setStoreUrl} placeholder="yourstore.myshopify.com" />
        </div>
        <div>
          <FieldLabel text="Admin API Access Token" />
          <TextInput value={token} onChange={setToken} placeholder="shpat_…" type="password" />
        </div>
      </div>
      {error && <p style={{ fontFamily: FONT, fontSize: 12.5, color: '#C62828', margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={connect} disabled={saving || !storeUrl || !token} style={{ fontFamily: FONT, fontWeight: 600, fontSize: 13, background: saving ? MUSHROOM : INK, color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 7, cursor: saving ? 'default' : 'pointer' }}>
          {saving ? 'Connecting…' : 'Connect Shopify'}
        </button>
        <button onClick={disconnect} style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: FONT, fontWeight: 600, fontSize: 13, background: '#FFF3E0', color: '#E65100', border: '1px solid #FFCC80', padding: '9px 14px', borderRadius: 7, cursor: 'pointer' }}>
          <Trash2 size={13} /> Disconnect
        </button>
      </div>
      <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT, margin: 0 }}>
        Generate an Admin API access token in your Shopify Admin → Settings → Apps and sales channels → Develop apps.
      </p>
    </div>
  )
}

function KlaviyoConfig({ onConnected }: { onConnected: () => void }) {
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  async function connect() {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/klaviyo/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: apiKey }) })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) { setError(data.error ?? 'Connection failed'); return }
      onConnected()
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  async function disconnect() {
    if (!confirm('Disconnect Klaviyo? This will clear your API key.')) return
    await fetch('/api/klaviyo/connect', { method: 'DELETE' }).catch(() => {})
    onConnected()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ maxWidth: 400 }}>
        <FieldLabel text="Private API Key" />
        <TextInput value={apiKey} onChange={setApiKey} placeholder="pk_…" type="password" />
      </div>
      {error && <p style={{ fontFamily: FONT, fontSize: 12.5, color: '#C62828', margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={connect} disabled={saving || !apiKey} style={{ fontFamily: FONT, fontWeight: 600, fontSize: 13, background: saving ? MUSHROOM : INK, color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 7, cursor: saving ? 'default' : 'pointer' }}>
          {saving ? 'Connecting…' : 'Connect Klaviyo'}
        </button>
        <button onClick={disconnect} style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: FONT, fontWeight: 600, fontSize: 13, background: '#FFF3E0', color: '#E65100', border: '1px solid #FFCC80', padding: '9px 14px', borderRadius: 7, cursor: 'pointer' }}>
          <Trash2 size={13} /> Disconnect
        </button>
      </div>
      <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT, margin: 0 }}>
        Find your private API key in Klaviyo → Account → Settings → API Keys. Use a private key, not a public key.
      </p>
    </div>
  )
}

function InstagramConfig({ connected, savedUserId, onConnected }: { connected: boolean; savedUserId?: string; onConnected: () => void }) {
  const [token, setToken]   = useState('')
  const [userId, setUserId] = useState(savedUserId ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => { if (savedUserId) setUserId(savedUserId) }, [savedUserId])

  async function connect() {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/instagram/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: token, ig_user_id: userId }) })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) { setError(data.error ?? 'Connection failed'); return }
      onConnected()
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  async function disconnect() {
    if (!confirm('Disconnect Instagram?')) return
    await fetch('/api/instagram/status', { method: 'DELETE' }).catch(() => {})
    onConnected()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <FieldLabel text="Access Token" />
          <TextInput value={token} onChange={setToken} placeholder="EAAGm0P…" type="password" />
        </div>
        <div>
          <FieldLabel text="Instagram User ID" />
          <TextInput value={userId} onChange={setUserId} placeholder="17841400455970123" />
        </div>
      </div>
      {error && <p style={{ fontFamily: FONT, fontSize: 12.5, color: '#C62828', margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={connect} disabled={saving || !token || !userId} style={{ fontFamily: FONT, fontWeight: 600, fontSize: 13, background: saving ? MUSHROOM : INK, color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 7, cursor: saving ? 'default' : 'pointer' }}>
          {saving ? 'Connecting…' : 'Connect Instagram'}
        </button>
        {connected && (
          <button onClick={disconnect} style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: FONT, fontWeight: 600, fontSize: 13, background: '#FFF3E0', color: '#E65100', border: '1px solid #FFCC80', padding: '9px 14px', borderRadius: 7, cursor: 'pointer' }}>
            <Trash2 size={13} /> Disconnect
          </button>
        )}
      </div>
      <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT, margin: 0 }}>
        Use a <strong>long-lived token</strong> (60 days) from the{' '}
        <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer" style={{ color: '#1877F2' }}>Graph API Explorer</a>
        {' '}— generate a User Token, then exchange it for a long-lived one under the token info panel. Your Instagram User ID is visible in Meta Business Suite or via the Graph API.
      </p>
    </div>
  )
}

function MetaAdsConfig({ connected, onConnected }: { connected: boolean; onConnected: () => void }) {
  const [token, setToken]     = useState('')
  const [accountId, setAccountId] = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  async function connect() {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/meta-ads/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: token, ad_account_id: accountId }) })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) { setError(data.error ?? 'Connection failed'); return }
      onConnected()
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  async function disconnect() {
    if (!confirm('Disconnect Meta Ads?')) return
    await fetch('/api/meta-ads/status', { method: 'DELETE' }).catch(() => {})
    onConnected()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <FieldLabel text="Access Token" />
          <TextInput value={token} onChange={setToken} placeholder="EAAGm0P…" type="password" />
        </div>
        <div>
          <FieldLabel text="Ad Account ID" />
          <TextInput value={accountId} onChange={setAccountId} placeholder="act_123456789 or 123456789" />
        </div>
      </div>
      {error && <p style={{ fontFamily: FONT, fontSize: 12.5, color: '#C62828', margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={connect} disabled={saving || !token || !accountId} style={{ fontFamily: FONT, fontWeight: 600, fontSize: 13, background: saving ? MUSHROOM : INK, color: '#fff', border: 'none', padding: '9px 18px', borderRadius: 7, cursor: saving ? 'default' : 'pointer' }}>
          {saving ? 'Connecting…' : 'Connect Meta Ads'}
        </button>
        {connected && (
          <button onClick={disconnect} style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: FONT, fontWeight: 600, fontSize: 13, background: '#FFF3E0', color: '#E65100', border: '1px solid #FFCC80', padding: '9px 14px', borderRadius: 7, cursor: 'pointer' }}>
            <Trash2 size={13} /> Disconnect
          </button>
        )}
      </div>
      <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT, margin: 0 }}>
        Create a System User token in Meta Business Manager with ads_read permission. Find your Ad Account ID in Ads Manager → Account Overview.
      </p>
    </div>
  )
}

function GmailConfig({ connected }: { connected: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontFamily: FONT, fontSize: 13.5, color: INK, margin: 0 }}>
        Gmail uses OAuth — click below to authorize access to your Google account. You&apos;ll be redirected back after granting permission.
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        <a
          href="/api/auth/google"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: FONT, fontWeight: 600, fontSize: 13, background: INK, color: '#fff', textDecoration: 'none', padding: '9px 18px', borderRadius: 7 }}
        >
          {connected ? 'Re-authorize Gmail' : 'Connect Gmail'}
        </a>
        {connected && (
          <button
            onClick={async () => {
              if (!confirm('Disconnect Gmail? This will remove your OAuth tokens.')) return
              // Tokens are stored in a file; route the user to re-auth to clear
              alert('To fully disconnect, delete the Gmail token file and re-authorize.')
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: FONT, fontWeight: 600, fontSize: 13, background: '#FFF3E0', color: '#E65100', border: '1px solid #FFCC80', padding: '9px 14px', borderRadius: 7, cursor: 'pointer' }}
          >
            <Trash2 size={13} /> Disconnect
          </button>
        )}
      </div>
    </div>
  )
}

function IntegrationsTab() {
  const [statuses, setStatuses] = useState<Record<string, IntgStatus>>({})
  const [loading, setLoading]   = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [sh, kl, ig, meta, gm] = await Promise.allSettled([
      // Shopify: GET /api/shopify/connect returns { connected, store_url, ... }
      fetch('/api/shopify/connect').then(r => r.json()),
      // Klaviyo: GET /api/klaviyo/connect returns { connected, account_name, ... }
      fetch('/api/klaviyo/connect').then(r => r.json()),
      fetch('/api/instagram/status').then(r => r.json()),
      fetch('/api/meta-ads/status').then(r => r.json()),
      // Gmail: GET /api/email returns { connected } from loadTokens()
      fetch('/api/email').then(r => r.json()),
    ])

    const val = <T,>(r: PromiseSettledResult<T>) => r.status === 'fulfilled' ? r.value : null

    const shopify = val(sh) as { connected?: boolean; store_url?: string; last_synced_at?: string } | null
    const klaviyo = val(kl) as { connected?: boolean; account_name?: string; last_synced_at?: string } | null
    const instagram = val(ig) as { connected?: boolean; username?: string; reason?: string; ig_user_id?: string } | null
    const metaAds = val(meta) as { connected?: boolean; account_name?: string } | null
    const gmail = val(gm) as { connected?: boolean } | null

    setStatuses({
      shopify:   { connected: !!shopify?.connected,   detail: shopify?.store_url,            lastSynced: shopify?.last_synced_at },
      klaviyo:   { connected: !!klaviyo?.connected,   detail: klaviyo?.account_name,         lastSynced: klaviyo?.last_synced_at },
      instagram: { connected: !!instagram?.connected, detail: instagram?.reason === 'token_expired' ? 'Token expired — paste a new one' : instagram?.username ? `@${instagram.username}` : undefined, savedUserId: instagram?.ig_user_id },
      meta_ads:  { connected: !!metaAds?.connected,   detail: metaAds?.account_name },
      gmail:     { connected: !!gmail?.connected },
    })
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const refresh = () => load()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontFamily: FONT, fontSize: 13.5, color: INK_LIGHT, margin: 0 }}>
          Connect your tools. Click Configure to expand setup options inline.
        </p>
        <button onClick={refresh} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: INK_LIGHT, background: 'transparent', border: BORDER, padding: '6px 12px', borderRadius: 7, cursor: 'pointer' }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <IntegrationRow name="Shopify" desc="Orders, products, revenue, inventory sync" color="#96BF48" status={statuses.shopify ?? { connected: false }} loading={loading}
        configPanel={<ShopifyConfig onConnected={refresh} />}
      />
      <IntegrationRow name="Klaviyo" desc="Email lists, campaigns, flows, metrics" color="#1B5E20" status={statuses.klaviyo ?? { connected: false }} loading={loading}
        configPanel={<KlaviyoConfig onConnected={refresh} />}
      />
      <IntegrationRow name="Instagram" desc="Post analytics, engagement, reach data" color="#E1306C" status={statuses.instagram ?? { connected: false }} loading={loading}
        configPanel={<InstagramConfig connected={!!statuses.instagram?.connected} savedUserId={statuses.instagram?.savedUserId} onConnected={refresh} />}
      />
      <IntegrationRow name="Meta Ads" desc="Ad spend, impressions, conversions" color="#1877F2" status={statuses.meta_ads ?? { connected: false }} loading={loading}
        configPanel={<MetaAdsConfig connected={!!statuses.meta_ads?.connected} onConnected={refresh} />}
      />
      <IntegrationRow name="Gmail" desc="Email inbox sync and AI-powered triage" color="#EA4335" status={statuses.gmail ?? { connected: false }} loading={loading}
        configPanel={<GmailConfig connected={!!statuses.gmail?.connected} />}
      />
    </div>
  )
}

// ─── Data ────────────────────────────────────────
function DataTab() {
  const [exporting, setExporting] = useState<string | null>(null)

  async function exportCsv(endpoint: string, filename: string) {
    setExporting(filename)
    try {
      const res = await fetch(endpoint)
      const data = await res.json()
      const rows = Array.isArray(data) ? data : (data.orders ?? data.products ?? data.contacts ?? data.tasks ?? [])
      if (!rows.length) { alert('No data to export.'); return }
      const headers = Object.keys(rows[0])
      const csv = [headers.join(','), ...rows.map((row: Record<string, unknown>) => headers.map(h => JSON.stringify(row[h] ?? '')).join(','))].join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    } catch { alert('Export failed.') }
    finally { setExporting(null) }
  }

  const exports = [
    { label: 'Orders (Shopify)',   desc: 'All synced orders with line items and totals',        endpoint: '/api/shopify/orders',   file: 'wdp-orders.csv'   },
    { label: 'Products',           desc: 'Product catalog with pricing and inventory levels',    endpoint: '/api/shopify/products', file: 'wdp-products.csv' },
    { label: 'Contacts',           desc: 'All contacts with email, tags, and order history',     endpoint: '/api/contacts',         file: 'wdp-contacts.csv' },
    { label: 'Tasks & Projects',   desc: 'All projects and tasks with status and priorities',    endpoint: '/api/projects',         file: 'wdp-tasks.csv'    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={cardStyle()}>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: INK, marginBottom: 4 }}>Export Data</div>
        <p style={{ fontFamily: FONT, fontSize: 13, color: INK_LIGHT, margin: '0 0 18px' }}>
          Download your data as CSV files for backup, analysis, or migration.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {exports.map(exp => (
            <div key={exp.file} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 8, background: CREAM, border: BORDER }}>
              <div>
                <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 13.5, color: INK }}>{exp.label}</div>
                <div style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT }}>{exp.desc}</div>
              </div>
              <button
                onClick={() => exportCsv(exp.endpoint, exp.file)}
                disabled={exporting === exp.file}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontWeight: 600, fontSize: 12.5, background: exporting === exp.file ? MUSHROOM : INK, color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 7, cursor: exporting === exp.file ? 'default' : 'pointer', flexShrink: 0 }}
              >
                <Download size={13} /> {exporting === exp.file ? 'Exporting…' : 'Export CSV'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={cardStyle()}>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: INK, marginBottom: 6 }}>Local Database</div>
        <p style={{ fontFamily: FONT, fontSize: 13, color: INK_LIGHT, margin: 0 }}>
          All data is stored locally in a SQLite database at{' '}
          <code style={{ background: OATMILK, padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>wdp-coo.db</code>{' '}
          in your project directory. No data leaves your machine unless you connect a third-party integration.
        </p>
      </div>

      <div style={cardStyle()}>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: '#C62828', marginBottom: 6 }}>Danger Zone</div>
        <p style={{ fontFamily: FONT, fontSize: 13, color: INK_LIGHT, margin: '0 0 14px' }}>These actions clear cached data and trigger a fresh sync on next visit.</p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => { if (confirm('Clear all cached Shopify data?')) fetch('/api/shopify/sync', { method: 'DELETE' }).then(() => alert('Shopify cache cleared.')).catch(() => alert('Error.')) }}
            style={{ fontFamily: FONT, fontWeight: 600, fontSize: 12.5, background: '#FFF3E0', color: '#E65100', border: '1px solid #FFCC80', padding: '8px 16px', borderRadius: 7, cursor: 'pointer' }}
          >
            Clear Shopify Cache
          </button>
          <button
            onClick={() => { if (confirm('Clear all email cache?')) alert('Visit the Email tab and use the sync controls there to refresh your inbox.') }}
            style={{ fontFamily: FONT, fontWeight: 600, fontSize: 12.5, background: '#FFF3E0', color: '#E65100', border: '1px solid #FFCC80', padding: '8px 16px', borderRadius: 7, cursor: 'pointer' }}
          >
            Clear Email Cache
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main ────────────────────────────────────────
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('Appearance')
  const [settings, setSettings]   = useState<Settings>({})
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(setSettings).catch(() => {})
  }, [])

  async function handleSave(patch: Settings) {
    setSaveState('saving')
    try {
      await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
      setSettings(prev => ({ ...prev, ...patch }))
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2000)
    } catch { setSaveState('idle') }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: CREAM, overflow: 'hidden' }}>
      <div style={{ padding: '28px 32px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div>
            <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: INK_LIGHT, margin: 0 }}>Operations</p>
            <h1 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 600, color: INK, margin: '4px 0 0' }}>Settings</h1>
          </div>
          {saveState === 'saving' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: OATMILK, border: BORDER }}>
              <RefreshCw size={13} color={INK_LIGHT} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontFamily: FONT, fontSize: 12.5, color: INK_LIGHT }}>Saving…</span>
            </div>
          )}
          {saveState === 'saved' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: '#E8F5E9', border: '1px solid #C8E6C9' }}>
              <CheckCircle size={13} color="#2E7D32" />
              <span style={{ fontFamily: FONT, fontSize: 12.5, color: '#2E7D32', fontWeight: 600 }}>Saved</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 20, borderBottom: '1px solid #D8D2C6' }}>
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              fontFamily: FONT, fontSize: 13.5, fontWeight: 600,
              padding: '10px 16px', background: 'transparent', border: 'none',
              borderBottom: activeTab === tab ? '2px solid #2C2C2C' : '2px solid transparent',
              marginBottom: -1, cursor: 'pointer',
              color: activeTab === tab ? '#2C2C2C' : 'rgba(116,116,116,0.7)',
            }}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px 40px' }}>
        {activeTab === 'Appearance'       && <AppearanceTab       settings={settings} onSave={handleSave} />}
        {activeTab === 'Business Profile' && <BusinessProfileTab  settings={settings} onSave={handleSave} />}
        {activeTab === 'Agents'           && <AgentsTab           settings={settings} onSave={handleSave} />}
        {activeTab === 'Integrations'     && <IntegrationsTab />}
        {activeTab === 'Data'             && <DataTab />}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
