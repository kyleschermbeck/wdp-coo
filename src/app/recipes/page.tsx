'use client'

import { useState, useRef, useEffect } from 'react'
import { FlaskConical, Wand2, RotateCcw, Save, ChevronDown, CheckSquare, Square, Loader2, ChefHat, Clock, Leaf, Utensils, Sparkles, ArrowRight } from 'lucide-react'

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

export default function RecipeLabPage() {
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

  const abortRef = useRef<AbortController | null>(null)

  function toggleDietary(opt: string) {
    setDietary(prev => prev.includes(opt) ? prev.filter(d => d !== opt) : [...prev, opt])
  }

  async function generate(isRefine = false) {
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
          notes: isRefine ? refineFeedback : notes,
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

  async function saveAsTask() {
    if (!recipe?.title) return
    setSaving(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: recipe.title,
          project_id: 3, // Blog Recipes
          status: 'todo',
          priority: 'medium',
          notes: recipe.about,
          recipe_data: JSON.stringify({
            ingredients: recipe.ingredients,
            about: recipe.about,
            why: recipe.why,
            steps: recipe.steps,
            considerations: recipe.considerations,
            nutrition: recipe.nutrition,
            keywords: recipe.keywords,
          }),
        }),
      })
      if (res.ok) setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  const isGenerating = phase === 'generating'
  const hasDraft = phase === 'done' && recipe

  return (
    <div className="h-full flex flex-col bg-cream" style={FONT}>
      {/* Header */}
      <div className="px-8 py-6 border-b border-mushroom flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-terracotta/10 flex items-center justify-center">
          <FlaskConical className="w-4 h-4 text-terracotta" strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-ink-dark">Recipe Lab</h1>
          <p className="text-xs text-ink/50">Generate new recipes featuring your spice blends</p>
        </div>
        {hasDraft && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setRefineMode(r => !r)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-ink/60 hover:text-ink-dark hover:bg-oatmilk transition-all border border-mushroom"
            >
              <Wand2 className="w-3.5 h-3.5" />
              Refine
            </button>
            <button
              onClick={() => generate(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-ink/60 hover:text-ink-dark hover:bg-oatmilk transition-all border border-mushroom"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Regenerate
            </button>
            <button
              onClick={saveAsTask}
              disabled={saving || saved}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                saved
                  ? 'bg-sage/20 text-sage border border-sage/30'
                  : 'bg-terracotta text-cream hover:bg-terracotta/90'
              }`}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saved ? 'Saved to Blog Recipes' : 'Save as Recipe Task'}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* LEFT: Criteria Panel */}
        <div className="w-72 shrink-0 border-r border-mushroom flex flex-col overflow-y-auto">
          <div className="p-5 space-y-5">
            {/* Spice Blend */}
            <Field label="Spice Blend" icon={<Sparkles className="w-3.5 h-3.5" />}>
              <div className="relative">
                <select
                  value={blend}
                  onChange={e => setBlend(e.target.value)}
                  className="w-full appearance-none bg-oatmilk/60 border border-mushroom/60 rounded-lg px-3 py-2 text-sm text-ink-dark outline-none focus:border-terracotta/40 cursor-pointer"
                  style={FONT}
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
                className="w-full bg-oatmilk/60 border border-mushroom/60 rounded-lg px-3 py-2 text-sm text-ink-dark placeholder:text-ink/30 outline-none focus:border-terracotta/40"
                style={FONT}
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
                className="w-full bg-oatmilk/60 border border-mushroom/60 rounded-lg px-3 py-2 text-sm text-ink-dark placeholder:text-ink/30 outline-none focus:border-terracotta/40 resize-none"
                style={FONT}
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
        </div>

        {/* RIGHT: Recipe Output */}
        <div className="flex-1 overflow-y-auto">
          {phase === 'idle' && (
            <div className="h-full flex flex-col items-center justify-center text-center px-12 py-16 gap-4">
              <div className="w-14 h-14 rounded-2xl bg-terracotta/8 flex items-center justify-center">
                <FlaskConical className="w-6 h-6 text-terracotta/40" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-base font-semibold text-ink-dark mb-1">Ready to cook up something new?</p>
                <p className="text-sm text-ink/40 max-w-sm">Set your criteria on the left and hit Generate to create a new weeknight recipe featuring your spice blends.</p>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 max-w-md w-full">
                {['Choose a blend', 'Add your criteria', 'Generate & save'].map((step, i) => (
                  <div key={step} className="bg-oatmilk/60 rounded-xl p-3 text-center border border-mushroom/40">
                    <span className="text-[10px] font-bold text-terracotta/60 uppercase tracking-wider">{i + 1}</span>
                    <p className="text-xs text-ink/60 mt-0.5" style={FONT}>{step}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {phase === 'generating' && !recipe && (
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

          {hasDraft && (
            <div className="p-8 max-w-2xl">
              {/* Refine bar */}
              {refineMode && (
                <div className="mb-6 p-4 bg-oatmilk rounded-xl border border-mushroom/60 space-y-3">
                  <p className="text-xs font-semibold text-ink/60 uppercase tracking-wider">Refine this recipe</p>
                  <textarea
                    value={refineFeedback}
                    onChange={e => setRefineFeedback(e.target.value)}
                    placeholder="What would you like to change? e.g. 'Make it spicier', 'Add a vegetarian option', 'Punch up the title'…"
                    rows={2}
                    className="w-full bg-cream border border-mushroom/60 rounded-lg px-3 py-2 text-sm text-ink-dark placeholder:text-ink/30 outline-none focus:border-terracotta/40 resize-none"
                    style={FONT}
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
              <div className="flex gap-1 mb-5 border-b border-mushroom/60">
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
                    <div className="bg-oatmilk/60 rounded-xl p-4 border border-mushroom/40">
                      <p className="text-[10px] font-bold text-ink/40 uppercase tracking-widest mb-3">Why You'll Love It</p>
                      <div className="space-y-1.5">
                        {recipe.why.split('\n').filter(Boolean).map((line, i) => (
                          <p key={i} className="text-sm text-ink-dark/80 leading-snug" style={FONT}>{line}</p>
                        ))}
                      </div>
                    </div>
                  )}
                  {recipe.nutrition && (
                    <p className="text-xs text-ink/40" style={FONT}>
                      <span className="font-semibold">Estimated nutrition:</span> {recipe.nutrition}
                    </p>
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
                <div className="space-y-4">
                  <div className="text-sm text-ink-dark/80 leading-relaxed whitespace-pre-line" style={FONT}>
                    {recipe.considerations}
                  </div>
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

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-ink/30">{icon}</span>}
        <label className="text-[10px] font-bold text-ink/50 uppercase tracking-widest" style={FONT}>{label}</label>
      </div>
      {children}
    </div>
  )
}
