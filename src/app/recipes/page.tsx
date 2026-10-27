'use client'

import { useState, useRef, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { FlaskConical, Wand2, RotateCcw, Save, ChevronDown, ChevronRight, ChevronLeft, CheckSquare, Square, Loader2, ChefHat, Clock, Leaf, Utensils, Sparkles, ArrowRight, X, Tag, UtensilsCrossed, Plus, Trash2 } from 'lucide-react'

const FONT = { fontFamily: "'Jost', system-ui, sans-serif" }

const STATIC_BLEND_HEADER = 'Any / Surprise me'

const DIETARY_OPTIONS = [
  'Gluten-free', 'Dairy-free', 'Vegetarian', 'Vegan', 'Nut-free', 'Low-carb',
]

const TIME_OPTIONS = [
  'Under 20 min', '30 minutes', '45 minutes', '60+ minutes',
]

const HEALTH_OPTIONS = [
  'Indulgent', 'Balanced', 'Lighter',
]

interface RecipeData {
  title?: string
  about?: string
  why?: string
  ingredients?: string
  steps?: string
  considerations?: string
  nutrition?: string
  keywords?: string
  seo_heading?: string
  seo_excerpt?: string
}

interface SavedRecipe {
  id: number
  title: string
  tagline?: string | null
  description?: string | null
  blend_used?: string | null
  ingredients?: string | null
  instructions?: string | null
  notes?: string | null
  tags?: string | null
  status: string
  created_at: string
}

const TAG_COLORS = ['terracotta', 'sage', 'blueberry', 'butter', 'mushroom']
const TAG_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  terracotta: { bg: 'rgba(194,122,84,0.12)', text: 'rgb(194,122,84)', border: 'rgba(194,122,84,0.25)' },
  sage:       { bg: 'rgba(106,137,90,0.12)',  text: 'rgb(106,137,90)',  border: 'rgba(106,137,90,0.25)' },
  blueberry:  { bg: 'rgba(92,112,163,0.12)',  text: 'rgb(92,112,163)',  border: 'rgba(92,112,163,0.25)' },
  butter:     { bg: 'rgba(210,170,70,0.12)',  text: 'rgb(165,130,40)',  border: 'rgba(210,170,70,0.3)' },
  mushroom:   { bg: 'rgba(160,148,132,0.15)', text: 'rgb(120,110,95)',  border: 'rgba(160,148,132,0.3)' },
}
function tagColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % TAG_COLORS.length
  return TAG_STYLES[TAG_COLORS[h]]
}
function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

function parseRecipeJson(raw: string): RecipeData | null {
  try {
    const trimmed = raw.trim()
    // Strip markdown fences if present
    const cleaned = trimmed.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}

interface RecipeSlot { role: string; dish: string; blend: string }
const COURSE_ROLES = ['Breakfast', 'Appetizer', 'Soup / Salad', 'Main', 'Side', 'Snack / Bite', 'Dessert', 'Drink', 'Other']

function RecipeLabPage() {
  const searchParams = useSearchParams()
  const [blends, setBlends] = useState<string[]>([])
  const [blend, setBlend] = useState(STATIC_BLEND_HEADER)

  useEffect(() => {
    fetch('/api/recipes/blends')
      .then(r => r.json())
      .then((data: { title: string }[]) => {
        if (Array.isArray(data)) setBlends(data.map(p => p.title))
      })
      .catch(() => {})
  }, [])
  const [protein, setProtein] = useState('')
  const [dietary, setDietary] = useState<string[]>([])
  const [time, setTime] = useState('')
  const [health, setHealth] = useState('Balanced')
  const [notes, setNotes] = useState('')

  const [phase, setPhase] = useState<'idle' | 'generating' | 'done'>('idle')
  const [rawStream, setRawStream] = useState('')
  const [recipe, setRecipe] = useState<RecipeData | null>(null)
  const [activeTab, setActiveTab] = useState<'about' | 'ingredients' | 'steps' | 'notes'>('about')

  const [refineMode, setRefineMode] = useState(false)
  const [refineFeedback, setRefineFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savedRecipes, setSavedRecipes] = useState<SavedRecipe[]>([])
  const [selectedCard, setSelectedCard] = useState<number | null>(null)
  const [cardTab, setCardTab] = useState<'overview' | 'ingredients' | 'steps' | 'notes'>('overview')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [panelCollapsed, setPanelCollapsed] = useState(typeof window !== 'undefined' && window.innerWidth < 768)
  const [addingIngredient, setAddingIngredient] = useState(false)
  const [newIngredientValue, setNewIngredientValue] = useState('')
  const [addingStep, setAddingStep] = useState(false)
  const [newStepValue, setNewStepValue] = useState('')
  const [dragIngredient, setDragIngredient] = useState<number | null>(null)
  const [dragOverIngredient, setDragOverIngredient] = useState<number | null>(null)
  const [dragStep, setDragStep] = useState<number | null>(null)
  const [dragOverStep, setDragOverStep] = useState<number | null>(null)
  const [tagPickerFor, setTagPickerFor] = useState<number | null>(null)
  const [newTagInput, setNewTagInput] = useState('')
  const [regenCardId, setRegenCardId] = useState<number | null>(null)
  const [regenFeedback, setRegenFeedback] = useState('')
  const [regenLoading, setRegenLoading] = useState(false)

  // Menu mode state
  const [menuMode, setMenuMode] = useState(false)
  const [menuTheme, setMenuTheme] = useState('')
  const [menuNotes, setMenuNotes] = useState('')
  const [menuBlends, setMenuBlends] = useState<string[]>([])           // selected hero blends
  const [menuRecipes, setMenuRecipes] = useState<RecipeSlot[]>([])
  const [menuDietary, setMenuDietary] = useState<string[]>([])
  const [menuPhase, setMenuPhase] = useState<'idle' | 'generating' | 'done' | 'error'>('idle')
  const [menuError, setMenuError] = useState('')
  const [menuResults, setMenuResults] = useState<RecipeData[]>([])
  const [menuSaving, setMenuSaving] = useState(false)
  const [menuSaved, setMenuSaved] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const menuSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuPlanLoaded = useRef(false)

  const allKnownTags = Array.from(new Set(savedRecipes.flatMap(r => parseTags(r.tags)))).sort()

  async function toggleTag(recipeId: number, tag: string) {
    const recipe = savedRecipes.find(r => r.id === recipeId)
    if (!recipe) return
    const current = parseTags(recipe.tags)
    const next = current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag]
    updateField(recipeId, 'tags', JSON.stringify(next))
  }

  useEffect(() => {
    loadSavedRecipes()
    // Load persisted menu plan
    fetch('/api/recipes/menu-plan')
      .then(r => r.json())
      .then((d: { theme: string; notes: string; blends: string[]; recipes: { role: string; dish: string; blend: string }[] }) => {
        if (d.theme || d.recipes?.length) {
          setMenuTheme(d.theme ?? '')
          setMenuNotes(d.notes ?? '')
          setMenuBlends(d.blends ?? [])
          setMenuRecipes(d.recipes ?? [])
        }
        menuPlanLoaded.current = true
      })
      .catch(() => { menuPlanLoaded.current = true })
  }, [])

  // Auto-save menu plan (debounced 1s)
  useEffect(() => {
    if (!menuPlanLoaded.current) return
    if (menuSaveTimer.current) clearTimeout(menuSaveTimer.current)
    menuSaveTimer.current = setTimeout(() => {
      fetch('/api/recipes/menu-plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: menuTheme, notes: menuNotes, blends: menuBlends, recipes: menuRecipes }),
      }).catch(() => {})
    }, 1000)
  }, [menuTheme, menuNotes, menuBlends, menuRecipes])

  useEffect(() => {
    if (tagPickerFor === null) return
    function handleOutside(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest('[data-tag-picker]')) {
        setTagPickerFor(null)
        setNewTagInput('')
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [tagPickerFor])

  function loadSavedRecipes() {
    fetch('/api/recipes')
      .then(r => r.json())
      .then((d: { recipes: SavedRecipe[] }) => setSavedRecipes(d.recipes ?? []))
      .catch(() => {})
  }

  // Pre-fill notes from ?idea param (sent by Docs "→ Recipe Lab" button) and auto-generate
  const ideaHandled = useRef(false)
  useEffect(() => {
    const idea = searchParams.get('idea')
    if (idea && !ideaHandled.current) {
      ideaHandled.current = true
      setNotes(idea)
      // Small delay so blends have time to load
      setTimeout(() => generate(false, idea), 400)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const generateMenu = useCallback(async () => {
    if (!menuTheme.trim() || menuRecipes.length === 0 || menuPhase === 'generating') return
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setMenuPhase('generating')
    setMenuError('')
    setMenuResults([])
    setMenuSaved(false)

    try {
      const res = await fetch('/api/recipes/generate-menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          theme: menuTheme + (menuNotes ? `\n\n${menuNotes}` : ''),
          featuredBlends: menuBlends,
          courses: menuRecipes.map(r => ({
            blend: r.blend || undefined,
            role: r.role,
            notes: r.dish || undefined,
          })),
          dietary: menuDietary.length ? menuDietary : undefined,
        }),
      })
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '')
        throw new Error(`Server error ${res.status}: ${text.slice(0, 200)}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
      }

      try {
        const cleaned = accumulated.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
        const parsed = JSON.parse(cleaned) as RecipeData[]
        if (Array.isArray(parsed)) {
          setMenuResults(parsed)
          setMenuPhase('done')
        } else {
          throw new Error('Response was not a JSON array')
        }
      } catch (parseErr) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr)
        setMenuError(`Couldn't parse recipes: ${msg}. Try again — Claude occasionally returns malformed JSON for large menus.`)
        setMenuPhase('error')
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      setMenuError(err instanceof Error ? err.message : 'Unknown error')
      setMenuPhase('error')
    }
  }, [menuTheme, menuNotes, menuBlends, menuRecipes, menuDietary, menuPhase])

  async function saveMenuToLab() {
    if (!menuResults.length) return
    setMenuSaving(true)
    try {
      for (const r of menuResults) {
        await fetch('/api/recipes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: r.title,
            tagline: r.keywords ?? null,
            description: r.about ?? null,
            blend_used: (r as RecipeData & { blend_used?: string }).blend_used ?? null,
            ingredients: r.ingredients ?? null,
            instructions: r.steps ?? null,
            notes: [
              r.why            ? `### Why You'll Love It\n${r.why}` : null,
              r.considerations ? `### Tips & Considerations\n${r.considerations}` : null,
              r.nutrition      ? `### Nutrition\n${r.nutrition}` : null,
              r.seo_heading    ? `### SEO Heading\n${r.seo_heading}` : null,
              r.seo_excerpt    ? `### SEO Excerpt\n${r.seo_excerpt}` : null,
            ].filter(Boolean).join('\n\n'),
            status: 'draft',
          }),
        })
      }
      setMenuSaved(true)
      loadSavedRecipes()
    } finally {
      setMenuSaving(false)
    }
  }

  async function deleteRecipe(id: number) {
    await fetch(`/api/recipes?id=${id}`, { method: 'DELETE' })
    setSavedRecipes(prev => prev.filter(r => r.id !== id))
    if (selectedCard === id) setSelectedCard(null)
  }

  async function updateStatus(id: number, status: string) {
    await fetch(`/api/recipes?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setSavedRecipes(prev => prev.map(r => r.id === id ? { ...r, status } : r))
  }

  async function updateField(id: number, field: string, value: string) {
    setSavedRecipes(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
    await fetch(`/api/recipes?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
  }

  // Rebuild the full notes string after editing one section
  function updateNoteSection(id: number, header: string, newBody: string, allSections: { header: string; body: string }[]) {
    const updated = allSections.map(s => s.header === header ? { ...s, body: newBody } : s)
    const newNotes = updated.map(s => `### ${s.header}\n${s.body}`).join('\n\n')
    updateField(id, 'notes', newNotes)
  }

  async function regenCard(id: number) {
    const r = savedRecipes.find(rec => rec.id === id)
    if (!r || regenLoading) return
    setRegenLoading(true)
    try {
      const res = await fetch('/api/recipes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blend: r.blend_used ?? '',
          notes: regenFeedback,
          refineContext: JSON.stringify({
            title: r.title,
            about: r.description,
            ingredients: r.ingredients,
            steps: r.instructions,
            notes: r.notes,
            blend_used: r.blend_used,
          }),
        }),
      })
      if (!res.ok || !res.body) throw new Error('Server error')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let raw = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        raw += decoder.decode(value, { stream: true })
      }
      const cleaned = raw.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
      const parsed = JSON.parse(cleaned)
      if (parsed && typeof parsed === 'object') {
        if (parsed.title) await updateField(id, 'title', parsed.title)
        if (parsed.about) await updateField(id, 'description', parsed.about)
        if (parsed.ingredients) await updateField(id, 'ingredients', parsed.ingredients)
        if (parsed.steps) await updateField(id, 'instructions', parsed.steps)
        if (parsed.considerations || parsed.why) {
          const sections: string[] = []
          if (parsed.why) sections.push(`### Why You'll Love It\n${parsed.why}`)
          if (parsed.considerations) sections.push(`### Considerations\n${parsed.considerations}`)
          if (parsed.seo_heading) sections.push(`### SEO Heading\n${parsed.seo_heading}`)
          if (parsed.seo_excerpt) sections.push(`### SEO Excerpt\n${parsed.seo_excerpt}`)
          if (sections.length) await updateField(id, 'notes', sections.join('\n\n'))
        }
        if (parsed.blend_used) await updateField(id, 'blend_used', parsed.blend_used)
        setRegenCardId(null)
        setRegenFeedback('')
      }
    } catch {
      // leave panel open so user can retry
    } finally {
      setRegenLoading(false)
    }
  }

  function toggleDietary(opt: string) {
    setDietary(prev => prev.includes(opt) ? prev.filter(d => d !== opt) : [...prev, opt])
  }

  async function generate(isRefine = false, ideaNotes?: string) {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setPhase('generating')
    setRawStream('')
    setRecipe(null)
    setSaved(false)

    try {
      const res = await fetch('/api/recipes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          blend: blend === 'Any / Surprise me' ? 'any' : blend,
          protein,
          dietary,
          time,
          health,
          notes: isRefine ? refineFeedback : (ideaNotes ?? notes),
          refineContext: isRefine && recipe ? JSON.stringify(recipe) : undefined,
        }),
      })

      if (!res.ok) throw new Error('Generation failed')
      if (!res.body) throw new Error('No stream')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setRawStream(accumulated)
      }

      const parsed = parseRecipeJson(accumulated)
      if (parsed) {
        setRecipe(parsed)
        setPhase('done')
        setRefineMode(false)
        setRefineFeedback('')
        setActiveTab('about')
      } else {
        setPhase('done')
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setPhase('idle')
      }
    }
  }

  async function saveToLab() {
    if (!recipe?.title) return
    setSaving(true)
    try {
      const res = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: recipe.title,
          tagline: recipe.keywords ?? null,
          description: recipe.about ?? null,
          blend_used: blend !== STATIC_BLEND_HEADER ? blend : null,
          ingredients: recipe.ingredients ?? null,
          instructions: recipe.steps ?? null,
          // Store extended fields as labeled sections so they can be displayed in the card
          notes: [
            recipe.why            ? `### Why You'll Love It\n${recipe.why}` : null,
            recipe.considerations ? `### Tips & Considerations\n${recipe.considerations}` : null,
            recipe.nutrition      ? `### Nutrition\n${recipe.nutrition}` : null,
            recipe.seo_heading    ? `### SEO Heading\n${recipe.seo_heading}` : null,
            recipe.seo_excerpt    ? `### SEO Excerpt\n${recipe.seo_excerpt}` : null,
          ].filter(Boolean).join('\n\n'),
          status: 'draft',
        }),
      })
      if (res.ok) {
        const saved = await res.json() as { id?: number }
        setSaved(true)
        loadSavedRecipes()
        // Auto-transition back to the lab after 1.2s so the card appears immediately
        setTimeout(() => {
          setPhase('idle')
          setRecipe(null)
          setSaved(false)
          if (saved.id) { setSelectedCard(saved.id); setCardTab('overview') }
        }, 1200)
      }
    } finally {
      setSaving(false)
    }
  }

  const isGenerating = phase === 'generating'
  const hasDraft = phase === 'done' && recipe

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--wdp-ground)', color: 'var(--wdp-ink)', ...FONT }}>
      {/* Header */}
      <div className="px-4 md:px-8 py-4 md:py-6 flex items-center gap-3 flex-wrap" style={{ borderBottom: '1px solid var(--wdp-border)' }}>
        <div className="w-8 h-8 rounded-lg bg-terracotta/10 flex items-center justify-center">
          <FlaskConical className="w-4 h-4 text-terracotta" strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--wdp-ink)' }}>Recipe Lab</h1>
          <p className="text-xs" style={{ color: 'var(--wdp-ink-mid)' }}>Generate new recipes featuring your spice blends</p>
        </div>
        <button
          onClick={() => { setMenuMode(m => !m); setMenuPhase('idle'); setMenuResults([]) }}
          className="ml-4 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all"
          style={menuMode
            ? { background: 'rgb(194,122,84)', color: '#fff', border: '1px solid rgb(194,122,84)' }
            : { color: 'rgb(194,122,84)', border: '1px solid rgba(194,122,84,0.4)', background: 'rgba(194,122,84,0.07)' }
          }
        >
          <UtensilsCrossed className="w-3.5 h-3.5" />
          {menuMode ? 'Exit Menu Planner' : 'Plan a Menu'}
        </button>
        {hasDraft && !menuMode && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setRefineMode(r => !r)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all"
              style={{ color: 'var(--wdp-ink-mid)', border: '1px solid var(--wdp-border)' }}
            >
              <Wand2 className="w-3.5 h-3.5" />
              Refine
            </button>
            <button
              onClick={() => generate(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all"
              style={{ color: 'var(--wdp-ink-mid)', border: '1px solid var(--wdp-border)' }}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Regenerate
            </button>
            <button
              onClick={saveToLab}
              disabled={saving || saved}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                saved
                  ? 'bg-sage/20 text-sage border border-sage/30'
                  : 'bg-terracotta text-cream hover:bg-terracotta/90'
              }`}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saved ? 'Saved to Lab' : 'Save to Lab'}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row flex-1 min-h-0">
        {/* LEFT: Criteria Panel */}
        <div
          className={`shrink-0 flex flex-col overflow-y-auto transition-all duration-200 ${panelCollapsed ? 'w-full md:w-10 max-h-10 md:max-h-none' : 'w-full md:w-72 max-h-64 md:max-h-none'}`}
          style={{ borderRight: '1px solid var(--wdp-border)', background: 'var(--wdp-surface)', boxShadow: '2px 0 8px rgba(0,0,0,0.04)' }}
        >
          {/* Collapse toggle */}
          <div className="flex items-center justify-end px-2 pt-3 pb-1 shrink-0" style={{ borderBottom: panelCollapsed ? 'none' : '1px solid var(--wdp-border2)' }}>
            <button
              onClick={() => setPanelCollapsed(c => !c)}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--wdp-ink-dim)' }}
              title={panelCollapsed ? 'Expand panel' : 'Collapse panel'}
            >
              {panelCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          {/* Collapsed state: vertical label */}
          {panelCollapsed && (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 py-4">
              <span
                className="text-[9px] font-bold uppercase tracking-widest"
                style={{ color: 'var(--wdp-ink-dim)', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
              >Recipe Lab</span>
            </div>
          )}

          {!panelCollapsed && (<>

          {/* ── Menu Mode Panel ── */}
          {menuMode && (
            <div className="flex flex-col flex-1 overflow-y-auto">
              <div className="p-4 space-y-4">

                {/* Occasion + notes */}
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--wdp-ink-mid)' }}>Occasion</label>
                  <input
                    value={menuTheme}
                    onChange={e => setMenuTheme(e.target.value)}
                    placeholder="e.g. Holiday dinner party, cozy December…"
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ ...FONT, background: 'var(--wdp-surface2)', border: '1px solid var(--wdp-border)', color: 'var(--wdp-ink)' }}
                  />
                  <textarea
                    value={menuNotes}
                    onChange={e => setMenuNotes(e.target.value)}
                    placeholder="Any notes — vibe, guest count, timing…"
                    rows={2}
                    className="w-full rounded-lg px-3 py-2 text-xs outline-none resize-none"
                    style={{ ...FONT, background: 'var(--wdp-surface2)', border: '1px solid var(--wdp-border)', color: 'var(--wdp-ink)' }}
                  />
                </div>

                {/* Featured blends */}
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider block mb-2" style={{ color: 'var(--wdp-ink-mid)' }}>Featured Blends</label>
                  <div className="flex flex-wrap gap-1.5">
                    {blends.map(b => {
                      const on = menuBlends.includes(b)
                      return (
                        <button
                          key={b}
                          onClick={() => setMenuBlends(prev => on ? prev.filter(x => x !== b) : [...prev, b])}
                          className="px-2.5 py-1 rounded-full text-xs font-medium transition-all border"
                          style={on
                            ? { background: 'rgb(194,122,84)', color: '#fff', borderColor: 'rgb(194,122,84)' }
                            : { background: 'var(--wdp-surface2)', color: 'var(--wdp-ink-mid)', borderColor: 'var(--wdp-border)' }
                          }
                        >{b}</button>
                      )
                    })}
                  </div>
                  {menuBlends.length === 0 && (
                    <p className="text-[10px] mt-1.5" style={{ color: 'var(--wdp-ink-dim)' }}>Pick the blends that anchor this menu</p>
                  )}
                </div>

                {/* Course sections */}
                {(() => {
                  const sections = menuRecipes.reduce<string[]>((acc, r) => acc.includes(r.role) ? acc : [...acc, r.role], [])
                  const addDish = (role: string) => setMenuRecipes(prev => {
                    const lastIdx = prev.reduce((acc, r, i) => r.role === role ? i : acc, -1)
                    const next = [...prev]
                    next.splice(lastIdx + 1, 0, { role, dish: '', blend: '' })
                    return next
                  })
                  const unusedRoles = COURSE_ROLES.filter(r => !sections.includes(r))
                  return (
                    <div className="space-y-3">
                      {sections.map(role => (
                        <div key={role}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-bold" style={{ color: 'var(--wdp-ink)' }}>{role}</span>
                            <button
                              onClick={() => addDish(role)}
                              className="flex items-center gap-0.5 text-[10px] font-medium"
                              style={{ color: 'rgb(194,122,84)', background: 'none', border: 'none', cursor: 'pointer' }}
                            ><Plus className="w-2.5 h-2.5" /> dish</button>
                          </div>
                          <div className="space-y-1">
                            {menuRecipes.map((r, i) => r.role !== role ? null : (
                              <div key={i} className="flex items-center gap-1.5">
                                <input
                                  value={r.dish}
                                  onChange={e => setMenuRecipes(prev => prev.map((x, j) => j === i ? { ...x, dish: e.target.value } : x))}
                                  placeholder="Dish name…"
                                  className="flex-1 text-xs rounded px-2.5 py-1.5 outline-none min-w-0"
                                  style={{ ...FONT, background: 'var(--wdp-surface2)', border: '1px solid var(--wdp-border)', color: 'var(--wdp-ink)' }}
                                />
                                {menuBlends.length > 0 && (
                                  <select
                                    value={r.blend}
                                    onChange={e => setMenuRecipes(prev => prev.map((x, j) => j === i ? { ...x, blend: e.target.value } : x))}
                                    className="text-[10px] rounded px-1.5 py-1.5 outline-none shrink-0"
                                    style={{ ...FONT, background: 'var(--wdp-surface2)', border: '1px solid var(--wdp-border)', color: r.blend ? 'var(--wdp-ink)' : 'var(--wdp-ink-dim)', maxWidth: 88 }}
                                  >
                                    <option value="">AI picks</option>
                                    {menuBlends.map(b => <option key={b} value={b}>{b}</option>)}
                                  </select>
                                )}
                                <button
                                  onClick={() => setMenuRecipes(prev => prev.filter((_, j) => j !== i))}
                                  style={{ color: 'var(--wdp-ink-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px', flexShrink: 0 }}
                                ><X className="w-3 h-3" /></button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}

                      {/* Add course */}
                      {unusedRoles.length > 0 && (
                        <div>
                          <div className="text-[10px] mb-1.5" style={{ color: 'var(--wdp-ink-dim)' }}>Add a course</div>
                          <div className="flex flex-wrap gap-1">
                            {unusedRoles.map(role => (
                              <button
                                key={role}
                                onClick={() => setMenuRecipes(prev => [...prev, { role, dish: '', blend: '' }])}
                                className="flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-medium"
                                style={{ color: 'var(--wdp-ink-mid)', background: 'var(--wdp-surface2)', border: '1px solid var(--wdp-border)', cursor: 'pointer' }}
                              ><Plus className="w-2.5 h-2.5" />{role}</button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}

              </div>

              <div className="px-4 pb-4 mt-auto space-y-2">
                {menuPhase === 'done' && !menuSaved && (
                  <button
                    onClick={saveMenuToLab}
                    disabled={menuSaving}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all"
                    style={{ background: 'rgba(194,122,84,0.12)', color: 'rgb(194,122,84)', border: '1px solid rgba(194,122,84,0.3)' }}
                  >
                    {menuSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Save all {menuResults.length} recipes to Lab
                  </button>
                )}
                {menuSaved && (
                  <div className="text-center text-xs font-medium py-2" style={{ color: 'rgb(106,137,90)' }}>✓ {menuResults.length} recipes saved to Lab</div>
                )}
                <button
                  onClick={() => { if (menuPhase === 'error') setMenuPhase('idle'); generateMenu() }}
                  disabled={!menuTheme.trim() || menuBlends.length === 0 || menuRecipes.length === 0 || menuPhase === 'generating'}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                  style={{ background: 'rgb(194,122,84)', color: '#fff' }}
                >
                  {menuPhase === 'generating'
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Generating {menuRecipes.length} recipes…</>
                    : menuPhase === 'error'
                    ? <><UtensilsCrossed className="w-4 h-4" />Retry</>
                    : <><UtensilsCrossed className="w-4 h-4" />Generate {menuRecipes.length} Recipes</>
                  }
                </button>
                {menuBlends.length === 0 && menuTheme && (
                  <p className="text-center text-[10px]" style={{ color: 'var(--wdp-ink-dim)' }}>Select at least one featured blend to continue</p>
                )}
              </div>
            </div>
          )}

          {/* ── Single Recipe Panel ── */}
          {!menuMode && <><div className="p-5 space-y-5">
            {/* Spice Blend */}
            <Field label="Spice Blend" icon={<Sparkles className="w-3.5 h-3.5" />}>
              <div className="relative">
                <select
                  value={blend}
                  onChange={e => setBlend(e.target.value)}
                  className="w-full appearance-none rounded-lg px-3 py-2 text-sm outline-none cursor-pointer"
                  style={{ ...FONT, background: 'var(--wdp-surface2)', border: '1px solid var(--wdp-border)', color: 'var(--wdp-ink)' }}
                >
                  <option value={STATIC_BLEND_HEADER}>{STATIC_BLEND_HEADER}</option>
                  {blends.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink/40 pointer-events-none" />
              </div>
            </Field>

            {/* Main Protein / Star Ingredient */}
            <Field label="Main Ingredient" icon={<Utensils className="w-3.5 h-3.5" />}>
              <input
                value={protein}
                onChange={e => setProtein(e.target.value)}
                placeholder="e.g. chicken thighs, salmon, pasta…"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ ...FONT, background: 'var(--wdp-surface2)', border: '1px solid var(--wdp-border)', color: 'var(--wdp-ink)' }}
              />
            </Field>

            {/* Time */}
            <Field label="Time Constraint" icon={<Clock className="w-3.5 h-3.5" />}>
              <div className="flex flex-wrap gap-1.5">
                {TIME_OPTIONS.map(t => (
                  <button
                    key={t}
                    onClick={() => setTime(prev => prev === t ? '' : t)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                      time === t
                        ? 'bg-terracotta text-cream border-terracotta'
                        : 'bg-oatmilk/60 text-ink/60 border-mushroom/60 hover:border-terracotta/40 hover:text-ink-dark'
                    }`}
                    style={FONT}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Field>

            {/* Health Level */}
            <Field label="Health Level" icon={<Leaf className="w-3.5 h-3.5" />}>
              <div className="flex gap-1.5">
                {HEALTH_OPTIONS.map(h => (
                  <button
                    key={h}
                    onClick={() => setHealth(h)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                      health === h
                        ? 'bg-sage text-cream border-sage'
                        : 'bg-oatmilk/60 text-ink/60 border-mushroom/60 hover:border-sage/40 hover:text-ink-dark'
                    }`}
                    style={FONT}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </Field>

            {/* Dietary */}
            <Field label="Dietary Needs" icon={<ChefHat className="w-3.5 h-3.5" />}>
              <div className="space-y-1.5">
                {DIETARY_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    onClick={() => toggleDietary(opt)}
                    className="w-full flex items-center gap-2 py-1 text-left hover:text-ink-dark transition-colors"
                    style={FONT}
                  >
                    {dietary.includes(opt)
                      ? <CheckSquare className="w-3.5 h-3.5 text-terracotta shrink-0" />
                      : <Square className="w-3.5 h-3.5 text-ink/30 shrink-0" />
                    }
                    <span className={`text-xs ${dietary.includes(opt) ? 'text-ink-dark font-medium' : 'text-ink/60'}`}>{opt}</span>
                  </button>
                ))}
              </div>
            </Field>

            {/* Notes */}
            <Field label="Additional Notes" icon={null}>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any special requests, vibe, occasion, etc…"
                rows={3}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                style={{ ...FONT, background: 'var(--wdp-surface2)', border: '1px solid var(--wdp-border)', color: 'var(--wdp-ink)' }}
              />
            </Field>
          </div>

          {/* Generate Button */}
          <div className="px-5 pb-5 mt-auto">
            <button
              onClick={() => generate(false)}
              disabled={isGenerating}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-terracotta text-cream rounded-xl text-sm font-semibold hover:bg-terracotta/90 transition-all disabled:opacity-60"
              style={FONT}
            >
              {isGenerating ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Generating…</>
              ) : (
                <><FlaskConical className="w-4 h-4" />Generate Recipe</>
              )}
            </button>
          </div>
          </>}
          </>)}
        </div>

        {/* RIGHT: Recipe Output / Lab */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden md:overflow-hidden overflow-y-auto" style={{ background: 'var(--wdp-ground)' }}>

          {/* ── Menu Output ── */}
          {menuMode && (
            <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-8">
              {menuPhase === 'idle' && (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center" style={{ color: 'var(--wdp-ink-dim)' }}>
                  <UtensilsCrossed className="w-10 h-10 opacity-20" />
                  <p className="text-sm">Enter a theme and courses, then generate a cohesive menu.</p>
                </div>
              )}
              {menuPhase === 'generating' && (
                <div className="flex flex-col items-center justify-center h-full gap-4" style={{ color: 'var(--wdp-ink-dim)' }}>
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'rgb(194,122,84)' }} />
                  <p className="text-sm">Crafting {menuRecipes.length} recipes — takes 1–2 minutes for large menus…</p>
                </div>
              )}
              {menuPhase === 'error' && (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
                  <p className="text-sm font-semibold" style={{ color: 'var(--wdp-ink)' }}>Generation failed</p>
                  <p className="text-xs" style={{ color: 'var(--wdp-ink-mid)' }}>{menuError}</p>
                  <button
                    onClick={generateMenu}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold"
                    style={{ background: 'rgb(194,122,84)', color: '#fff' }}
                  >Try again</button>
                </div>
              )}
              {menuPhase === 'done' && menuResults.length > 0 && (
                <div className="space-y-8 max-w-3xl mx-auto">
                  <div>
                    <h2 className="text-2xl font-semibold mb-1" style={{ color: 'var(--wdp-ink)', fontFamily: "'Cormorant Garamond', Georgia, serif" }}>{menuTheme}</h2>
                    <p className="text-xs" style={{ color: 'var(--wdp-ink-mid)' }}>{menuResults.length} courses · {menuSaved ? 'Saved to Lab' : 'Not yet saved'}</p>
                  </div>
                  {menuResults.map((r, i) => {
                    const courseRole = (r as RecipeData & { course_role?: string }).course_role
                    return (
                      <div key={i} className="rounded-2xl p-6 space-y-4" style={{ background: 'var(--wdp-surface)', border: '1px solid var(--wdp-border)' }}>
                        <div className="flex items-start gap-3">
                          <div className="text-[10px] font-bold uppercase tracking-widest mt-1 px-2 py-0.5 rounded" style={{ background: 'rgba(194,122,84,0.1)', color: 'rgb(194,122,84)' }}>
                            {courseRole ?? `Course ${i + 1}`}
                          </div>
                        </div>
                        <h3 className="text-xl font-semibold" style={{ color: 'var(--wdp-ink)', fontFamily: "'Cormorant Garamond', Georgia, serif" }}>{r.title}</h3>
                        {r.about && <p className="text-sm leading-relaxed" style={{ color: 'var(--wdp-ink-mid)' }}>{r.about.split('\n')[0]}</p>}
                        <div className="grid grid-cols-2 gap-4 pt-2">
                          {r.ingredients && (
                            <div>
                              <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--wdp-ink-dim)' }}>Ingredients</div>
                              <div className="text-xs space-y-0.5" style={{ color: 'var(--wdp-ink-mid)' }}>
                                {r.ingredients.split('\n').slice(0, 6).map((line, j) => <div key={j}>{line}</div>)}
                                {r.ingredients.split('\n').length > 6 && <div className="opacity-60">+{r.ingredients.split('\n').length - 6} more…</div>}
                              </div>
                            </div>
                          )}
                          {r.why && (
                            <div>
                              <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--wdp-ink-dim)' }}>Why it works</div>
                              <div className="text-xs space-y-0.5" style={{ color: 'var(--wdp-ink-mid)' }}>
                                {r.why.split('\n').slice(0, 4).map((line, j) => <div key={j}>{line}</div>)}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {!menuMode && phase === 'idle' && (
            <>
              {/* Card list */}
              <div className={`flex flex-col overflow-y-auto transition-all ${selectedCard ? 'w-full md:w-[40%] md:shrink-0' : 'flex-1'}`} style={{ borderRight: selectedCard ? '1px solid var(--wdp-border)' : 'none' }}>
                {savedRecipes.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center px-10 py-16 gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-terracotta/8 flex items-center justify-center">
                      <FlaskConical className="w-5 h-5 text-terracotta/40" strokeWidth={1.5} />
                    </div>
                    <p className="text-sm font-semibold text-ink-dark">Your lab is empty</p>
                    <p className="text-xs text-ink/40 max-w-xs">Generate a recipe and hit Save to Lab — it'll appear here as a card.</p>
                  </div>
                ) : (
                  <div className="p-5">
                    <p className="text-[10px] font-bold uppercase tracking-widest px-1 pb-3" style={{ color: 'var(--wdp-ink-mid)' }}>Saved Recipes · {savedRecipes.length}</p>
                    <div className={`grid gap-3 ${selectedCard ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-3'}`}>
                    {savedRecipes.map(r => {
                      const isSelected = selectedCard === r.id
                      return (
                        <div
                          key={r.id}
                          onClick={e => { if ((e.target as HTMLElement).closest('[data-tag-picker]')) return; setSelectedCard(isSelected ? null : r.id); setCardTab('overview') }}
                          className="text-left rounded-xl border p-3 transition-all cursor-pointer"
                          style={{
                            ...FONT,
                            background: isSelected ? 'var(--wdp-accent-dim)' : 'var(--wdp-surface)',
                            borderColor: isSelected ? 'var(--wdp-accent)' : 'var(--wdp-border)',
                            boxShadow: isSelected ? 'none' : 'var(--wdp-shadow)',
                          }}
                        >
                          {/* Accent strip */}
                          <div className={`w-6 h-0.5 rounded-full mb-2 ${isSelected ? 'bg-terracotta' : 'bg-mushroom'}`} />
                          {/* Title + tags on same line */}
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-semibold leading-snug flex-1 min-w-0" style={{ color: 'var(--wdp-ink)' }}>{r.title}</p>
                            {/* Tags inline */}
                            <div
                              className="flex flex-wrap items-center justify-end gap-1 relative shrink-0"
                              onClick={e => e.stopPropagation()}
                            >
                            {parseTags(r.tags).map(tag => {
                              const s = tagColor(tag)
                              return (
                                <span
                                  key={tag}
                                  style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}`, fontFamily: FONT.fontFamily }}
                                  className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                                >
                                  {tag}
                                </span>
                              )
                            })}
                            {/* Tag picker trigger */}
                            <div data-tag-picker className="relative">
                              <button
                                data-tag-picker
                                onClick={e => { e.stopPropagation(); setTagPickerFor(tagPickerFor === r.id ? null : r.id); setNewTagInput('') }}
                                className="flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full transition-colors"
                                style={{ color: 'var(--wdp-ink-dim)', border: '1px dashed var(--wdp-border)' }}
                                title="Add tag"
                              >
                                <Tag size={8} />
                                <span>{parseTags(r.tags).length === 0 ? 'Tag' : '+'}</span>
                              </button>

                              {tagPickerFor === r.id && (
                                <div
                                  data-tag-picker
                                  className="absolute left-0 top-full mt-1 z-50 rounded-xl shadow-lg"
                                  style={{ background: 'var(--wdp-surface)', border: '1px solid var(--wdp-border)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', width: 180, padding: '8px' }}
                                  onClick={e => e.stopPropagation()}
                                >
                                  <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--wdp-ink-mid)' }}>Categories</p>
                                  <div className="space-y-0.5 max-h-40 overflow-y-auto">
                                    {allKnownTags.map(tag => {
                                      const active = parseTags(r.tags).includes(tag)
                                      const s = tagColor(tag)
                                      return (
                                        <button
                                          key={tag}
                                          data-tag-picker
                                          onClick={() => toggleTag(r.id, tag)}
                                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors hover:bg-black/5"
                                          style={FONT}
                                        >
                                          <span
                                            className="w-2 h-2 rounded-full shrink-0 flex items-center justify-center"
                                            style={{ background: active ? s.text : 'transparent', border: `1.5px solid ${s.text}` }}
                                          />
                                          <span className="text-[10px] font-medium flex-1 truncate" style={{ color: 'var(--wdp-ink)' }}>{tag}</span>
                                          {active && <span className="text-[8px] text-terracotta font-bold">✓</span>}
                                        </button>
                                      )
                                    })}
                                    {allKnownTags.length === 0 && (
                                      <p className="text-[10px] px-2 py-1" style={{ color: 'var(--wdp-ink-dim)' }}>No tags yet</p>
                                    )}
                                  </div>
                                  {/* New tag input */}
                                  <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--wdp-border)' }}>
                                    <input
                                      data-tag-picker
                                      autoFocus={allKnownTags.length === 0}
                                      value={newTagInput}
                                      onChange={e => setNewTagInput(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                          const tag = (e.currentTarget as HTMLInputElement).value.trim()
                                          if (tag) {
                                            const current = parseTags(r.tags)
                                            if (!current.includes(tag)) {
                                              updateField(r.id, 'tags', JSON.stringify([...current, tag]))
                                            }
                                            setNewTagInput('')
                                          }
                                        }
                                        if (e.key === 'Escape') { setTagPickerFor(null); setNewTagInput('') }
                                      }}
                                      placeholder="New tag…"
                                      className="w-full text-[10px] rounded-lg px-2 py-1.5 outline-none"
                                      style={{ ...FONT, background: 'var(--wdp-surface2)', border: '1px solid var(--wdp-border)', color: 'var(--wdp-ink)' }}
                                    />
                                    {newTagInput.trim() && (
                                      <p className="text-[9px] mt-1 px-1" style={{ color: 'var(--wdp-ink-dim)' }}>Press Enter to create</p>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                          </div>{/* end title+tags row */}
                          {r.blend_used && (
                            <p className="text-[10px] font-semibold mt-1 truncate" style={{ color: 'var(--wdp-accent)' }}>{r.blend_used}</p>
                          )}

                          <div className="mt-2 flex items-center justify-between gap-1">
                            <p className="text-[10px]" style={{ color: 'var(--wdp-ink-dim)' }}>{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                            <select
                              value={r.status}
                              onClick={e => e.stopPropagation()}
                              onChange={e => { e.stopPropagation(); updateStatus(r.id, e.target.value) }}
                              className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border cursor-pointer outline-none appearance-none ${
                                r.status === 'published'
                                  ? 'bg-sage/15 text-sage border-sage/30'
                                  : 'bg-mushroom/30 text-ink/50 border-mushroom/50'
                              }`}
                              style={FONT}
                            >
                              <option value="draft">Draft</option>
                              <option value="published">Published</option>
                            </select>
                          </div>
                        </div>
                      )
                    })}
                    </div>
                  </div>
                )}
              </div>

              {/* Detail panel */}
              {selectedCard && (() => {
                const r = savedRecipes.find(r => r.id === selectedCard)
                if (!r) return null
                const noteSections = (r.notes ?? '').split(/(?=### )/).filter(Boolean).map(block => {
                  const headerMatch = block.match(/^### (.+)\n/)
                  return { header: headerMatch?.[1] ?? 'Notes', body: block.replace(/^### .+\n/, '').trim() }
                }).filter(s => s.body)
                const seoSection = noteSections.find(s => s.header === 'SEO Heading' || s.header === 'SEO Excerpt')
                const hasSeo = noteSections.some(s => s.header === 'SEO Heading' || s.header === 'SEO Excerpt')
                const closeDetail = () => { setSelectedCard(null); setConfirmDeleteId(null); setRegenCardId(null); setRegenFeedback('') }
                return (
                  <>
                  {/* Mobile backdrop */}
                  <div className="md:hidden fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={closeDetail} />
                  <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col bottom-sheet-wrap recipe-sheet-h md:relative md:bottom-auto md:left-auto md:right-auto md:z-0 md:w-[60%] md:min-h-0 md:h-auto overflow-hidden" style={{ background: 'var(--wdp-surface)' }}>
                    {/* Detail header */}
                    <div className="px-6 pt-4 pb-0" style={{ borderBottom: '1px solid var(--wdp-border)' }}>
                      {/* Top bar: regen + close */}
                      <div className="flex items-center justify-between mb-2">
                        <button
                          onClick={() => {
                            if (regenCardId === r.id) { setRegenCardId(null); setRegenFeedback('') }
                            else { setRegenCardId(r.id); setRegenFeedback('') }
                          }}
                          className={`flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                            regenCardId === r.id
                              ? 'bg-terracotta/10 text-terracotta border-terracotta/30'
                              : 'text-ink/40 border-transparent hover:text-ink-dark hover:bg-mushroom/20 hover:border-mushroom/40'
                          }`}
                          style={FONT}
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Regenerate</span>
                        </button>
                        <button
                          onClick={closeDetail}
                          className="text-ink/30 hover:text-ink/70 transition-colors cursor-pointer p-1 rounded hover:bg-mushroom/30"
                          title="Close"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      {/* Inline regen feedback */}
                      {regenCardId === r.id && (
                        <div className="mb-3 rounded-xl border border-terracotta/20 bg-terracotta/5 p-3 space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-terracotta/60" style={FONT}>What should change?</p>
                          <textarea
                            value={regenFeedback}
                            onChange={e => setRegenFeedback(e.target.value)}
                            placeholder="e.g. make it vegetarian, add more heat, simplify the steps, change the protein to salmon…"
                            rows={2}
                            autoFocus
                            className="w-full text-xs rounded-lg border border-terracotta/20 bg-white/60 px-3 py-2 text-ink-dark placeholder:text-ink/30 resize-none focus:outline-none focus:border-terracotta/40"
                            style={FONT}
                            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) regenCard(r.id) }}
                          />
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => regenCard(r.id)}
                              disabled={regenLoading}
                              className="flex items-center gap-1.5 text-[10px] font-bold text-white bg-terracotta hover:bg-terracotta/90 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                              style={FONT}
                            >
                              {regenLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                              {regenLoading ? 'Regenerating…' : 'Regenerate recipe'}
                            </button>
                            <button
                              onClick={() => { setRegenCardId(null); setRegenFeedback('') }}
                              className="text-[10px] text-ink/40 hover:text-ink cursor-pointer"
                              style={FONT}
                            >Cancel</button>
                          </div>
                        </div>
                      )}
                      {/* Title */}
                      <EditableField
                        value={r.title}
                        onSave={v => updateField(r.id, 'title', v)}
                        className="text-lg font-bold text-ink-dark leading-tight block mb-2"
                        style={FONT}
                      />
                      {/* Blend chip + delete row */}
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          {r.blend_used && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-terracotta/70 bg-terracotta/8 px-2.5 py-1 rounded-full border border-terracotta/15">
                              <Sparkles className="w-2.5 h-2.5" />{r.blend_used}
                            </span>
                          )}
                        </div>
                        {/* Delete with confirmation */}
                        <div className="relative">
                          {confirmDeleteId === r.id ? (
                            <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 shadow-sm">
                              <span className="text-[10px] text-red-600 font-semibold" style={FONT}>Delete?</span>
                              <button
                                onClick={() => { deleteRecipe(r.id); setConfirmDeleteId(null) }}
                                className="text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded transition-colors cursor-pointer"
                                style={FONT}
                              >Yes</button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="text-[10px] text-ink/50 hover:text-ink transition-colors cursor-pointer px-1"
                                style={FONT}
                              >Cancel</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(r.id)}
                              className="text-[10px] text-ink/30 hover:text-red-500 transition-colors cursor-pointer flex items-center gap-1"
                              style={FONT}
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      </div>
                      {/* Tabs */}
                      <div className="flex gap-0">
                        {([
                          { key: 'overview', label: 'Overview' },
                          { key: 'ingredients', label: 'Ingredients' },
                          { key: 'steps', label: 'Steps' },
                          { key: 'notes', label: hasSeo ? 'Tips & SEO' : 'Tips' },
                        ] as const).map(tab => (
                          <button
                            key={tab.key}
                            onClick={() => setCardTab(tab.key)}
                            className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px transition-all ${
                              cardTab === tab.key
                                ? 'border-terracotta text-terracotta'
                                : 'border-transparent text-ink/40 hover:text-ink-dark'
                            }`}
                            style={FONT}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Detail body */}
                    <div className="flex-1 overflow-y-auto p-6" style={{ background: 'var(--wdp-ground)' }}>
                      {cardTab === 'overview' && (
                        <div className="space-y-5 max-w-xl">
                          <EditableField
                            value={r.description ?? ''}
                            onSave={v => updateField(r.id, 'description', v)}
                            multiline
                            className="text-sm text-ink-dark/80 leading-relaxed"
                            style={FONT}
                            placeholder="Add an overview…"
                          />
                          {noteSections.filter(s => s.header === "Why You'll Love It").map((s, i) => (
                            <div key={i} className="rounded-xl p-4" style={{ background: 'var(--wdp-surface2)', border: '1px solid var(--wdp-border)' }}>
                              <p className="text-[10px] font-bold text-ink/40 uppercase tracking-widest mb-2">{s.header}</p>
                              <EditableField
                                value={s.body}
                                onSave={v => updateNoteSection(r.id, s.header, v, noteSections)}
                                multiline
                                className="text-sm text-ink-dark/80 leading-relaxed"
                                style={FONT}
                              />
                            </div>
                          ))}
                          {noteSections.filter(s => s.header === 'Nutrition').map((s, i) => (
                            <div key={i}>
                              <p className="text-[10px] font-bold text-ink/40 uppercase tracking-widest mb-3">Nutrition</p>
                              <NutritionLabel raw={s.body} />
                              <EditableField
                                value={s.body}
                                onSave={v => updateNoteSection(r.id, s.header, v, noteSections)}
                                className="text-xs text-ink/40 mt-2"
                                style={FONT}
                                placeholder="Edit nutrition text…"
                              />
                            </div>
                          ))}
                          {r.tagline && (
                            <div>
                              <p className="text-[10px] font-bold text-ink/40 uppercase tracking-widest mb-2">Keywords</p>
                              <EditableField
                                value={r.tagline}
                                onSave={v => updateField(r.id, 'tagline', v)}
                                className="text-xs text-ink/60"
                                style={FONT}
                                placeholder="Add keywords…"
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {cardTab === 'ingredients' && (
                        <div className="max-w-xl">
                          <p className="text-[10px] font-bold text-ink/30 uppercase tracking-widest mb-3">Click any line to edit · one ingredient per line</p>
                          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--wdp-surface)', border: '1px solid var(--wdp-border)', boxShadow: 'var(--wdp-shadow)' }}>
                            {(r.ingredients ?? '').split('\n').filter(Boolean).map((line, i, arr) => (
                              <div
                                key={i}
                                draggable
                                onDragStart={() => setDragIngredient(i)}
                                onDragOver={e => { e.preventDefault(); setDragOverIngredient(i) }}
                                onDragEnd={() => {
                                  if (dragIngredient !== null && dragOverIngredient !== null && dragIngredient !== dragOverIngredient) {
                                    const updated = [...arr]
                                    const [moved] = updated.splice(dragIngredient, 1)
                                    updated.splice(dragOverIngredient, 0, moved)
                                    updateField(r.id, 'ingredients', updated.join('\n'))
                                  }
                                  setDragIngredient(null); setDragOverIngredient(null)
                                }}
                                className="flex items-start gap-3 px-4 py-2.5 cursor-grab active:cursor-grabbing"
                                style={{
                                  borderBottom: i < arr.length - 1 ? '1px solid var(--wdp-border)' : undefined,
                                  background: dragOverIngredient === i && dragIngredient !== i ? 'var(--wdp-surface2)' : undefined,
                                  opacity: dragIngredient === i ? 0.4 : 1,
                                  transition: 'background 0.1s, opacity 0.1s',
                                }}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-terracotta/50 shrink-0 mt-2" />
                                <EditableField
                                  value={line}
                                  onSave={v => {
                                    const updated = [...arr]
                                    if (v.trim()) { updated[i] = v } else { updated.splice(i, 1) }
                                    updateField(r.id, 'ingredients', updated.filter(Boolean).join('\n'))
                                  }}
                                  className="text-sm text-ink-dark leading-snug flex-1"
                                  style={FONT}
                                />
                              </div>
                            ))}
                            {addingIngredient && (
                              <div className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: '1px solid var(--wdp-border)' }}>
                                <span className="w-1.5 h-1.5 rounded-full bg-terracotta/50 shrink-0" />
                                <input
                                  autoFocus
                                  value={newIngredientValue}
                                  onChange={e => setNewIngredientValue(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' && newIngredientValue.trim()) {
                                      const existing = (r.ingredients ?? '').trimEnd()
                                      updateField(r.id, 'ingredients', existing ? existing + '\n' + newIngredientValue.trim() : newIngredientValue.trim())
                                      setNewIngredientValue('')
                                      setAddingIngredient(false)
                                    }
                                    if (e.key === 'Escape') { setAddingIngredient(false); setNewIngredientValue('') }
                                  }}
                                  onBlur={() => {
                                    if (newIngredientValue.trim()) {
                                      const existing = (r.ingredients ?? '').trimEnd()
                                      updateField(r.id, 'ingredients', existing ? existing + '\n' + newIngredientValue.trim() : newIngredientValue.trim())
                                    }
                                    setAddingIngredient(false)
                                    setNewIngredientValue('')
                                  }}
                                  placeholder="e.g. 1 tbsp olive oil"
                                  className="flex-1 text-sm outline-none bg-transparent"
                                  style={{ ...FONT, color: 'var(--wdp-ink)' }}
                                />
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => { setAddingIngredient(true); setNewIngredientValue('') }}
                            className="mt-2 text-[10px] font-semibold text-terracotta/50 hover:text-terracotta transition-colors"
                            style={FONT}
                          >+ Add ingredient</button>
                        </div>
                      )}

                      {cardTab === 'steps' && (
                        <div className="space-y-3 max-w-xl">
                          <p className="text-[10px] font-bold text-ink/30 uppercase tracking-widest mb-1">Click any step to edit</p>
                          {(r.instructions ?? '').split('\n').filter(Boolean).map((line, i, arr) => (
                            <div
                              key={i}
                              draggable
                              onDragStart={() => setDragStep(i)}
                              onDragOver={e => { e.preventDefault(); setDragOverStep(i) }}
                              onDragEnd={() => {
                                if (dragStep !== null && dragOverStep !== null && dragStep !== dragOverStep) {
                                  const updated = [...arr]
                                  const [moved] = updated.splice(dragStep, 1)
                                  updated.splice(dragOverStep, 0, moved)
                                  updateField(r.id, 'instructions', updated.join('\n'))
                                }
                                setDragStep(null); setDragOverStep(null)
                              }}
                              className="flex gap-3 rounded-xl p-4 cursor-grab active:cursor-grabbing"
                              style={{
                                background: dragOverStep === i && dragStep !== i ? 'var(--wdp-surface2)' : 'var(--wdp-surface)',
                                border: '1px solid var(--wdp-border)',
                                boxShadow: 'var(--wdp-shadow)',
                                opacity: dragStep === i ? 0.4 : 1,
                                transition: 'background 0.1s, opacity 0.1s',
                              }}
                            >
                              <span className="w-6 h-6 rounded-full bg-terracotta/10 text-terracotta text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                              <EditableField
                                value={line.replace(/^\d+\.\s*/, '')}
                                onSave={v => {
                                  const updated = [...arr]
                                  if (v.trim()) { updated[i] = v } else { updated.splice(i, 1) }
                                  updateField(r.id, 'instructions', updated.filter(Boolean).join('\n'))
                                }}
                                multiline
                                className="text-sm text-ink-dark leading-relaxed flex-1"
                                style={FONT}
                              />
                            </div>
                          ))}
                          {addingStep && (
                            <div className="flex gap-3 rounded-xl p-4" style={{ background: 'var(--wdp-surface)', border: '1px solid var(--wdp-border)', boxShadow: 'var(--wdp-shadow)' }}>
                              <span className="w-6 h-6 rounded-full bg-terracotta/10 text-terracotta text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                                {(r.instructions ?? '').split('\n').filter(Boolean).length + 1}
                              </span>
                              <textarea
                                autoFocus
                                rows={2}
                                value={newStepValue}
                                onChange={e => setNewStepValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Escape') { setAddingStep(false); setNewStepValue('') }
                                }}
                                onBlur={() => {
                                  if (newStepValue.trim()) {
                                    const existing = (r.instructions ?? '').trimEnd()
                                    updateField(r.id, 'instructions', existing ? existing + '\n' + newStepValue.trim() : newStepValue.trim())
                                  }
                                  setAddingStep(false)
                                  setNewStepValue('')
                                }}
                                placeholder="Describe this step…"
                                className="flex-1 text-sm outline-none bg-transparent resize-none leading-relaxed"
                                style={{ ...FONT, color: 'var(--wdp-ink)' }}
                              />
                            </div>
                          )}
                          <button
                            onClick={() => { setAddingStep(true); setNewStepValue('') }}
                            className="text-[10px] font-semibold text-terracotta/50 hover:text-terracotta transition-colors"
                            style={FONT}
                          >+ Add step</button>
                        </div>
                      )}

                      {cardTab === 'notes' && (
                        <div className="space-y-4 max-w-xl">
                          {noteSections.filter(s => s.header === 'Tips & Considerations').map((s, i) => (
                            <div key={i} className="rounded-xl p-4" style={{ background: 'var(--wdp-surface)', border: '1px solid var(--wdp-border)', boxShadow: 'var(--wdp-shadow)' }}>
                              <p className="text-[10px] font-bold text-ink/40 uppercase tracking-widest mb-2">{s.header}</p>
                              <EditableField
                                value={s.body}
                                onSave={v => updateNoteSection(r.id, s.header, v, noteSections)}
                                multiline
                                className="text-sm text-ink-dark/80 leading-relaxed"
                                style={FONT}
                              />
                            </div>
                          ))}
                          {noteSections.filter(s => s.header === 'SEO Heading' || s.header === 'SEO Excerpt').length > 0 && (
                            <div className="bg-blueberry/5 border border-blueberry/20 rounded-xl p-4 space-y-3">
                              <p className="text-[10px] font-bold text-blueberry/60 uppercase tracking-widest">SEO</p>
                              {noteSections.filter(s => s.header === 'SEO Heading').map((s, i) => (
                                <div key={i}>
                                  <p className="text-[10px] font-semibold text-ink/40 uppercase tracking-wide mb-1">H1 Heading</p>
                                  <EditableField
                                    value={s.body}
                                    onSave={v => updateNoteSection(r.id, s.header, v, noteSections)}
                                    className="text-sm text-ink-dark font-medium leading-snug"
                                    style={FONT}
                                  />
                                  <p className="text-[10px] text-ink/30 mt-1">{s.body.length} chars</p>
                                </div>
                              ))}
                              {noteSections.filter(s => s.header === 'SEO Excerpt').map((s, i) => (
                                <div key={i}>
                                  <p className="text-[10px] font-semibold text-ink/40 uppercase tracking-wide mb-1">Meta Excerpt</p>
                                  <EditableField
                                    value={s.body}
                                    onSave={v => updateNoteSection(r.id, s.header, v, noteSections)}
                                    multiline
                                    className="text-sm text-ink-dark/80 leading-relaxed"
                                    style={FONT}
                                  />
                                  <p className="text-[10px] text-ink/30 mt-1">{s.body.length} chars</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  </>
                )
              })()}
            </>
          )}

          {!menuMode && phase === 'generating' && !recipe && (
            <div className="p-8">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 mb-4">
                  <Loader2 className="w-4 h-4 text-terracotta animate-spin" />
                  <span className="text-xs text-ink/50">Crafting your recipe…</span>
                </div>
                <pre className="text-xs text-ink/50 whitespace-pre-wrap font-mono leading-relaxed">{rawStream}</pre>
              </div>
            </div>
          )}

          {!menuMode && hasDraft && (
            <div className="p-8 max-w-2xl">
              {/* Refine bar */}
              {refineMode && (
                <div className="mb-6 p-4 rounded-xl space-y-3" style={{ background: 'var(--wdp-surface2)', border: '1px solid var(--wdp-border)' }}>
                  <p className="text-xs font-semibold text-ink/60 uppercase tracking-wider">Refine this recipe</p>
                  <textarea
                    value={refineFeedback}
                    onChange={e => setRefineFeedback(e.target.value)}
                    placeholder="What would you like to change? e.g. 'Make it spicier', 'Add a vegetarian option', 'Punch up the title'…"
                    rows={2}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                    style={{ ...FONT, background: 'var(--wdp-surface)', border: '1px solid var(--wdp-border)', color: 'var(--wdp-ink)' }}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => generate(true)}
                      disabled={isGenerating || !refineFeedback.trim()}
                      className="flex items-center gap-1.5 px-4 py-2 bg-terracotta text-cream rounded-lg text-xs font-semibold hover:bg-terracotta/90 transition-all disabled:opacity-50"
                      style={FONT}
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      Apply Refinement
                    </button>
                    <button onClick={() => setRefineMode(false)} className="px-3 py-2 text-xs text-ink/50 hover:text-ink-dark transition-colors" style={FONT}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Recipe Title */}
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-ink-dark leading-tight" style={FONT}>{recipe.title}</h2>
                {blend !== 'Any / Surprise me' && (
                  <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-semibold uppercase tracking-widest text-terracotta/70 bg-terracotta/8 px-2.5 py-1 rounded-full border border-terracotta/15">
                    <Sparkles className="w-2.5 h-2.5" />
                    {blend}
                  </span>
                )}
              </div>

              {/* Tabs */}
              <div className="flex gap-1 mb-5" style={{ borderBottom: '1px solid var(--wdp-border)' }}>
                {(['about', 'ingredients', 'steps', 'notes'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 text-xs font-semibold capitalize transition-all border-b-2 -mb-px ${
                      activeTab === tab
                        ? 'border-terracotta text-terracotta'
                        : 'border-transparent text-ink/40 hover:text-ink-dark'
                    }`}
                    style={FONT}
                  >
                    {tab === 'notes' ? 'Tips & Notes' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              {activeTab === 'about' && (
                <div className="space-y-5">
                  <div className="prose prose-sm text-ink-dark/80 leading-relaxed text-sm whitespace-pre-line" style={FONT}>
                    {recipe.about}
                  </div>
                  {recipe.why && (
                    <div className="rounded-xl p-4" style={{ background: 'var(--wdp-surface2)', border: '1px solid var(--wdp-border)' }}>
                      <p className="text-[10px] font-bold text-ink/40 uppercase tracking-widest mb-3">Why You'll Love It</p>
                      <div className="space-y-1.5">
                        {recipe.why.split('\n').filter(Boolean).map((line, i) => (
                          <p key={i} className="text-sm text-ink-dark/80 leading-snug" style={FONT}>{line}</p>
                        ))}
                      </div>
                    </div>
                  )}
                  {recipe.nutrition && (
                    <div>
                      <p className="text-[10px] font-bold text-ink/40 uppercase tracking-widest mb-3">Nutrition</p>
                      <NutritionLabel raw={recipe.nutrition} />
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'ingredients' && (
                <div>
                  <div className="space-y-1.5">
                    {(recipe.ingredients ?? '').split('\n').filter(Boolean).map((line, i) => (
                      <div key={i} className="flex items-start gap-2.5 py-1.5 border-b border-mushroom/30 last:border-0">
                        <span className="w-1 h-1 rounded-full bg-terracotta/50 shrink-0 mt-2" />
                        <p className="text-sm text-ink-dark" style={FONT}>{line}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'steps' && (
                <div className="space-y-3">
                  {(recipe.steps ?? '').split('\n').filter(Boolean).map((line, i) => {
                    const cleaned = line.replace(/^\d+\.\s*/, '')
                    return (
                      <div key={i} className="flex gap-3">
                        <span className="w-6 h-6 rounded-full bg-terracotta/10 text-terracotta text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                        <p className="text-sm text-ink-dark leading-relaxed flex-1 pt-0.5" style={FONT}>{cleaned}</p>
                      </div>
                    )
                  })}
                </div>
              )}

              {activeTab === 'notes' && (
                <div className="space-y-5">
                  {recipe.considerations && (
                    <div>
                      <p className="text-[10px] font-bold text-ink/40 uppercase tracking-widest mb-2">Tips & Considerations</p>
                      <div className="text-sm text-ink-dark/80 leading-relaxed whitespace-pre-line" style={FONT}>
                        {recipe.considerations}
                      </div>
                    </div>
                  )}
                  {recipe.seo_heading && (
                    <div className="bg-blueberry/5 border border-blueberry/20 rounded-xl p-4 space-y-3">
                      <p className="text-[10px] font-bold text-blueberry/60 uppercase tracking-widest">SEO</p>
                      <div>
                        <p className="text-[10px] font-semibold text-ink/40 uppercase tracking-wide mb-1">H1 Heading</p>
                        <p className="text-sm text-ink-dark font-medium leading-snug" style={FONT}>{recipe.seo_heading}</p>
                        <p className="text-[10px] text-ink/30 mt-1">{recipe.seo_heading.length} chars</p>
                      </div>
                      {recipe.seo_excerpt && (
                        <div>
                          <p className="text-[10px] font-semibold text-ink/40 uppercase tracking-wide mb-1">Meta Excerpt</p>
                          <p className="text-sm text-ink-dark/80 leading-relaxed" style={FONT}>{recipe.seo_excerpt}</p>
                          <p className="text-[10px] text-ink/30 mt-1">{recipe.seo_excerpt.length} chars</p>
                        </div>
                      )}
                    </div>
                  )}
                  {recipe.keywords && (
                    <div>
                      <p className="text-[10px] font-bold text-ink/40 uppercase tracking-widest mb-2">Keywords</p>
                      <div className="flex flex-wrap gap-1.5">
                        {recipe.keywords.split(',').map(k => k.trim()).filter(Boolean).map(k => (
                          <span key={k} className="text-[10px] px-2 py-0.5 bg-mushroom/30 text-ink/60 rounded-full" style={FONT}>{k}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function EditableField({
  value, onSave, multiline = false, className = '', style, placeholder = 'Click to edit…',
}: {
  value: string; onSave: (v: string) => void; multiline?: boolean
  className?: string; style?: React.CSSProperties; placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  function commit() { setEditing(false); if (draft !== value) onSave(draft) }

  if (editing) {
    const shared = {
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
      onBlur: commit,
      autoFocus: true,
      style,
      className: `${className} w-full outline-none bg-white/80 border border-terracotta/30 rounded-lg px-2 py-1.5 shadow-sm`,
    }
    return multiline
      ? <textarea {...shared} rows={Math.max(3, draft.split('\n').length + 1)} onKeyDown={e => { if (e.key === 'Escape') { setDraft(value); setEditing(false) } }} />
      : <input {...shared} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false) } }} />
  }

  return (
    <div
      onClick={() => { setEditing(true); setDraft(value) }}
      className={`${className} cursor-text group relative rounded transition-colors hover:bg-terracotta/5`}
      style={style}
      title="Click to edit"
    >
      {value
        ? <span className="whitespace-pre-wrap">{value}</span>
        : <span className="italic opacity-30">{placeholder}</span>}
      <span className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity text-[9px] font-bold uppercase tracking-widest text-terracotta/40 pointer-events-none">edit</span>
    </div>
  )
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-ink/30">{icon}</span>}
        <label className="text-[10px] font-bold uppercase tracking-widest" style={{ ...FONT, color: 'var(--wdp-ink-mid)' }}>{label}</label>
      </div>
      {children}
    </div>
  )
}

interface NutritionData { calories?: string; protein?: string; carbs?: string; fat?: string; fiber?: string; sodium?: string; sugar?: string }

function parseNutrition(raw: string): NutritionData {
  const n: NutritionData = {}
  const text = raw.toLowerCase()
  const match = (patterns: RegExp[]) => {
    for (const p of patterns) { const m = text.match(p); if (m) return m[1].trim() }
    return undefined
  }
  n.calories = match([/(\d+)\s*(?:cal|calories|kcal)/, /calories[:\s]+(\d+)/])
  n.protein  = match([/protein[:\s]+([\d.]+\s*g)/, /([\d.]+\s*g)\s*protein/])
  n.carbs    = match([/carbs?[:\s]+([\d.]+\s*g)/, /carbohydrates?[:\s]+([\d.]+\s*g)/, /([\d.]+\s*g)\s*carbs?/])
  n.fat      = match([/fat[:\s]+([\d.]+\s*g)/, /([\d.]+\s*g)\s*fat/])
  n.fiber    = match([/fiber[:\s]+([\d.]+\s*g)/, /([\d.]+\s*g)\s*fiber/])
  n.sodium   = match([/sodium[:\s]+([\d.]+\s*mg)/, /([\d.]+\s*mg)\s*sodium/])
  n.sugar    = match([/sugar[:\s]+([\d.]+\s*g)/, /([\d.]+\s*g)\s*sugar/])
  return n
}

function NutritionLabel({ raw }: { raw: string }) {
  const n = parseNutrition(raw)
  const hasData = Object.values(n).some(Boolean)
  if (!hasData) {
    return <p className="text-xs text-ink/40 italic" style={FONT}>{raw}</p>
  }
  const rows: { label: string; value: string | undefined; bold?: boolean; indent?: boolean }[] = [
    { label: 'Total Fat',         value: n.fat,    bold: true },
    { label: 'Total Carbohydrate',value: n.carbs,  bold: true },
    { label: 'Dietary Fiber',     value: n.fiber,  indent: true },
    { label: 'Total Sugars',      value: n.sugar,  indent: true },
    { label: 'Protein',           value: n.protein,bold: true },
    { label: 'Sodium',            value: n.sodium },
  ].filter(r => r.value)

  return (
    <div className="rounded-xl overflow-hidden border-2 border-ink-dark/80 max-w-[260px]" style={{ fontFamily: "'Arial Narrow', Arial, sans-serif" }}>
      {/* Header */}
      <div className="bg-ink-dark px-3 pt-2 pb-1.5">
        <p className="text-cream text-[22px] font-black leading-none tracking-tight">Nutrition Facts</p>
        <p className="text-cream/60 text-[9px] mt-0.5">Per serving · estimated</p>
      </div>
      {/* Calories */}
      <div className="px-3 py-2 border-b-4 border-ink-dark/80 flex items-end justify-between bg-white">
        <div>
          <p className="text-[9px] text-ink/60 font-bold uppercase tracking-wide">Calories</p>
          <p className="text-[42px] font-black text-ink-dark leading-none tracking-tighter">{n.calories ?? '—'}</p>
        </div>
      </div>
      {/* Macro rows */}
      <div className="bg-white divide-y divide-ink-dark/10">
        {rows.map((row) => (
          <div key={row.label} className={`flex justify-between items-center px-3 py-1 ${row.indent ? 'pl-6' : ''}`}>
            <p className={`text-[11px] ${row.bold ? 'font-bold' : 'font-normal'} text-ink-dark`}>{row.label}</p>
            <p className={`text-[11px] ${row.bold ? 'font-bold' : 'font-normal'} text-ink-dark`}>{row.value}</p>
          </div>
        ))}
      </div>
      {/* Footer */}
      <div className="px-3 py-1.5 bg-white border-t-4 border-ink-dark/80">
        <p className="text-[8px] text-ink/40 leading-snug">Estimated values. Not a substitute for professional nutritional analysis.</p>
      </div>
    </div>
  )
}

export default function RecipeLabPageWrapper() {
  return (
    <Suspense>
      <RecipeLabPage />
    </Suspense>
  )
}
