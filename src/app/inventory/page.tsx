'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { AlertTriangle, RefreshCw, Plus, X, ExternalLink, Pencil, Trash2, Bell, PackagePlus, EyeOff, Eye, Search } from 'lucide-react'
import { StatusRail } from '@/components/ui/StatusRail'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PageHeader } from '@/components/ui/PageHeader'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShopifyProduct {
  id: number
  shopify_id: string
  title: string
  status: 'active' | 'draft'
  shopify_qty: number
  inventory_item_id: string | null
  raw: string | null
  accent_color: string | null
  reorder_threshold: number
  is_bundle: number
  // parsed from raw
  price: string
  sku: string
}

interface BundleComponent {
  id?: number
  component_shopify_id: string
  quantity: number
  title?: string
}

interface Supply {
  id: number
  name: string
  vendor: string | null
  order_url: string | null
  package_weight: number | null      // lbs
  package_extra_oz: number | null    // additional oz beyond the lbs
  serving_size: number | null        // serving size value (from package label)
  serving_unit: string               // 'tsp' or 'oz'
  total_servings: number | null      // servings per container (from label)
  package_cost: number | null
  oz_per_tbsp: number | null         // stored but auto-calculated from serving info
  category: string
  active: number
}

interface IngredientRow {
  id?: number
  supply_id: number
  tbsp: number
}

interface ProductDetails {
  ingredients: Array<{ id: number; supply_id: number; tbsp: number; supply_name: string; oz_per_tbsp: number | null; package_cost: number | null; package_weight: number | null; containers_on_hand: number; package_extra_oz: number | null }>
  packaging: Array<{ supply_id: number; name: string; package_cost: number | null }>
  labor_cost: number
}

interface ShopifyStatus {
  connected: boolean
  last_synced_at?: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseProduct(row: { shopify_id: string; title: string; status: string; shopify_qty: number; inventory_item_id: string | null; raw: string | null; accent_color: string | null; reorder_threshold: number; is_bundle?: number; id: number }): ShopifyProduct {
  let price = '', sku = ''
  if (row.raw) {
    try {
      const p = JSON.parse(row.raw)
      price = p.variants?.[0]?.price ?? ''
      sku = p.variants?.[0]?.sku ?? ''
    } catch { /* skip */ }
  }
  return { ...row, status: row.status as 'active' | 'draft', price, sku, is_bundle: row.is_bundle ?? 0 }
}

function computeBundleQty(bundleId: string, bundleComponents: BundleComponent[], allProducts: ShopifyProduct[]): number {
  if (!bundleComponents.length) return 0
  let min = Infinity
  for (const c of bundleComponents) {
    const comp = allProducts.find(p => p.shopify_id === c.component_shopify_id)
    if (!comp) return 0
    const available = Math.floor(comp.shopify_qty / (c.quantity || 1))
    if (available < min) min = available
  }
  return min === Infinity ? 0 : min
}

const FONT: React.CSSProperties = { fontFamily: "'Jost', system-ui, sans-serif" }
const SERIF: React.CSSProperties = { fontFamily: "'Cormorant Garamond', Georgia, serif" }

const ACCENT_HEX: Record<string, string> = {
  terracotta: '#C27A54', tomato: '#C14B3A', butter: '#F0D77A', thyme: '#A0C66D',
  sage: '#9BAE9A', citrus: '#F5A623', blueberry: '#78B7C5', candy: '#F8AFA8',
  mushroom: '#D8D2C6', ink: '#2C2C2C',
}

function totalOz(supply: Pick<Supply, 'package_weight' | 'package_extra_oz'>): number {
  return (supply.package_weight ?? 0) * 16 + (supply.package_extra_oz ?? 0)
}

function calcOzPerTbsp(supply: Pick<Supply, 'serving_size' | 'serving_unit' | 'total_servings' | 'package_weight' | 'package_extra_oz'>): number | null {
  if (!supply.serving_size || !supply.total_servings) return null
  const pkgOz = totalOz(supply)
  if (!pkgOz) return null
  if (supply.serving_unit === 'tbsp') {
    const totalTbsp = supply.total_servings * supply.serving_size
    return totalTbsp > 0 ? pkgOz / totalTbsp : null
  }
  if (supply.serving_unit === 'tsp') {
    const totalTbsp = (supply.total_servings * supply.serving_size) / 3
    return totalTbsp > 0 ? pkgOz / totalTbsp : null
  }
  // oz unit: serving size is treated as oz per tablespoon directly
  return supply.serving_size > 0 ? supply.serving_size : null
}

function calcCostPerTbsp(supply: Pick<Supply, 'package_cost' | 'serving_size' | 'serving_unit' | 'total_servings' | 'package_weight' | 'package_extra_oz'>): number | null {
  const pkgOz = totalOz(supply)
  const ozPTbsp = calcOzPerTbsp(supply)
  if (!supply.package_cost || !pkgOz || !ozPTbsp) return null
  return (supply.package_cost / pkgOz) * ozPTbsp
}

// For packaging supplies: cost per unit = total package cost ÷ units in package
function costPerUnit(supply: Pick<Supply, 'package_cost' | 'total_servings'>): number | null {
  if (!supply.package_cost) return null
  if (supply.total_servings && supply.total_servings > 0) return supply.package_cost / supply.total_servings
  return supply.package_cost
}

// ─── Searchable supply combobox ───────────────────────────────────────────────

function SupplyCombobox({ value, options, onChange, font }: {
  value: number
  options: Supply[]
  onChange: (id: number) => void
  font: React.CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = options.find(s => s.id === value)
  const filtered = search.trim()
    ? options.filter(s => s.name.toLowerCase().includes(search.toLowerCase()))
    : options

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={containerRef} style={{ flex: 1, minWidth: 0, position: 'relative' }}>
      {open ? (
        <input
          ref={inputRef}
          autoFocus
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') { setOpen(false); setSearch('') }
            if (e.key === 'Enter' && filtered.length > 0) {
              onChange(filtered[0].id); setOpen(false); setSearch('')
            }
          }}
          placeholder="Search supplies…"
          style={{ width: '100%', fontSize: 12.5, ...font, border: '1px solid #2C2C2C', borderRadius: 6, padding: '6px 8px', outline: 'none', boxSizing: 'border-box' }}
        />
      ) : (
        <button
          onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0) }}
          style={{ width: '100%', fontSize: 12.5, ...font, border: '1px solid #D8D2C6', borderRadius: 6, padding: '6px 8px', background: '#fff', textAlign: 'left', cursor: 'pointer', color: '#2C2C2C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {selected?.name ?? '—'}
        </button>
      )}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: '#fff', border: '1px solid #D8D2C6', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(44,44,44,0.12)', marginTop: 2,
          maxHeight: 200, overflowY: 'auto',
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: 12, color: '#747474', ...font }}>No results</div>
          ) : filtered.map(s => (
            <button
              key={s.id}
              onMouseDown={e => { e.preventDefault(); onChange(s.id); setOpen(false); setSearch('') }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '7px 12px', fontSize: 12.5, ...font,
                background: s.id === value ? '#FBF0E3' : 'transparent',
                color: '#2C2C2C', border: 'none', cursor: 'pointer',
                borderBottom: '1px solid rgba(216,210,198,0.3)',
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = s.id === value ? '#FBF0E3' : '#FAF9F6' }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = s.id === value ? '#FBF0E3' : 'transparent' }}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Description editor (rendered HTML preview + raw HTML textarea toggle) ────

function DescriptionEditor({ value, onChange, font }: {
  value: string
  onChange: (val: string) => void
  font: React.CSSProperties
}) {
  const [editing, setEditing] = useState(false)

  return (
    <div style={{ marginTop: 8 }}>
      {editing ? (
        <>
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            rows={6}
            style={{ width: '100%', resize: 'vertical', fontSize: 12.5, ...font, border: '1px solid #D8D2C6', borderRadius: 8, padding: '9px 11px', outline: 'none', boxSizing: 'border-box', color: '#2C2C2C' }}
          />
          <button
            onClick={() => setEditing(false)}
            style={{ marginTop: 6, fontSize: 11, fontWeight: 600, color: '#3d7684', background: 'none', border: 'none', cursor: 'pointer', padding: 0, ...font }}
          >
            ← Back to preview
          </button>
        </>
      ) : (
        <>
          <div
            className="product-desc-preview"
            dangerouslySetInnerHTML={{ __html: value || '<p style="color:#aaa">No description</p>' }}
            style={{ fontSize: 13, ...font, color: '#2C2C2C', lineHeight: 1.55 }}
          />
          <button
            onClick={() => setEditing(true)}
            style={{ marginTop: 8, fontSize: 11, fontWeight: 600, color: '#747474', background: 'none', border: 'none', cursor: 'pointer', padding: 0, ...font }}
          >
            Edit HTML ↗
          </button>
        </>
      )}
    </div>
  )
}

// ─── Product right-panel ──────────────────────────────────────────────────────

function ProductPanel({
  product, needed, supplies, allProducts, onClose, onProductUpdate, onBundleComponentsChange, onPackedChange,
}: { product: ShopifyProduct; needed: number; supplies: Supply[]; allProducts: ShopifyProduct[]; onClose: () => void; onProductUpdate?: (updates: Partial<ShopifyProduct>) => void; onBundleComponentsChange?: (bundleShopifyId: string, comps: BundleComponent[]) => void; onPackedChange?: () => void }) {
  const [details, setDetails] = useState<ProductDetails | null>(null)
  const [ingredients, setIngredients] = useState<IngredientRow[]>([])
  const [packaging, setPackaging] = useState<Set<number>>(new Set())
  const [laborCost, setLaborCost] = useState('0')
  const [saving, setSaving] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Bundle state
  const [isBundle, setIsBundle] = useState(!!product.is_bundle)
  const [productStatus, setProductStatus] = useState<'active' | 'draft'>(product.status)
  const [bundleComponents, setBundleComponents] = useState<BundleComponent[]>([])
  const [componentCogs, setComponentCogs] = useState<Record<string, number>>({})
  const bundleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Shopify two-way sync state
  const [description, setDescription] = useState('')
  const [descOpen, setDescOpen] = useState(false)
  const [editableQty, setEditableQty] = useState(String(Math.max(0, needed + product.shopify_qty)))
  const [editablePrice, setEditablePrice] = useState(product.price ? String(product.price) : '')
  const [weightUnit, setWeightUnit] = useState('lb')
  const [variantId, setVariantId] = useState('')
  const [shopifySyncing, setShopifySyncing] = useState(false)
  const shopifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cogsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cogsInitialized = useRef(false)

  const productSupplies = supplies.filter(s => s.category === 'product' && s.active)
  const packagingSupplies = supplies.filter(s => s.category === 'packaging' && s.active)

  useEffect(() => {
    setIsBundle(!!product.is_bundle)
    fetch(`/api/inventory/product-details/${product.shopify_id}`)
      .then(r => r.json())
      .then((d: ProductDetails) => {
        setDetails(d)
        setIngredients(d.ingredients.map(r => ({ id: r.id, supply_id: r.supply_id, tbsp: r.tbsp })))
        setPackaging(new Set(d.packaging.map(p => p.supply_id)))
        setLaborCost(String(d.labor_cost ?? 0))
      })
    fetch(`/api/inventory/bundle-components?bundle_id=${product.shopify_id}`)
      .then(r => r.json())
      .then((rows: BundleComponent[]) => setBundleComponents(Array.isArray(rows) ? rows : []))
    if (product.raw) {
      try {
        const raw = JSON.parse(product.raw)
        setDescription(raw.body_html ?? '')
        const v = raw.variants?.[0]
        if (v) {
          setWeightUnit(v.weight_unit ?? 'lb')
          setVariantId(String(v.id ?? ''))
        }
      } catch { /* skip */ }
    }
    setEditableQty(String(Math.max(0, needed + product.shopify_qty)))
    setEditablePrice(product.price ? String(product.price) : '')
    setProductStatus(product.status)
  }, [product.shopify_id])

  function patchShopify(body: Record<string, unknown>) {
    if (shopifyTimer.current) clearTimeout(shopifyTimer.current)
    shopifyTimer.current = setTimeout(() => {
      setShopifySyncing(true)
      fetch(`/api/shopify/products/${product.shopify_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).finally(() => setShopifySyncing(false))
    }, 800)
  }

  function syncCogs(cost: number) {
    if (!product.inventory_item_id) return
    if (cogsTimer.current) clearTimeout(cogsTimer.current)
    cogsTimer.current = setTimeout(() => {
      setShopifySyncing(true)
      fetch(`/api/shopify/products/${product.shopify_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventory_item_cost: cost.toFixed(2),
          inventory_item_id: product.inventory_item_id,
        }),
      }).finally(() => setShopifySyncing(false))
    }, 1200)
  }

  // Auto-sync COGS to Shopify + save cost locally whenever ingredients/packaging/labor changes
  // Weight is intentionally excluded — Shopify weight = shipping weight, inventory weight = spice weight
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!cogsInitialized.current) { cogsInitialized.current = true; return }
    syncCogs(totalCost)
    // Also persist locally so the COGS report reads the same value as shown here
    fetch(`/api/inventory/product-details/${product.shopify_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cost_per_unit: totalCost }),
    }).catch(() => {})
  }, [ingredients, packaging, laborCost])

  function scheduleSave(ing: IngredientRow[], pkg: Set<number>, labor: string, cogsForSync?: number) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      setSaving(true)
      fetch(`/api/inventory/product-details/${product.shopify_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredients: ing.map(r => ({ supply_id: r.supply_id, tbsp: r.tbsp })),
          packaging: Array.from(pkg),
          labor_cost: parseFloat(labor) || 0,
          cost_per_unit: cogsForSync ?? totalCost, // save computed cost locally for COGS reports
        }),
      }).finally(() => setSaving(false))
    }, 600)
    if (cogsForSync != null) syncCogs(cogsForSync)
  }

  function addIngredient() {
    const first = productSupplies[0]
    if (!first) return
    const next = [...ingredients, { supply_id: first.id, tbsp: 1 }]
    setIngredients(next)
    scheduleSave(next, packaging, laborCost)
  }

  function removeIngredient(i: number) {
    const next = ingredients.filter((_, j) => j !== i)
    setIngredients(next)
    scheduleSave(next, packaging, laborCost)
  }

  function updateIngredient(i: number, patch: Partial<IngredientRow>) {
    const next = ingredients.map((r, j) => j === i ? { ...r, ...patch } : r)
    setIngredients(next)
    scheduleSave(next, packaging, laborCost)
  }

  function togglePackaging(id: number) {
    const next = new Set(packaging)
    next.has(id) ? next.delete(id) : next.add(id)
    setPackaging(next)
    scheduleSave(ingredients, next, laborCost)
  }

  function handleLaborChange(val: string) {
    setLaborCost(val)
    scheduleSave(ingredients, packaging, val)
  }

  // Fetch COGS for any component not yet cached
  useEffect(() => {
    for (const comp of bundleComponents) {
      const id = comp.component_shopify_id
      if (id && !(id in componentCogs)) {
        fetch(`/api/inventory/product-details/${id}`)
          .then(r => r.json())
          .then((d: ProductDetails) => {
            let ingCost = 0
            for (const row of d.ingredients) {
              const sup = supplies.find(s => s.id === row.supply_id)
              if (!sup?.package_cost) continue
              const oz = totalOz(sup)
              if (!oz) continue
              const ozPerTbsp = calcOzPerTbsp(sup) ?? sup.oz_per_tbsp ?? 0.5
              ingCost += (sup.package_cost / oz) * row.tbsp * ozPerTbsp
            }
            let pkgCost = 0
            for (const p of d.packaging) {
              const sup = supplies.find(s => s.id === p.supply_id)
              if (sup?.package_cost) pkgCost += costPerUnit(sup) ?? 0
            }
            const labor = d.labor_cost ?? 0
            setComponentCogs(prev => ({ ...prev, [id]: ingCost + pkgCost + labor }))
          })
          .catch(() => {})
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundleComponents])

  function saveBundleComponents(comps: BundleComponent[]) {
    if (bundleSaveTimer.current) clearTimeout(bundleSaveTimer.current)
    bundleSaveTimer.current = setTimeout(() => {
      fetch('/api/inventory/bundle-components', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle_shopify_id: product.shopify_id, components: comps }),
      }).then(() => onBundleComponentsChange?.(product.shopify_id, comps))
    }, 600)
  }

  function addBundleComponent() {
    const available = allProducts.filter(p => p.shopify_id !== product.shopify_id && p.status === 'active' && !p.is_bundle && !bundleComponents.find(c => c.component_shopify_id === p.shopify_id))
    if (!available.length) return
    const next = [...bundleComponents, { component_shopify_id: available[0].shopify_id, quantity: 1, title: available[0].title }]
    setBundleComponents(next)
    saveBundleComponents(next)
  }

  function updateBundleComponent(i: number, patch: Partial<BundleComponent>) {
    const next = bundleComponents.map((c, j) => {
      if (j !== i) return c
      const updated = { ...c, ...patch }
      if (patch.component_shopify_id) {
        updated.title = allProducts.find(p => p.shopify_id === patch.component_shopify_id)?.title
      }
      return updated
    })
    setBundleComponents(next)
    saveBundleComponents(next)
  }

  function removeBundleComponent(i: number) {
    const next = bundleComponents.filter((_, j) => j !== i)
    setBundleComponents(next)
    saveBundleComponents(next)
  }

  const bundleQty = isBundle ? computeBundleQty(product.shopify_id, bundleComponents, allProducts) : product.shopify_qty

  // ── Cost math ──
  let ingredientCost = 0
  if (details) {
    for (const row of ingredients) {
      const sup = supplies.find(s => s.id === row.supply_id)
      if (!sup || !sup.package_cost) continue
      const oz = totalOz(sup)
      if (!oz) continue
      const ozPerTbsp = calcOzPerTbsp(sup) ?? sup.oz_per_tbsp ?? 0.5
      ingredientCost += (sup.package_cost / oz) * row.tbsp * ozPerTbsp
    }
  }

  let packagingCost = 0
  for (const id of packaging) {
    const sup = supplies.find(s => s.id === id)
    if (sup?.package_cost) packagingCost += costPerUnit(sup) ?? 0
  }

  const totalCost = ingredientCost + packagingCost + (parseFloat(laborCost) || 0)

  // Ingredient weight in oz (used for Shopify weight sync and display)
  let totalWeightOz = 0
  for (const row of ingredients) {
    const sup = supplies.find(s => s.id === row.supply_id)
    const ozPTbsp = (sup ? calcOzPerTbsp(sup) : null) ?? sup?.oz_per_tbsp ?? 0.5
    totalWeightOz += row.tbsp * ozPTbsp
  }
  function ozToUnit(oz: number, unit: string): number {
    if (unit === 'lb') return oz / 16
    if (unit === 'g') return oz * 28.3495
    if (unit === 'kg') return oz * 0.0283495
    return oz
  }
  const displayWeight = ozToUnit(totalWeightOz, weightUnit)

  // Bundle COGS = sum of (component COGS × component quantity)
  const bundleCogs = bundleComponents.reduce((sum, c) => {
    const cogs = componentCogs[c.component_shopify_id] ?? 0
    return sum + cogs * (c.quantity || 1)
  }, 0)

  const price = parseFloat(product.price) || 0
  const effectiveCost = isBundle ? bundleCogs : totalCost
  const margin = price > 0 ? ((price - effectiveCost) / price) * 100 : null
  const shopifyUrl = `https://admin.shopify.com/store/eiy0fe-13/products/${product.shopify_id}`
  const accent = ACCENT_HEX[product.accent_color ?? 'sage'] ?? '#9BAE9A'
  const [restockAt, setRestockAt] = useState(String(product.reorder_threshold ?? ''))
  const displayQty = isBundle ? bundleQty : Math.max(0, needed + product.shopify_qty)
  const isLow = displayQty < 2

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(116,116,116,0.25)' }} onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-white shadow-2xl bottom-sheet-wrap md:top-0 md:left-auto md:w-[420px]">
        {/* Header */}
        <div style={{ padding: '22px 24px', borderBottom: '1px solid rgba(216,210,198,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 4px', ...FONT }}>Editing product</p>
            <h2 style={{ ...SERIF, fontSize: 22, fontWeight: 700, margin: 0, color: '#2C2C2C' }}>{product.title}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {saving && <span style={{ fontSize: 11, color: '#747474', ...FONT }}>Saving…</span>}
            {shopifySyncing && <span style={{ fontSize: 11, color: '#3d7684', ...FONT }}>Syncing…</span>}
            <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: 'rgba(116,116,116,0.5)', cursor: 'pointer', padding: 6, display: 'flex' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scroll body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Status + Bundle toggles */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {/* Status toggle: Draft ——○—— Active */}
            <button
              onClick={() => {
                const next = productStatus === 'active' ? 'draft' : 'active'
                setProductStatus(next)
                onProductUpdate?.({ status: next })
                patchShopify({ status: next })
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <span style={{ fontSize: 11.5, fontWeight: 700, color: productStatus === 'draft' ? '#C27A54' : 'rgba(116,116,116,0.4)', transition: 'color 0.2s', ...FONT }}>Draft</span>
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                width: 32, height: 18, borderRadius: 999, padding: 2,
                background: productStatus === 'active' ? '#5c8a3f' : '#C27A54',
                transition: 'background 0.2s', flexShrink: 0,
              }}>
                <span style={{
                  width: 14, height: 14, borderRadius: 999, background: '#fff',
                  transform: productStatus === 'active' ? 'translateX(14px)' : 'translateX(0)',
                  transition: 'transform 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  display: 'block',
                }} />
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: productStatus === 'active' ? '#5c8a3f' : 'rgba(116,116,116,0.4)', transition: 'color 0.2s', ...FONT }}>Active</span>
            </button>

            {/* Bundle toggle + View in Shopify */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={() => {
                  const val = !isBundle
                  setIsBundle(val)
                  onProductUpdate?.({ is_bundle: val ? 1 : 0 })
                  fetch(`/api/shopify/products/${product.shopify_id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ is_bundle: val ? 1 : 0 }),
                  })
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  width: 32, height: 18, borderRadius: 999, padding: 2,
                  background: isBundle ? '#78B7C5' : '#D8D2C6',
                  transition: 'background 0.2s', flexShrink: 0,
                }}>
                  <span style={{
                    width: 14, height: 14, borderRadius: 999, background: '#fff',
                    transform: isBundle ? 'translateX(14px)' : 'translateX(0)',
                    transition: 'transform 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    display: 'block',
                  }} />
                </span>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#2C2C2C', ...FONT }}>Bundle</span>
              </button>
              <a href={shopifyUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, fontWeight: 600, color: '#3d7684', textDecoration: 'none', ...FONT }}>
                View in Shopify ↗
              </a>
            </div>
          </div>

          {/* Accent color picker */}
          {!isBundle && (
            <div>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 8px', ...FONT }}>Card color</p>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {(Object.entries(ACCENT_HEX) as [string, string][]).map(([key, hex]) => (
                  <button
                    key={key}
                    onClick={() => {
                      onProductUpdate?.({ accent_color: key })
                      fetch(`/api/shopify/products/${product.shopify_id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ accent_color: key }),
                      })
                    }}
                    title={key}
                    style={{
                      width: 22, height: 22, borderRadius: '50%', background: hex,
                      border: (product.accent_color ?? 'sage') === key ? '2px solid #2C2C2C' : '2px solid transparent',
                      outline: (product.accent_color ?? 'sage') === key ? `2px solid ${hex}` : 'none',
                      outlineOffset: 1,
                      cursor: 'pointer', padding: 0, flexShrink: 0,
                      boxShadow: '0 1px 3px rgba(44,44,44,0.2)',
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Description · two-way sync */}
          <div>
            <button
              onClick={() => setDescOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%', textAlign: 'left' }}
            >
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: 0, ...FONT, flex: 1 }}>Description · Shopify</p>
              <span style={{ fontSize: 11, color: 'rgba(116,116,116,0.5)', ...FONT }}>{descOpen ? '▲ collapse' : '▼ expand'}</span>
            </button>
            {descOpen && (
              <DescriptionEditor
                value={description}
                onChange={val => { setDescription(val); patchShopify({ body_html: val }) }}
                font={FONT}
              />
            )}
            {!descOpen && description && (
              <div
                className="product-desc-preview"
                dangerouslySetInnerHTML={{ __html: description }}
                style={{ fontSize: 12.5, color: '#747474', margin: '6px 0 0', ...FONT, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const }}
              />
            )}
          </div>

          {/* Shopify fields: read-only + editable */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { label: 'Title · from Shopify', val: product.title },
              { label: 'SKU · from Shopify', val: product.sku || '—' },
            ].map(f => (
              <div key={f.label} style={f.label.startsWith('Title') ? { gridColumn: '1 / -1' } : {}}>
                <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 5px', ...FONT }}>{f.label}</p>
                <div style={{ padding: '9px 11px', border: '1px solid #D8D2C6', borderRadius: 8, fontSize: 13.5, color: '#2C2C2C', ...FONT }}>{f.val}</div>
              </div>
            ))}
            {/* Price · editable with Shopify sync */}
            <div>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 5px', ...FONT }}>Price · Shopify</p>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: 13.5, color: '#2C2C2C', pointerEvents: 'none', ...FONT }}>$</span>
                <input
                  type="number" min="0" step="0.01"
                  value={editablePrice}
                  onChange={e => {
                    const val = e.target.value
                    setEditablePrice(val)
                    const num = parseFloat(val)
                    if (!isNaN(num) && variantId) {
                      onProductUpdate?.({ price: num.toFixed(2) })
                      patchShopify({ price: num.toFixed(2), variant_id: variantId })
                    }
                  }}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px 9px 22px', border: '1px solid #D8D2C6', borderRadius: 8, fontSize: 13.5, color: '#2C2C2C', ...FONT, outline: 'none' }}
                />
              </div>
            </div>
            {/* On-hand qty — editable; updates Shopify + deducts supplies */}
            <div>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 5px', ...FONT }}>
                {isBundle ? 'On-Hand Qty · Computed' : 'On-Hand Qty · Packed'}
              </p>
              {isBundle ? (
                <div style={{ padding: '9px 11px', border: '1px solid #D8D2C6', borderRadius: 8, fontSize: 13.5, color: '#2C2C2C', ...FONT, background: '#FAFAF8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600 }}>{bundleQty}</span>
                  <span style={{ fontSize: 10, color: '#78B7C5', fontWeight: 600, ...FONT }}>from components</span>
                </div>
              ) : (
                <div>
                  <input
                    type="number" min="0" step="1"
                    value={editableQty}
                    onChange={e => setEditableQty(e.target.value)}
                    onBlur={async () => {
                      const newOnHand = parseInt(editableQty) || 0
                      const currentOnHand = displayQty
                      const delta = newOnHand - currentOnHand
                      // Compute the raw shopify qty that produces this on-hand: shopify_qty = newOnHand - needed
                      const newShopifyQty = newOnHand - needed
                      onProductUpdate?.({ shopify_qty: newShopifyQty })
                      if (delta > 0 && product.inventory_item_id) {
                        // Use log-pack so supply containers are auto-deducted
                        await fetch('/api/inventory/log-pack', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ shopify_id: product.shopify_id, qty: delta }),
                        })
                      } else if (delta !== 0) {
                        // Correction downward — just update Shopify qty directly
                        patchShopify({ inventory_qty: newShopifyQty, inventory_item_id: product.inventory_item_id })
                      }
                      onPackedChange?.()
                    }}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid #D8D2C6', borderRadius: 8, fontSize: 13.5, color: '#2C2C2C', ...FONT, outline: 'none' }}
                  />
                  <p style={{ fontSize: 10, color: 'rgba(116,116,116,0.5)', margin: '4px 0 0', ...FONT }}>Shopify raw: {product.shopify_qty}</p>
                </div>
              )}
            </div>
            {/* Computed weight from ingredients */}
            <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
              <div>
                <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 5px', ...FONT }}>Weight · from ingredients</p>
                <div style={{ padding: '9px 11px', border: '1px solid #D8D2C6', borderRadius: 8, fontSize: 13.5, color: '#2C2C2C', ...FONT, background: '#FAFAF8' }}>
                  {displayWeight > 0 ? displayWeight.toFixed(3) : '—'}
                </div>
              </div>
              <select
                value={weightUnit}
                onChange={e => setWeightUnit(e.target.value)}
                style={{ padding: '9px 11px', border: '1px solid #D8D2C6', borderRadius: 8, fontSize: 13.5, color: '#2C2C2C', ...FONT, outline: 'none', background: 'white' }}
              >
                <option value="lb">lb</option>
                <option value="oz">oz</option>
                <option value="kg">kg</option>
                <option value="g">g</option>
              </select>
            </div>
          </div>
          <p style={{ fontSize: 11, color: 'rgba(116,116,116,0.6)', margin: '-8px 0 0', ...FONT }}>
            Title and SKU are pulled from Shopify — edit there and hit Sync to update. Price, qty, weight, and description sync both ways.
          </p>

          {/* Bundle Components (replaces Ingredients when isBundle) */}
          {isBundle && (
            <div style={{ borderTop: '1px solid rgba(216,210,198,0.5)', paddingTop: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 4px', ...FONT }}>Bundle Components</p>
              <p style={{ fontSize: 11, color: 'rgba(116,116,116,0.6)', margin: '0 0 10px', ...FONT }}>Choose which products make up this bundle and how many of each.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                {bundleComponents.map((comp, i) => {
                  const compProduct = allProducts.find(p => p.shopify_id === comp.component_shopify_id)
                  const availableQty = compProduct ? Math.floor(compProduct.shopify_qty / (comp.quantity || 1)) : 0
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                        <select
                          value={comp.component_shopify_id}
                          onChange={e => updateBundleComponent(i, { component_shopify_id: e.target.value })}
                          style={{ width: '100%', fontSize: 12.5, ...FONT, border: '1px solid #D8D2C6', borderRadius: 6, padding: '6px 8px', outline: 'none', background: '#fff', color: '#2C2C2C' }}
                        >
                          {allProducts
                            .filter(p => p.shopify_id !== product.shopify_id && p.status === 'active' && !p.is_bundle)
                            .map(p => (
                              <option key={p.shopify_id} value={p.shopify_id}>{p.title}</option>
                            ))}
                        </select>
                      </div>
                      <input
                        type="number" min="1" step="1"
                        value={comp.quantity}
                        onChange={e => updateBundleComponent(i, { quantity: parseInt(e.target.value) || 1 })}
                        style={{ width: 48, flexShrink: 0, fontSize: 12.5, ...FONT, border: '1px solid #D8D2C6', borderRadius: 6, padding: '6px', outline: 'none', textAlign: 'right' }}
                      />
                      <span style={{ fontSize: 11, color: '#747474', flexShrink: 0, ...FONT }}>qty</span>
                      <span style={{ width: 46, flexShrink: 0, fontSize: 11, fontWeight: 600, color: availableQty > 1 ? '#5c8a3f' : '#C27A54', textAlign: 'right', ...FONT }}>{compProduct ? compProduct.shopify_qty : '—'} avail</span>
                      <button onClick={() => removeBundleComponent(i)} style={{ border: 'none', background: 'transparent', color: 'rgba(116,116,116,0.4)', cursor: 'pointer', padding: 2, flexShrink: 0, display: 'flex' }}>
                        <X size={12} />
                      </button>
                    </div>
                  )
                })}
              </div>
              {bundleComponents.length > 0 && (
                <div style={{ background: '#FBF0E3', borderRadius: 8, padding: '9px 11px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#747474', ...FONT }}>Bundle can fill</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#2C2C2C', ...FONT }}>{bundleQty} units</span>
                </div>
              )}
              <button
                onClick={addBundleComponent}
                disabled={allProducts.filter(p => p.shopify_id !== product.shopify_id && p.status === 'active' && !p.is_bundle && !bundleComponents.find(c => c.component_shopify_id === p.shopify_id)).length === 0}
                style={{ display: 'flex', alignItems: 'center', gap: 5, border: 'none', background: '#FBF0E3', color: '#2C2C2C', cursor: 'pointer', padding: '6px 12px', borderRadius: 6, fontSize: 11.5, fontWeight: 600, ...FONT }}
              >
                <Plus size={12} /> Add component
              </button>
            </div>
          )}

          {/* Ingredients & Supplies */}
          {!isBundle && <div style={{ borderTop: '1px solid rgba(216,210,198,0.5)', paddingTop: 16 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 4px', ...FONT }}>Ingredients &amp; Supplies</p>
            <p style={{ fontSize: 11, color: 'rgba(116,116,116,0.6)', margin: '0 0 10px', ...FONT }}>Pick a supply and the tablespoons used — cost is calculated automatically.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
              {ingredients.map((row, i) => {
                const sup = supplies.find(s => s.id === row.supply_id)
                const ozPerTbsp = (sup ? calcOzPerTbsp(sup) : null) ?? sup?.oz_per_tbsp ?? 0.5
                const ozUsed = row.tbsp * ozPerTbsp
                let lineTotal = 0
                if (sup?.package_cost) {
                  const oz = totalOz(sup)
                  if (oz) lineTotal = (sup.package_cost / oz) * ozUsed
                }
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <SupplyCombobox
                      value={row.supply_id}
                      options={productSupplies}
                      onChange={id => updateIngredient(i, { supply_id: id })}
                      font={FONT}
                    />
                    <input
                      type="number" min="0" step="0.25"
                      value={row.tbsp}
                      onChange={e => updateIngredient(i, { tbsp: parseFloat(e.target.value) || 0 })}
                      style={{ width: 48, flexShrink: 0, fontSize: 12.5, ...FONT, border: '1px solid #D8D2C6', borderRadius: 6, padding: '6px', outline: 'none', textAlign: 'right' }}
                    />
                    <span style={{ fontSize: 11, color: '#747474', flexShrink: 0, width: 28, ...FONT }}>tbsp</span>
                    <span style={{ width: 50, flexShrink: 0, fontSize: 11, color: 'rgba(116,116,116,0.75)', textAlign: 'right', ...FONT }}>{ozUsed.toFixed(2)} oz</span>
                    <span style={{ width: 46, flexShrink: 0, fontSize: 12, fontWeight: 600, color: '#2C2C2C', textAlign: 'right', ...FONT }}>${lineTotal.toFixed(2)}</span>
                    <button onClick={() => removeIngredient(i)} style={{ border: 'none', background: 'transparent', color: 'rgba(116,116,116,0.4)', cursor: 'pointer', padding: 2, flexShrink: 0, display: 'flex' }}>
                      <X size={12} />
                    </button>
                  </div>
                )
              })}
            </div>
            {ingredients.length > 0 && (() => {
              const totTbsp = ingredients.reduce((s, r) => s + (r.tbsp || 0), 0)
              const totOz = ingredients.reduce((s, r) => {
                const sup = supplies.find(x => x.id === r.supply_id)
                const ozt = (sup ? calcOzPerTbsp(sup) : null) ?? sup?.oz_per_tbsp ?? 0.5
                return s + r.tbsp * ozt
              }, 0)
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderTop: '1px solid rgba(216,210,198,0.5)', paddingTop: 6, marginBottom: 8 }}>
                    <span style={{ flex: 1, fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.5)', ...FONT }}>Total</span>
                    <span style={{ width: 48, flexShrink: 0, fontSize: 11, fontWeight: 600, color: '#2C2C2C', textAlign: 'right', ...FONT }}>{totTbsp.toFixed(2)}</span>
                    <span style={{ width: 28, flexShrink: 0, fontSize: 11, color: '#747474', ...FONT }}>tbsp</span>
                    <span style={{ width: 50, flexShrink: 0, fontSize: 11, fontWeight: 600, color: '#2C2C2C', textAlign: 'right', ...FONT }}>{totOz.toFixed(2)} oz</span>
                    <span style={{ width: 46, flexShrink: 0, fontSize: 12, fontWeight: 700, color: '#2C2C2C', textAlign: 'right', ...FONT }}>${ingredientCost.toFixed(2)}</span>
                    <span style={{ width: 16, flexShrink: 0, display: 'flex' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', background: '#FBF0E3', borderRadius: 8, padding: '9px 11px', marginBottom: 10 }}>
                    <span style={{ fontSize: 12, color: '#747474', ...FONT }}>Ingredient cost</span>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: '#2C2C2C', ...FONT }}>${ingredientCost.toFixed(2)}</span>
                  </div>
                </>
              )
            })()}

            <button
              onClick={addIngredient}
              disabled={productSupplies.length === 0}
              style={{ display: 'flex', alignItems: 'center', gap: 5, border: 'none', background: '#FBF0E3', color: '#2C2C2C', cursor: 'pointer', padding: '6px 12px', borderRadius: 6, fontSize: 11.5, fontWeight: 600, ...FONT, opacity: productSupplies.length === 0 ? 0.4 : 1 }}
            >
              <Plus size={12} /> Add ingredient
            </button>
            {productSupplies.length === 0 && (
              <p style={{ fontSize: 11, color: '#747474', margin: '6px 0 0', ...FONT }}>Add product-type supplies in the Supplies tab first.</p>
            )}
          </div>}

          {/* Packaging — hidden for bundles */}
          {!isBundle && <div>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 8px', ...FONT }}>Packaging</p>
            {packagingSupplies.length === 0 ? (
              <p style={{ fontSize: 11, color: '#747474', ...FONT }}>Add packaging-type supplies in the Supplies tab.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 8 }}>
                {packagingSupplies.map(s => {
                  const cpu = costPerUnit(s)
                  return (
                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={packaging.has(s.id)}
                        onChange={() => togglePackaging(s.id)}
                        style={{ width: 15, height: 15, accentColor: '#2C2C2C', cursor: 'pointer', flexShrink: 0 }}
                      />
                      <span style={{ flex: 1, fontSize: 12.5, color: '#2C2C2C', ...FONT }}>{s.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#2C2C2C', ...FONT }}>
                        {cpu != null ? `$${cpu.toFixed(2)}` : '—'}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', background: '#FBF0E3', borderRadius: 8, padding: '9px 11px' }}>
              <span style={{ fontSize: 12, color: '#747474', ...FONT }}>Packaging cost</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#2C2C2C', ...FONT }}>${packagingCost.toFixed(2)}</span>
            </div>
          </div>}

          {/* Labor — hidden for bundles */}
          {!isBundle && <div>
            <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', display: 'block', margin: '0 0 6px', ...FONT }}>Labor & Inbound Shipping Cost</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#747474', ...FONT }}>$</span>
              <input
                type="number" min="0" step="0.01"
                value={laborCost}
                onChange={e => handleLaborChange(e.target.value)}
                style={{ flex: 1, fontSize: 13, ...FONT, border: '1px solid #D8D2C6', borderRadius: 8, padding: '9px 11px', outline: 'none' }}
              />
            </div>
          </div>}

          {/* Cost summary */}
          <div style={{ background: '#FBF0E3', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {isBundle ? (
              <>
                {bundleComponents.map((c, i) => {
                  const compProduct = allProducts.find(p => p.shopify_id === c.component_shopify_id)
                  const cogs = componentCogs[c.component_shopify_id]
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, color: '#747474', ...FONT }}>{compProduct?.title ?? c.component_shopify_id} ×{c.quantity}</span>
                      <span style={{ fontSize: 12, color: '#2C2C2C', ...FONT }}>{cogs != null ? `$${(cogs * (c.quantity || 1)).toFixed(2)}` : '—'}</span>
                    </div>
                  )
                })}
              </>
            ) : (
              <>
                {[
                  { label: 'Ingredient cost', val: `$${ingredientCost.toFixed(2)}` },
                  { label: 'Packaging cost', val: `$${packagingCost.toFixed(2)}` },
                  { label: 'Labor', val: `$${(parseFloat(laborCost) || 0).toFixed(2)}` },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: '#747474', ...FONT }}>{r.label}</span>
                    <span style={{ fontSize: 12, color: '#2C2C2C', ...FONT }}>{r.val}</span>
                  </div>
                ))}
              </>
            )}
            <div style={{ borderTop: '1px solid rgba(216,210,198,0.6)', paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#2C2C2C', ...FONT }}>Total COGS</span>
                {!isBundle && product.inventory_item_id && <span style={{ fontSize: 10, color: '#3d7684', fontWeight: 600, letterSpacing: '0.08em', marginLeft: 6, ...FONT }}>→ SHOPIFY</span>}
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#2C2C2C', ...FONT }}>${effectiveCost.toFixed(2)}</span>
            </div>
            {price > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#2C2C2C', ...FONT }}>Margin</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: margin != null && margin >= 60 ? '#5c8a3f' : '#C27A54', ...FONT }}>
                  {margin != null ? `${margin.toFixed(1)}%` : '—'}
                </span>
              </div>
            )}
          </div>

          {/* Restock at */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', display: 'block', margin: '0 0 6px', ...FONT }}>Restock at</label>
            <input
              type="number" min="0" step="1"
              value={restockAt}
              onChange={e => {
                const val = e.target.value
                setRestockAt(val)
                const threshold = parseInt(val) || 0
                onProductUpdate?.({ reorder_threshold: threshold })
                fetch(`/api/shopify/products/${product.shopify_id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ reorder_threshold: threshold }),
                })
              }}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, ...FONT, border: '1px solid #D8D2C6', borderRadius: 8, padding: '9px 11px', outline: 'none' }}
            />
            <p style={{ fontSize: 11, color: 'rgba(116,116,116,0.5)', margin: '5px 0 0', ...FONT }}>A restock reminder shows on the card when stock drops below 2.</p>
          </div>

          {isLow && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(194,122,84,0.1)', border: '1px solid rgba(194,122,84,0.3)', borderRadius: 8, padding: '10px 12px' }}>
              <AlertTriangle size={14} style={{ color: '#C27A54', flexShrink: 0 }} />
              <p style={{ fontSize: 12, color: '#C27A54', margin: 0, ...FONT }}>Stock is critically low — only {product.shopify_qty} remaining. Restock at {restockAt || product.reorder_threshold}.</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Supplies tab ─────────────────────────────────────────────────────────────

interface NewSupplyForm {
  name: string; vendor: string; order_url: string
  package_weight: string   // lbs
  package_extra_oz: string // additional oz
  serving_size: string     // serving size value from label
  serving_unit: string     // 'tsp' or 'oz'
  total_servings: string   // servings per container from label
  package_cost: string
  category: string; active: boolean
}

const EMPTY_FORM: NewSupplyForm = {
  name: '', vendor: '', order_url: '',
  package_weight: '', package_extra_oz: '',
  serving_size: '', serving_unit: 'tbsp', total_servings: '',
  package_cost: '',
  category: 'product', active: true,
}

function SuppliesTab({ supplies, supplyLevels, packagingLevels, labelInventory, supplyOrders, onAdd, onUpdate, onDelete, onSupplyLevelChange, orderSidebarId, setOrderSidebarId, deliverState, setDeliverState, onSaveDelivery, savingDelivery, setManualOrderFor, onDeleteOrder, onTbspBreakdown }: {
  supplies: Supply[]
  supplyLevels: SupplyLevel[] | null
  packagingLevels: PackagingLevel[] | null
  labelInventory: LabelInventoryRow[] | null
  supplyOrders: SupplyOrder[] | null
  onAdd: (s: Supply) => void
  onUpdate: (s: Supply) => void
  onDelete: (id: number) => void
  onSupplyLevelChange: () => void
  orderSidebarId: number | null
  setOrderSidebarId: (id: number | null) => void
  deliverState: Record<number, { checked: boolean; qty: string }>
  setDeliverState: (fn: (prev: Record<number, { checked: boolean; qty: string }>) => Record<number, { checked: boolean; qty: string }>) => void
  onSaveDelivery: (orderId: number) => Promise<void>
  savingDelivery: boolean
  setManualOrderFor: (val: { supplyId: number | null; name: string; vendor?: string | null; shopifyProductId?: string }) => void
  onDeleteOrder: (orderId: number) => Promise<void>
  onTbspBreakdown: (supplyId: number) => void
}) {
  const [form, setForm] = useState<NewSupplyForm>(EMPTY_FORM)
  const [adding, setAdding] = useState(false)
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<NewSupplyForm>(EMPTY_FORM)
  const [containerInputs, setContainerInputs] = useState<Record<string | number, string>>({})
  const [sidebarSupplyId, setSidebarSupplyId] = useState<number | null>(null)
  const [showHiddenLabels, setShowHiddenLabels] = useState(false)
  const [supplySearch, setSupplySearch] = useState('')

  function f(field: keyof NewSupplyForm, val: string | boolean, isEdit = false) {
    if (isEdit) setEditForm(prev => ({ ...prev, [field]: val }))
    else setForm(prev => ({ ...prev, [field]: val }))
  }

  async function addSupply() {
    if (!form.name.trim()) return
    setAdding(true)
    const res = await fetch('/api/supplies', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, active: form.active ? 1 : 0 }),
    })
    const created = await res.json()
    onAdd(created)
    setForm(EMPTY_FORM)
    setShowAddPanel(false)
    setAdding(false)
  }

  async function saveEdit(id: number) {
    const res = await fetch(`/api/supplies/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editForm, active: editForm.active ? 1 : 0 }),
    })
    const updated = await res.json()
    onUpdate(updated)
    setEditId(null)
    onSupplyLevelChange()
  }

  async function deleteSupply(id: number) {
    await fetch(`/api/supplies/${id}`, { method: 'DELETE' })
    onDelete(id)
  }

  async function toggleActive(s: Supply) {
    const res = await fetch(`/api/supplies/${s.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...s, active: s.active ? 0 : 1 }),
    })
    onUpdate(await res.json())
  }

  const INPUT = { fontSize: 12.5, fontFamily: "'Jost', system-ui, sans-serif" as const, border: '1px solid #D8D2C6', borderRadius: 7, padding: '8px 9px', outline: 'none' }
  const SELECT = { ...INPUT, cursor: 'pointer' as const }
  const TH = { textAlign: 'left' as const, fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'rgba(116,116,116,0.6)', padding: '11px 14px' }
  const TD = { padding: '12px 14px', fontSize: 12.5, color: '#2C2C2C', ...FONT }
  const CALC_INPUT = { ...INPUT, background: 'rgba(116,116,116,0.07)', color: '#747474', cursor: 'default' as const }

  const previewAdd = {
    ozPerTbsp: calcOzPerTbsp({
      serving_size: parseFloat(form.serving_size) || null,
      serving_unit: form.serving_unit,
      total_servings: parseInt(form.total_servings) || null,
      package_weight: parseFloat(form.package_weight) || null,
      package_extra_oz: parseFloat(form.package_extra_oz) || null,
    }),
    costPerTbsp: calcCostPerTbsp({
      package_cost: parseFloat(form.package_cost) || null,
      serving_size: parseFloat(form.serving_size) || null,
      serving_unit: form.serving_unit,
      total_servings: parseInt(form.total_servings) || null,
      package_weight: parseFloat(form.package_weight) || null,
      package_extra_oz: parseFloat(form.package_extra_oz) || null,
    }),
  }
  const previewEdit = {
    ozPerTbsp: calcOzPerTbsp({
      serving_size: parseFloat(editForm.serving_size) || null,
      serving_unit: editForm.serving_unit,
      total_servings: parseInt(editForm.total_servings) || null,
      package_weight: parseFloat(editForm.package_weight) || null,
      package_extra_oz: parseFloat(editForm.package_extra_oz) || null,
    }),
    costPerTbsp: calcCostPerTbsp({
      package_cost: parseFloat(editForm.package_cost) || null,
      serving_size: parseFloat(editForm.serving_size) || null,
      serving_unit: editForm.serving_unit,
      total_servings: parseInt(editForm.total_servings) || null,
      package_weight: parseFloat(editForm.package_weight) || null,
      package_extra_oz: parseFloat(editForm.package_extra_oz) || null,
    }),
  }

  const productSupplies = supplies.filter(s => s.category === 'product')
  const packagingSupplies = supplies.filter(s => s.category === 'packaging')

  const EDIT_ACTIONS = (id: number) => (
    <>
      <button onClick={() => saveEdit(id)} style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: '#2C2C2C', color: '#FAF9F6', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0, ...FONT }}>Save</button>
      <button onClick={() => setEditId(null)} style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid #D8D2C6', background: 'transparent', color: '#2C2C2C', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0, ...FONT }}>Cancel</button>
    </>
  )

  const EDIT_TOP_ROW = (isEdit: boolean) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
      <select value={isEdit ? editForm.category : form.category} onChange={e => f('category', e.target.value, isEdit)} style={{ ...SELECT, width: 115, flexShrink: 0 }}>
        <option value="product">Product</option>
        <option value="packaging">Packaging</option>
      </select>
      <input value={isEdit ? editForm.name : form.name} onChange={e => f('name', e.target.value, isEdit)} placeholder="Supply name" style={{ ...INPUT, flex: 1, minWidth: 120 }} />
      <input value={isEdit ? editForm.vendor : form.vendor} onChange={e => f('vendor', e.target.value, isEdit)} placeholder="Vendor" style={{ ...INPUT, flex: 1, minWidth: 110 }} />
      <input value={isEdit ? editForm.order_url : form.order_url} onChange={e => f('order_url', e.target.value, isEdit)} placeholder="Order link (URL)" style={{ ...INPUT, flex: 2, minWidth: 130 }} />
    </div>
  )

  const activeForm = form
  const previewAddCostPerUnit = (() => {
    const cost = parseFloat(form.package_cost)
    const units = parseInt(form.total_servings)
    if (!cost || !units) return null
    return cost / units
  })()
  const previewEditCostPerUnit = (() => {
    const cost = parseFloat(editForm.package_cost)
    const units = parseInt(editForm.total_servings)
    if (!cost || !units) return null
    return cost / units
  })()

  const PANEL_LABEL: React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', display: 'block', marginBottom: 5, ...FONT }
  const PANEL_INPUT = { ...INPUT, width: '100%', boxSizing: 'border-box' as const }
  const PANEL_SELECT = { ...SELECT, width: '100%', boxSizing: 'border-box' as const }
  const PANEL_CALC = { ...CALC_INPUT, width: '100%', boxSizing: 'border-box' as const }

  async function saveContainerCount(id: number) {
    const val = containerInputs[id]
    if (val == null) return
    await fetch(`/api/supplies/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ containers_on_hand: parseFloat(val) || 0 }),
    })
    onSupplyLevelChange()
  }

  return (
    <>
    {/* Add Supply slide-in panel */}
    {showAddPanel && (
      <>
        <div className="fixed inset-0 z-40" style={{ background: 'rgba(116,116,116,0.25)' }} onClick={() => { setShowAddPanel(false); setForm(EMPTY_FORM) }} />
        <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-white shadow-2xl bottom-sheet-wrap md:top-0 md:left-auto md:w-[400px]">
          <div style={{ padding: '22px 24px', borderBottom: '1px solid rgba(216,210,198,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 4px', ...FONT }}>New supply</p>
              <h2 style={{ ...SERIF, fontSize: 22, fontWeight: 700, margin: 0, color: '#2C2C2C' }}>Add Supply</h2>
            </div>
            <button onClick={() => { setShowAddPanel(false); setForm(EMPTY_FORM) }} style={{ border: 'none', background: 'transparent', color: 'rgba(116,116,116,0.5)', cursor: 'pointer', padding: 6, display: 'flex' }}>
              <X size={18} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Category */}
            <div>
              <label style={PANEL_LABEL}>Type</label>
              <select value={form.category} onChange={e => f('category', e.target.value)} style={PANEL_SELECT}>
                <option value="product">Ingredient / Product</option>
                <option value="packaging">Packaging</option>
              </select>
            </div>
            {/* Name */}
            <div>
              <label style={PANEL_LABEL}>Supply name</label>
              <input value={form.name} onChange={e => f('name', e.target.value)} placeholder="e.g. Smoked Paprika" style={PANEL_INPUT} />
            </div>
            {/* Vendor + Order link */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={PANEL_LABEL}>Vendor</label>
                <input value={form.vendor} onChange={e => f('vendor', e.target.value)} placeholder="e.g. Amazon" style={PANEL_INPUT} />
              </div>
              <div>
                <label style={PANEL_LABEL}>Order link</label>
                <input value={form.order_url} onChange={e => f('order_url', e.target.value)} placeholder="https://…" style={PANEL_INPUT} />
              </div>
            </div>

            {form.category === 'product' ? (<>
              {/* Package size */}
              <div>
                <label style={PANEL_LABEL}>Package size</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input value={form.package_weight} onChange={e => f('package_weight', e.target.value)} placeholder="0" type="number" min="0" style={{ ...INPUT, flex: 1, textAlign: 'right' }} />
                  <span style={{ fontSize: 12, color: '#747474', flexShrink: 0, ...FONT }}>lb</span>
                  <input value={form.package_extra_oz} onChange={e => f('package_extra_oz', e.target.value)} placeholder="0" type="number" min="0" step="0.1" style={{ ...INPUT, flex: 1, textAlign: 'right' }} />
                  <span style={{ fontSize: 12, color: '#747474', flexShrink: 0, ...FONT }}>oz</span>
                </div>
              </div>
              {/* Cost */}
              <div>
                <label style={PANEL_LABEL}>Package cost</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, color: '#747474', ...FONT }}>$</span>
                  <input value={form.package_cost} onChange={e => f('package_cost', e.target.value)} placeholder="0.00" type="number" min="0" step="0.01" style={{ ...INPUT, flex: 1, textAlign: 'right' }} />
                </div>
              </div>
              {/* Servings */}
              <div>
                <label style={PANEL_LABEL}>Servings per package</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input value={form.total_servings} onChange={e => f('total_servings', e.target.value)} placeholder="0" type="number" min="0" style={{ ...INPUT, flex: 1, textAlign: 'right' }} />
                  <span style={{ fontSize: 12, color: '#747474', flexShrink: 0, ...FONT }}>×</span>
                  <input value={form.serving_size} onChange={e => f('serving_size', e.target.value)} placeholder="0" type="number" min="0" step="0.01" style={{ ...INPUT, flex: 1, textAlign: 'right' }} />
                  <select value={form.serving_unit} onChange={e => f('serving_unit', e.target.value)} style={{ ...SELECT, width: 64, flexShrink: 0 }}>
                    <option value="tbsp">tbsp</option>
                    <option value="tsp">tsp</option>
                    <option value="oz">oz</option>
                  </select>
                </div>
              </div>
              {/* Calculated */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={PANEL_LABEL}>oz / tbsp (auto)</label>
                  <input readOnly value={previewAdd.ozPerTbsp != null ? previewAdd.ozPerTbsp.toFixed(4) : ''} placeholder="—" style={PANEL_CALC} />
                </div>
                <div>
                  <label style={PANEL_LABEL}>$ / tbsp (auto)</label>
                  <input readOnly value={previewAdd.costPerTbsp != null ? previewAdd.costPerTbsp.toFixed(2) : ''} placeholder="—" style={PANEL_CALC} />
                </div>
              </div>
            </>) : (<>
              {/* Units */}
              <div>
                <label style={PANEL_LABEL}>Units per package</label>
                <input value={form.total_servings} onChange={e => f('total_servings', e.target.value)} placeholder="e.g. 100" type="number" min="0" style={PANEL_INPUT} />
              </div>
              {/* Total cost */}
              <div>
                <label style={PANEL_LABEL}>Total package cost</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, color: '#747474', ...FONT }}>$</span>
                  <input value={form.package_cost} onChange={e => f('package_cost', e.target.value)} placeholder="0.00" type="number" min="0" step="0.01" style={{ ...INPUT, flex: 1, textAlign: 'right' }} />
                </div>
              </div>
              {/* Cost per unit */}
              <div>
                <label style={PANEL_LABEL}>Cost / unit (auto)</label>
                <input readOnly value={previewAddCostPerUnit != null ? `$${previewAddCostPerUnit.toFixed(2)}` : ''} placeholder="—" style={PANEL_CALC} />
              </div>
            </>)}

            {/* Active */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#2C2C2C', cursor: 'pointer', ...FONT }}>
              <input type="checkbox" checked={form.active} onChange={e => f('active', e.target.checked)} style={{ width: 15, height: 15, accentColor: '#2C2C2C', cursor: 'pointer' }} />
              Active
            </label>
          </div>
          {/* Footer */}
          <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(216,210,198,0.5)', display: 'flex', gap: 10 }}>
            <button onClick={addSupply} disabled={adding || !form.name.trim()} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: '#2C2C2C', color: '#FAF9F6', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: !form.name.trim() ? 0.5 : 1, ...FONT }}>
              {adding ? 'Adding…' : 'Add Supply'}
            </button>
            <button onClick={() => { setShowAddPanel(false); setForm(EMPTY_FORM) }} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #D8D2C6', background: 'transparent', color: '#2C2C2C', fontSize: 13, fontWeight: 600, cursor: 'pointer', ...FONT }}>
              Cancel
            </button>
          </div>
        </div>
      </>
    )}

    {/* Search box */}
    {supplyLevels && supplyLevels.length > 0 && (
      <div style={{ marginBottom: 16 }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'rgba(116,116,116,0.45)', pointerEvents: 'none' }} />
          <input
            type="search"
            placeholder="Search supplies…"
            value={supplySearch}
            onChange={e => setSupplySearch(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px 9px 34px', border: '1px solid rgba(216,210,198,0.8)', borderRadius: 10, background: '#fff', color: '#2C2C2C', outline: 'none', ...FONT }}
          />
          {supplySearch && (
            <button onClick={() => setSupplySearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(116,116,116,0.5)', display: 'flex', alignItems: 'center', padding: 2 }}>
              <X size={13} />
            </button>
          )}
        </div>
      </div>
    )}

    {/* Supply stock levels */}
    {supplyLevels && supplyLevels.length > 0 && (
      <div style={{ marginBottom: 32 }}>
        <div style={{ marginBottom: 8 }}>
          <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: 0, ...FONT }}>Ingredient Stock Levels</p>
        </div>
        <div className="mob-tbl" style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#FBF0E3' }}>
                {['Supply', 'Containers on Hand', 'Tbsp/Container', 'Tbsp Available', 'Tbsp Needed', 'Status'].map(h => (
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {supplyLevels.filter(sl => {
                if (!supplySearch.trim()) return true
                const q = supplySearch.toLowerCase()
                return sl.name.toLowerCase().includes(q) || (sl.vendor ?? '').toLowerCase().includes(q)
              }).map(sl => {
                const inputVal = containerInputs[sl.id] ?? String(sl.containers_on_hand)
                const isShort = sl.tbsp_needed > 0 && (sl.tbsp_on_hand ?? 0) < sl.tbsp_needed
                const isLow = !isShort && sl.containers_on_hand < 0.25
                const statusColor = sl.missing_data ? '#C27A54' : isShort ? '#C94040' : isLow ? '#C27A54' : '#3A8A5A'
                const statusLabel = sl.missing_data ? 'Missing data' : isShort ? 'Short' : isLow ? 'Low' : 'OK'
                const diff = sl.tbsp_on_hand != null ? sl.tbsp_on_hand - sl.tbsp_needed : null
                const diffLabel = diff != null ? (diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)) : null
                const pendingOrders = supplyOrders?.filter(o => o.status !== 'delivered' && o.items.some(i => i.supply_id === sl.id)) ?? []
                return (
                  <tr key={sl.id} style={{ borderTop: '1px solid rgba(216,210,198,0.35)' }}>
                    <td style={TD}>
                      <div style={{ fontWeight: 600 }}>{sl.name}</div>
                      {sl.vendor && <div style={{ fontSize: 11, color: '#747474', marginBottom: 2, ...FONT }}>{sl.vendor}</div>}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          onClick={() => setSidebarSupplyId(sl.id)}
                          style={{ fontSize: 10.5, fontWeight: 600, color: '#3d7684', background: 'none', border: 'none', padding: 0, cursor: 'pointer', letterSpacing: '0.03em', ...FONT }}
                        >
                          Details →
                        </button>
                        {sl.updated_at && (
                          <span style={{ fontSize: 10, color: '#b0b0b0', fontStyle: 'italic', ...FONT }}>
                            {new Date(sl.updated_at + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        )}
                        {pendingOrders.map(o => (
                          <button key={o.id} onClick={() => setOrderSidebarId(o.id)}
                            style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(61,118,132,0.12)', color: '#3d7684', border: '1px solid rgba(61,118,132,0.25)', cursor: 'pointer', ...FONT }}>
                            On order ↗
                          </button>
                        ))}
                        <button
                          onClick={() => setManualOrderFor({ supplyId: sl.id, name: sl.name, vendor: sl.vendor })}
                          title="Manually add on-order entry"
                          style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: 'transparent', color: '#a0a0a0', border: '1px solid rgba(160,160,160,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, ...FONT }}
                        >
                          <PackagePlus size={10} /> Order
                        </button>
                      </div>
                    </td>
                    <td data-label="Containers" style={TD} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          type="number"
                          min="0"
                          step="0.25"
                          value={inputVal}
                          onChange={e => setContainerInputs(prev => ({ ...prev, [sl.id]: e.target.value }))}
                          onBlur={() => saveContainerCount(sl.id)}
                          onKeyDown={e => { if (e.key === 'Enter') saveContainerCount(sl.id) }}
                          style={{ ...INPUT, width: 80, textAlign: 'right' }}
                        />
                        <span style={{ fontSize: 11.5, color: '#747474', ...FONT }}>containers</span>
                      </div>
                    </td>
                    <td data-label="Tbsp/Container" style={{ ...TD, fontVariantNumeric: 'tabular-nums' }}>
                      {sl.missing_data
                        ? <span style={{ color: '#C27A54', fontSize: 11.5 }}>⚠ Not calibrated</span>
                        : sl.tbsp_per_container != null ? sl.tbsp_per_container.toFixed(1) : '—'}
                    </td>
                    <td data-label="Tbsp Available" style={{ ...TD, fontVariantNumeric: 'tabular-nums' }}>
                      {sl.tbsp_on_hand != null ? sl.tbsp_on_hand.toFixed(1) : '—'}
                    </td>
                    <td data-label="Tbsp Needed" style={{ ...TD, fontVariantNumeric: 'tabular-nums' }}>
                      {sl.tbsp_needed > 0 ? (
                        <button
                          onClick={() => onTbspBreakdown(sl.id)}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 'inherit', fontVariantNumeric: 'tabular-nums', color: '#2C2C2C', textDecoration: 'underline', textDecorationColor: 'rgba(44,44,44,0.3)', textUnderlineOffset: 3, ...FONT }}
                        >
                          {sl.tbsp_needed.toFixed(1)}
                        </button>
                      ) : '—'}
                    </td>
                    <td data-label="Status" style={TD}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{
                          display: 'inline-block', fontSize: 11, fontWeight: 700,
                          padding: '3px 9px', borderRadius: 999,
                          background: `${statusColor}18`, color: statusColor,
                        }}>
                          {statusLabel}
                        </span>
                        {diffLabel != null && (
                          <span style={{ fontSize: 11, color: statusColor, fontVariantNumeric: 'tabular-nums', ...FONT }}>
                            ({diffLabel})
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )}

    <div>
      {/* Header row with Add button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <button onClick={() => setShowAddPanel(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2C2C2C', color: '#FAF9F6', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', ...FONT }}>
          <Plus size={13} /> Add Supply
        </button>
      </div>

      {/* Ingredient supply detail sidebar */}
      {sidebarSupplyId != null && (() => {
        const supply = supplies.find(s => s.id === sidebarSupplyId)
        if (!supply) return null
        const isEditing = editId === sidebarSupplyId
        const pkgLbs = supply.package_weight
        const pkgOz = supply.package_extra_oz ?? 0
        const pkgStr = pkgLbs != null
          ? [pkgLbs ? `${pkgLbs} lb` : '', pkgOz ? `${pkgOz} oz` : ''].filter(Boolean).join(' ') || '—'
          : '—'
        const servUnit = supply.serving_unit ?? 'tbsp'
        const fmtSize = (v: number | null) => v != null ? (Math.round(v * 10000) / 10000).toString() : '?'
        const servStr = supply.total_servings
          ? `${supply.total_servings} × ${fmtSize(supply.serving_size)} ${servUnit}`
          : supply.serving_size ? `${fmtSize(supply.serving_size)} ${servUnit}/serving` : '—'
        const ozPT = calcOzPerTbsp(supply)
        const cpt = calcCostPerTbsp(supply)
        const DETAIL_ROW: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }
        const DETAIL_LABEL: React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', ...FONT }
        const DETAIL_VAL: React.CSSProperties = { fontSize: 13, color: '#2C2C2C', ...FONT }

        const sl = supplyLevels?.find(s => s.id === sidebarSupplyId)
        const statusColor = sl?.missing_data ? '#C27A54' : (sl && sl.tbsp_needed > 0 && (sl.tbsp_on_hand ?? 0) < sl.tbsp_needed) ? '#C94040' : '#3A8A5A'
        const statusLabel = sl?.missing_data ? 'Missing data' : (sl && sl.tbsp_needed > 0 && (sl.tbsp_on_hand ?? 0) < sl.tbsp_needed) ? 'Short' : 'OK'
        const diff = sl?.tbsp_on_hand != null ? sl.tbsp_on_hand - sl.tbsp_needed : null
        const diffLabel = diff != null ? (diff >= 0 ? `+${diff.toFixed(1)} tbsp surplus` : `${diff.toFixed(1)} tbsp short`) : null

        const SB_LABEL: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.55)', display: 'block', marginBottom: 4, ...FONT }
        const SB_VAL: React.CSSProperties = { fontSize: 14, color: '#2C2C2C', fontWeight: 500, ...FONT }
        const SB_CARD: React.CSSProperties = { background: '#FAF9F6', border: '1px solid rgba(216,210,198,0.5)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 3 }

        return (
          <>
            <div className="fixed inset-0 z-40" style={{ background: 'rgba(44,44,44,0.22)' }} onClick={() => { setSidebarSupplyId(null); setEditId(null) }} />
            <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col bottom-sheet-wrap md:top-0 md:left-auto md:w-[420px]" style={{ background: '#fff', boxShadow: '0 -4px 32px rgba(44,44,44,0.14)' }}>

              {/* Header band */}
              <div style={{ background: '#2C2C2C', padding: '26px 28px 22px', position: 'relative' }}>
                <button
                  onClick={() => { setSidebarSupplyId(null); setEditId(null) }}
                  style={{ position: 'absolute', top: 16, right: 16, border: 'none', background: 'rgba(255,255,255,0.12)', color: '#FAF9F6', cursor: 'pointer', padding: '5px 7px', borderRadius: 6, display: 'flex', lineHeight: 1 }}
                >
                  <X size={15} />
                </button>
                <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(250,249,246,0.45)', margin: '0 0 6px', ...FONT }}>Ingredient Supply</p>
                <h2 style={{ ...SERIF, fontSize: 26, fontWeight: 700, margin: '0 0 10px', color: '#FAF9F6', lineHeight: 1.15 }}>{supply.name}</h2>
                {supply.vendor && (
                  <p style={{ fontSize: 12, color: 'rgba(250,249,246,0.55)', margin: 0, ...FONT }}>{supply.vendor}</p>
                )}
                {/* Stock status pill */}
                {sl && (
                  <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 999, background: `${statusColor}30`, color: statusColor, ...FONT }}>
                      {statusLabel}
                    </span>
                    {diffLabel && (
                      <span style={{ fontSize: 11.5, color: statusColor, fontVariantNumeric: 'tabular-nums', opacity: 0.9, ...FONT }}>{diffLabel}</span>
                    )}
                  </div>
                )}
              </div>

              {/* Body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {isEditing ? (
                  <>
                    <div>
                      <label style={PANEL_LABEL}>Supply name</label>
                      <input value={editForm.name} onChange={e => f('name', e.target.value, true)} style={PANEL_INPUT} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={PANEL_LABEL}>Vendor</label>
                        <input value={editForm.vendor} onChange={e => f('vendor', e.target.value, true)} placeholder="e.g. Amazon" style={PANEL_INPUT} />
                      </div>
                      <div>
                        <label style={PANEL_LABEL}>Order link</label>
                        <input value={editForm.order_url} onChange={e => f('order_url', e.target.value, true)} placeholder="https://…" style={PANEL_INPUT} />
                      </div>
                    </div>
                    <div>
                      <label style={PANEL_LABEL}>Package size</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input value={editForm.package_weight} onChange={e => f('package_weight', e.target.value, true)} placeholder="0" type="number" min="0" style={{ ...INPUT, flex: 1, textAlign: 'right' }} />
                        <span style={{ fontSize: 12, color: '#747474', flexShrink: 0, ...FONT }}>lb</span>
                        <input value={editForm.package_extra_oz} onChange={e => f('package_extra_oz', e.target.value, true)} placeholder="0" type="number" min="0" step="0.1" style={{ ...INPUT, flex: 1, textAlign: 'right' }} />
                        <span style={{ fontSize: 12, color: '#747474', flexShrink: 0, ...FONT }}>oz</span>
                      </div>
                    </div>
                    <div>
                      <label style={PANEL_LABEL}>Package cost</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 13, color: '#747474', ...FONT }}>$</span>
                        <input value={editForm.package_cost} onChange={e => f('package_cost', e.target.value, true)} placeholder="0.00" type="number" min="0" step="0.01" style={{ ...INPUT, flex: 1, textAlign: 'right' }} />
                      </div>
                    </div>
                    <div>
                      <label style={PANEL_LABEL}>Servings per package</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input value={editForm.total_servings} onChange={e => f('total_servings', e.target.value, true)} placeholder="0" type="number" min="0" style={{ ...INPUT, flex: 1, textAlign: 'right' }} />
                        <span style={{ fontSize: 12, color: '#747474', flexShrink: 0, ...FONT }}>×</span>
                        <input value={editForm.serving_size} onChange={e => f('serving_size', e.target.value, true)} placeholder="0" type="number" min="0" step="0.01" style={{ ...INPUT, flex: 1, textAlign: 'right' }} />
                        <select value={editForm.serving_unit} onChange={e => f('serving_unit', e.target.value, true)} style={{ ...SELECT, width: 64, flexShrink: 0 }}>
                          <option value="tbsp">tbsp</option>
                          <option value="tsp">tsp</option>
                          <option value="oz">oz</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={PANEL_LABEL}>oz / tbsp (auto)</label>
                        <input readOnly value={previewEdit.ozPerTbsp != null ? previewEdit.ozPerTbsp.toFixed(4) : ''} placeholder="—" style={PANEL_CALC} />
                      </div>
                      <div>
                        <label style={PANEL_LABEL}>$ / tbsp (auto)</label>
                        <input readOnly value={previewEdit.costPerTbsp != null ? previewEdit.costPerTbsp.toFixed(2) : ''} placeholder="—" style={PANEL_CALC} />
                      </div>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#2C2C2C', cursor: 'pointer', ...FONT }}>
                      <input type="checkbox" checked={editForm.active as unknown as boolean} onChange={e => f('active', e.target.checked, true)} style={{ width: 15, height: 15, accentColor: '#2C2C2C', cursor: 'pointer' }} />
                      Active
                    </label>
                  </>
                ) : (
                  <>
                    {/* Stock snapshot cards */}
                    {sl && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 4 }}>
                        <div style={{ ...SB_CARD, alignItems: 'center' }}>
                          <span style={{ ...SB_LABEL, textAlign: 'center' }}>On Hand</span>
                          <span style={{ fontSize: 22, fontWeight: 700, color: '#2C2C2C', fontVariantNumeric: 'tabular-nums', ...FONT }}>{sl.containers_on_hand}</span>
                          <span style={{ fontSize: 10, color: '#747474', ...FONT }}>containers</span>
                        </div>
                        <div style={{ ...SB_CARD, alignItems: 'center' }}>
                          <span style={{ ...SB_LABEL, textAlign: 'center' }}>Available</span>
                          <span style={{ fontSize: 22, fontWeight: 700, color: '#2C2C2C', fontVariantNumeric: 'tabular-nums', ...FONT }}>{sl.tbsp_on_hand != null ? sl.tbsp_on_hand.toFixed(0) : '—'}</span>
                          <span style={{ fontSize: 10, color: '#747474', ...FONT }}>tbsp</span>
                        </div>
                        <div
                          style={{ ...SB_CARD, alignItems: 'center', cursor: sl.tbsp_needed > 0 ? 'pointer' : 'default' }}
                          onClick={() => { if (sl && sl.tbsp_needed > 0) onTbspBreakdown(sl.id) }}
                          title={sl.tbsp_needed > 0 ? 'Click to see blend breakdown' : undefined}
                        >
                          <span style={{ ...SB_LABEL, textAlign: 'center' }}>Needed</span>
                          <span style={{ fontSize: 22, fontWeight: 700, color: sl.tbsp_needed > 0 ? '#C27A54' : '#2C2C2C', fontVariantNumeric: 'tabular-nums', ...FONT, textDecoration: sl.tbsp_needed > 0 ? 'underline' : 'none', textDecorationColor: 'rgba(194,122,84,0.4)', textUnderlineOffset: 3 }}>{sl.tbsp_needed > 0 ? sl.tbsp_needed.toFixed(0) : '—'}</span>
                          <span style={{ fontSize: 10, color: '#747474', ...FONT }}>tbsp</span>
                        </div>
                      </div>
                    )}

                    {/* Purchasing details */}
                    <div style={{ background: '#FAF9F6', border: '1px solid rgba(216,210,198,0.5)', borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.5)', margin: 0, ...FONT }}>Purchasing</p>
                      {(supply.vendor || supply.order_url) && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <span style={SB_LABEL}>Vendor</span>
                            <span style={SB_VAL}>{supply.vendor || '—'}</span>
                          </div>
                          {supply.order_url && (
                            <a href={supply.order_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: '#3d7684', textDecoration: 'none', background: 'rgba(61,118,132,0.08)', padding: '5px 10px', borderRadius: 6, ...FONT }}>
                              Order ↗
                            </a>
                          )}
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <div>
                          <span style={SB_LABEL}>Package size</span>
                          <span style={SB_VAL}>{pkgStr}</span>
                        </div>
                        <div>
                          <span style={SB_LABEL}>Package cost</span>
                          <span style={SB_VAL}>{supply.package_cost != null ? `$${supply.package_cost.toFixed(2)}` : '—'}</span>
                        </div>
                        <div>
                          <span style={SB_LABEL}>Servings</span>
                          <span style={SB_VAL}>{servStr}</span>
                        </div>
                        <div>
                          <span style={SB_LABEL}>tbsp / container</span>
                          <span style={{ ...SB_VAL, fontVariantNumeric: 'tabular-nums' }}>{sl?.tbsp_per_container != null ? sl.tbsp_per_container.toFixed(1) : ozPT != null ? (((supply.package_weight ?? 0) * 16 + (supply.package_extra_oz ?? 0)) / ozPT).toFixed(1) : '—'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Calibration */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div style={{ ...SB_CARD }}>
                        <span style={SB_LABEL}>oz / tbsp</span>
                        <span style={{ fontSize: 18, fontWeight: 700, color: '#2C2C2C', fontVariantNumeric: 'tabular-nums', ...FONT }}>{ozPT != null ? ozPT.toFixed(4) : '—'}</span>
                      </div>
                      <div style={{ ...SB_CARD }}>
                        <span style={SB_LABEL}>$ / tbsp</span>
                        <span style={{ fontSize: 18, fontWeight: 700, color: '#5c8a3f', fontVariantNumeric: 'tabular-nums', ...FONT }}>{cpt != null ? `$${cpt.toFixed(3)}` : '—'}</span>
                      </div>
                    </div>

                    {!supply.active && (
                      <div style={{ background: 'rgba(116,116,116,0.07)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#747474', ...FONT }}>
                        This supply is currently inactive.
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Footer */}
              <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(216,210,198,0.4)', display: 'flex', gap: 8, background: '#fff' }}>
                {isEditing ? (
                  <>
                    <button onClick={() => saveEdit(sidebarSupplyId)} style={{ flex: 1, padding: '11px 0', borderRadius: 8, border: 'none', background: '#2C2C2C', color: '#FAF9F6', fontSize: 13, fontWeight: 600, cursor: 'pointer', ...FONT }}>
                      Save changes
                    </button>
                    <button onClick={() => setEditId(null)} style={{ padding: '11px 18px', borderRadius: 8, border: '1px solid #D8D2C6', background: 'transparent', color: '#2C2C2C', fontSize: 13, fontWeight: 600, cursor: 'pointer', ...FONT }}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setEditId(sidebarSupplyId); setEditForm({ name: supply.name, vendor: supply.vendor ?? '', order_url: supply.order_url ?? '', package_weight: String(supply.package_weight ?? ''), package_extra_oz: String(supply.package_extra_oz ?? ''), serving_size: String(supply.serving_size ?? ''), serving_unit: supply.serving_unit ?? 'tbsp', total_servings: String(supply.total_servings ?? ''), package_cost: String(supply.package_cost ?? ''), category: supply.category, active: !!supply.active }) }}
                      style={{ flex: 1, padding: '11px 0', borderRadius: 8, border: 'none', background: '#2C2C2C', color: '#FAF9F6', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, ...FONT }}
                    >
                      <Pencil size={13} /> Edit supply
                    </button>
                    <button
                      onClick={async () => { await deleteSupply(supply.id); setSidebarSupplyId(null) }}
                      style={{ padding: '11px 14px', borderRadius: 8, border: '1px solid rgba(201,64,64,0.25)', background: 'rgba(201,64,64,0.05)', color: '#C94040', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, ...FONT }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </>
        )
      })()}

      {/* Order sidebar */}
      {orderSidebarId != null && (() => {
        const order = supplyOrders?.find(o => o.id === orderSidebarId)
        if (!order) return null
        const allDelivered = order.items.every(i => (deliverState[i.id]?.checked ?? i.delivered === 1))
        const statusColor = order.status === 'delivered' ? '#3A8A5A' : order.status === 'partial' ? '#C27A54' : '#3d7684'
        const statusLabel = order.status === 'delivered' ? 'Delivered' : order.status === 'partial' ? 'Partial' : 'Pending'
        return (
          <>
            <div className="fixed inset-0 z-40" style={{ background: 'rgba(44,44,44,0.22)' }} onClick={() => setOrderSidebarId(null)} />
            <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col overflow-y-auto bottom-sheet-wrap md:top-0 md:left-auto md:w-[420px]" style={{ background: '#FAF9F6', boxShadow: '0 -4px 32px rgba(44,44,44,0.13)' }}>
              <div style={{ background: '#2C2C2C', padding: '26px 28px 22px', position: 'relative' }}>
                <button onClick={() => setOrderSidebarId(null)} style={{ position: 'absolute', top: 18, right: 18, background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8, color: 'rgba(250,249,246,0.7)', cursor: 'pointer', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} /></button>
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(250,249,246,0.45)', marginBottom: 8, ...FONT }}>{order.vendor}</div>
                <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px', color: '#FAF9F6', fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
                  {order.order_number ? `Order #${order.order_number}` : order.subject ?? 'Supply Order'}
                </h2>
                <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: `${statusColor}30`, color: statusColor }}>
                  {statusLabel}
                </span>
                <div style={{ display: 'flex', gap: 20, marginTop: 14 }}>
                  {order.order_date && <div><div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(250,249,246,0.4)', ...FONT }}>Ordered</div><div style={{ fontSize: 13, color: '#FAF9F6', ...FONT }}>{new Date(order.order_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div></div>}
                  {order.estimated_delivery && <div><div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(250,249,246,0.4)', ...FONT }}>Est. Delivery</div><div style={{ fontSize: 13, color: '#FAF9F6', ...FONT }}>{new Date(order.estimated_delivery + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div></div>}
                  {order.tracking_number && <div><div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(250,249,246,0.4)', ...FONT }}>Tracking</div><div style={{ fontSize: 12, color: 'rgba(250,249,246,0.8)', ...FONT }}>{order.tracking_number}</div></div>}
                </div>
              </div>
              <div style={{ padding: '20px 28px', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: 0, ...FONT }}>Items</p>
                  {order.status !== 'delivered' && (
                    <button
                      onClick={() => {
                        setDeliverState(() => {
                          const allChecked: Record<number, { checked: boolean; qty: string }> = {}
                          for (const item of order.items) {
                            allChecked[item.id] = { checked: true, qty: String(item.delivered_qty ?? item.qty) }
                          }
                          return allChecked
                        })
                      }}
                      style={{ fontSize: 11, fontWeight: 600, color: '#3A8A5A', background: 'none', border: 'none', cursor: 'pointer', ...FONT }}
                    >
                      Check all
                    </button>
                  )}
                </div>
                {order.items.map(item => {
                  const state = deliverState[item.id] ?? { checked: item.delivered === 1, qty: String(item.delivered_qty ?? item.qty) }
                  return (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(216,210,198,0.4)' }}>
                      <input
                        type="checkbox"
                        checked={state.checked}
                        onChange={e => setDeliverState(prev => ({ ...prev, [item.id]: { ...state, checked: e.target.checked } }))}
                        style={{ marginTop: 2, accentColor: '#3A8A5A', width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500, color: '#2C2C2C', ...FONT }}>{item.description}</div>
                        {item.supply_name && item.supply_name !== item.description && (
                          <div style={{ fontSize: 11, color: '#747474', ...FONT }}>→ {item.supply_name}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        <input
                          type="number" min="0" step="1"
                          value={state.qty}
                          onChange={e => setDeliverState(prev => ({ ...prev, [item.id]: { ...state, qty: e.target.value } }))}
                          style={{ width: 64, fontSize: 12.5, ...FONT, border: '1px solid #D8D2C6', borderRadius: 6, padding: '4px 7px', outline: 'none', textAlign: 'right' }}
                        />
                        <span style={{ fontSize: 11, color: '#747474', ...FONT }}>{item.unit ?? 'units'}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ padding: '16px 28px 28px', borderTop: '1px solid rgba(216,210,198,0.5)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={() => onSaveDelivery(order.id)}
                  disabled={savingDelivery}
                  style={{ width: '100%', padding: '12px 0', borderRadius: 8, border: 'none', background: allDelivered ? '#3A8A5A' : '#2C2C2C', color: '#FAF9F6', fontSize: 13, fontWeight: 600, cursor: savingDelivery ? 'default' : 'pointer', ...FONT }}
                >
                  {savingDelivery ? 'Saving…' : allDelivered ? 'Mark all delivered' : 'Save delivery status'}
                </button>
                {!order.gmail_id && (
                  <button
                    onClick={() => onDeleteOrder(order.id)}
                    style={{ width: '100%', padding: '10px 0', borderRadius: 8, border: '1px solid rgba(201,64,64,0.3)', background: 'transparent', color: '#C94040', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', ...FONT }}
                  >
                    Delete this entry
                  </button>
                )}
              </div>
            </div>
          </>
        )
      })()}

      {/* Jar & Label Inventory */}
      {packagingLevels && packagingLevels.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 8px', ...FONT }}>Jar & Label Inventory</p>
          <div className="mob-tbl" style={{ background: '#fff', border: '1px solid rgba(120,183,197,0.35)', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(120,183,197,0.10)' }}>
                  {['Item', 'Units on Hand', 'Units Needed', 'Status'].map(h => (
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {packagingLevels.map(pl => {
                  const pkgInputVal = containerInputs[`pkg_${pl.id}`] ?? String(pl.units_on_hand)
                  const isShort = pl.units_needed > 0 && pl.units_on_hand < pl.units_needed
                  const isLow = !isShort && pl.units_on_hand < 24
                  const statusColor = isShort ? '#C94040' : isLow ? '#C27A54' : '#3A8A5A'
                  const statusLabel = isShort ? 'Short' : isLow ? 'Low' : 'OK'
                  const diff = pl.units_on_hand - pl.units_needed
                  const diffLabel = diff >= 0 ? `+${diff}` : String(diff)
                  return (
                    <tr key={pl.id} style={{ borderTop: '1px solid rgba(216,210,198,0.35)' }}>
                      <td style={TD}>
                        <div style={{ fontWeight: 600 }}>{pl.name}</div>
                        {pl.vendor && <div style={{ fontSize: 11, color: '#747474', ...FONT }}>{pl.vendor}</div>}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                          {pl.order_url && (
                            <a href={pl.order_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10.5, fontWeight: 600, color: '#3d7684', textDecoration: 'none', ...FONT }}>Order ↗</a>
                          )}
                          {(() => {
                            const pending = supplyOrders?.filter(o => o.status !== 'delivered' && o.items.some(i => i.supply_id === pl.id)) ?? []
                            return pending.map(o => (
                              <button key={o.id} onClick={() => setOrderSidebarId(o.id)}
                                style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(61,118,132,0.12)', color: '#3d7684', border: '1px solid rgba(61,118,132,0.25)', cursor: 'pointer', ...FONT }}>
                                On order ↗
                              </button>
                            ))
                          })()}
                          <button
                            onClick={() => setManualOrderFor({ supplyId: pl.id, name: pl.name, vendor: pl.vendor })}
                            title="Manually add on-order entry"
                            style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: 'transparent', color: '#a0a0a0', border: '1px solid rgba(160,160,160,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, ...FONT }}
                          >
                            <PackagePlus size={10} /> Order
                          </button>
                        </div>
                      </td>
                      <td data-label="Units on Hand" style={TD} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={pkgInputVal}
                            onChange={e => setContainerInputs(prev => ({ ...prev, [`pkg_${pl.id}`]: e.target.value }))}
                            onBlur={async () => {
                              const val = pkgInputVal
                              if (val == null) return
                              await fetch(`/api/supplies/${pl.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ containers_on_hand: parseFloat(val) || 0 }),
                              })
                              onSupplyLevelChange()
                            }}
                            onKeyDown={async e => {
                              if (e.key === 'Enter') {
                                const val = pkgInputVal
                                if (val == null) return
                                await fetch(`/api/supplies/${pl.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ containers_on_hand: parseFloat(val) || 0 }),
                                })
                                onSupplyLevelChange()
                              }
                            }}
                            style={{ ...INPUT, width: 90, textAlign: 'right' }}
                          />
                          <span style={{ fontSize: 11.5, color: '#747474', ...FONT }}>units</span>
                        </div>
                      </td>
                      <td data-label="Units Needed" style={{ ...TD, fontVariantNumeric: 'tabular-nums' }}>
                        {pl.units_needed > 0 ? pl.units_needed : '—'}
                      </td>
                      <td data-label="Status" style={TD}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: `${statusColor}18`, color: statusColor }}>
                            {statusLabel}
                          </span>
                          {pl.units_needed > 0 && (
                            <span style={{ fontSize: 11, color: statusColor, fontVariantNumeric: 'tabular-nums', ...FONT }}>({diffLabel})</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per-blend label inventory — state lives in SuppliesTab via showHiddenLabels */}
      {labelInventory && labelInventory.length > 0 && (() => {
        const visible = showHiddenLabels ? labelInventory : labelInventory.filter(r => !r.excluded)
        const hiddenCount = labelInventory.filter(r => r.excluded).length
        const toggleExcluded = async (shopifyId: string, excluded: boolean) => {
          await fetch('/api/inventory/label-inventory', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shopify_product_id: shopifyId, excluded }),
          })
          onSupplyLevelChange()
        }
        return (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: 0, ...FONT }}>Label Inventory by Blend</p>
              {hiddenCount > 0 && (
                <button
                  onClick={() => setShowHiddenLabels(p => !p)}
                  style={{ fontSize: 11, fontWeight: 600, color: '#747474', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, ...FONT }}
                >
                  {showHiddenLabels ? <Eye size={12} /> : <EyeOff size={12} />}
                  {showHiddenLabels ? `Hide ${hiddenCount} excluded` : `Show ${hiddenCount} excluded`}
                </button>
              )}
            </div>
            <div className="mob-tbl" style={{ background: '#fff', border: '1px solid rgba(120,183,197,0.35)', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(120,183,197,0.10)' }}>
                    {['Blend', 'Labels on Hand', 'Labels Needed', 'Status', ''].map(h => (
                      <th key={h} style={TH}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map(row => {
                    const inputKey = `label_${row.shopify_id}`
                    const inputVal = containerInputs[inputKey] ?? String(row.units_on_hand)
                    const isShort = row.units_needed > 0 && row.units_on_hand < row.units_needed
                    const isLow = !isShort && row.units_on_hand >= 0 && row.units_on_hand <= 5
                    const statusColor = isShort ? '#C94040' : isLow ? '#C27A54' : '#3A8A5A'
                    const diff = row.units_on_hand - row.units_needed
                    const diffLabel = diff >= 0 ? `+${diff}` : String(diff)
                    const labelOnOrder = supplyOrders?.filter(o =>
                      o.status !== 'delivered' && o.status !== 'skipped' &&
                      o.items.some(i => i.shopify_product_id === row.shopify_id)
                    ) ?? []

                    const saveLabel = async () => {
                      if (row.supply_id == null) return
                      await fetch('/api/inventory/label-inventory', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ shopify_product_id: row.shopify_id, supply_id: row.supply_id, units_on_hand: parseInt(inputVal) || 0 }),
                      })
                      onSupplyLevelChange()
                    }

                    return (
                      <tr key={row.shopify_id} style={{ borderTop: '1px solid rgba(216,210,198,0.35)', opacity: row.excluded ? 0.5 : 1 }}>
                        <td style={TD}>
                          <div style={{ fontWeight: 600, color: row.excluded ? '#747474' : '#2C2C2C' }}>{row.title}</div>
                          {row.excluded && <div style={{ fontSize: 10, color: '#a0a0a0', ...FONT }}>excluded from labels</div>}
                        </td>
                        <td data-label="Labels on Hand" style={TD} onClick={e => e.stopPropagation()}>
                          {!row.excluded && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={inputVal}
                                onChange={e => setContainerInputs(prev => ({ ...prev, [inputKey]: e.target.value }))}
                                onBlur={saveLabel}
                                onKeyDown={e => { if (e.key === 'Enter') saveLabel() }}
                                style={{ ...INPUT, width: 90, textAlign: 'right' }}
                              />
                              <span style={{ fontSize: 11.5, color: '#747474', ...FONT }}>labels</span>
                            </div>
                          )}
                        </td>
                        <td data-label="Labels Needed" style={{ ...TD, fontVariantNumeric: 'tabular-nums' }}>
                          {!row.excluded && (row.units_needed > 0 ? row.units_needed : '—')}
                        </td>
                        <td data-label="Status" style={TD}>
                          {!row.excluded && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: `${statusColor}18`, color: statusColor }}>
                                {isShort ? 'Short' : isLow ? 'Low' : 'OK'}
                              </span>
                              {row.units_needed > 0 && (
                                <span style={{ fontSize: 11, color: statusColor, fontVariantNumeric: 'tabular-nums', ...FONT }}>({diffLabel})</span>
                              )}
                              {labelOnOrder.map(o => (
                                <button key={o.id} onClick={() => setOrderSidebarId(o.id)}
                                  style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 999, background: 'rgba(61,118,132,0.12)', color: '#3d7684', border: 'none', cursor: 'pointer', ...FONT }}>
                                  On order ↗
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                        <td style={{ ...TD, textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                            {!row.excluded && row.supply_id != null && (
                              <button
                                onClick={() => setManualOrderFor({ supplyId: row.supply_id, name: `Label: ${row.title}`, shopifyProductId: row.shopify_id })}
                                title="Add manual order"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c0c0c0', padding: 4, display: 'flex', alignItems: 'center' }}
                              >
                                <PackagePlus size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => toggleExcluded(row.shopify_id, !row.excluded)}
                              title={row.excluded ? 'Include in label inventory' : 'Exclude from label inventory'}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: row.excluded ? '#3d7684' : '#c0c0c0', padding: 4, display: 'flex', alignItems: 'center' }}
                            >
                              {row.excluded ? <Eye size={14} /> : <EyeOff size={14} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}

      {/* Packaging supplies table */}
      <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 8px', ...FONT }}>Packaging Supplies</p>
      <div className="mob-tbl" style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(120,183,197,0.12)' }}>
              {['Supply', 'Vendor', 'Order Link', 'Units', 'Total Cost', 'Cost/Unit', 'Active', ''].map(h => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {packagingSupplies.length === 0 && (
              <tr><td colSpan={8} style={{ ...TD, padding: '20px 14px', color: '#747474' }}>No packaging supplies yet.</td></tr>
            )}
            {packagingSupplies.map(s => {
              const isEditing = editId === s.id
              const cpu = costPerUnit(s)

              if (isEditing) {
                return (
                  <tr key={s.id} style={{ borderTop: '1px solid rgba(216,210,198,0.35)' }}>
                    <td colSpan={8} style={{ padding: '12px 14px', background: 'rgba(120,183,197,0.08)' }}>
                      {EDIT_TOP_ROW(true)}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11.5, color: '#747474', flexShrink: 0, ...FONT }}>Units:</span>
                        <input value={editForm.total_servings} onChange={e => f('total_servings', e.target.value, true)} placeholder="qty" type="number" style={{ ...INPUT, width: 80, flexShrink: 0, textAlign: 'right' }} />
                        <span style={{ fontSize: 11.5, color: '#747474', flexShrink: 0, marginLeft: 8, ...FONT }}>Total cost: $</span>
                        <input value={editForm.package_cost} onChange={e => f('package_cost', e.target.value, true)} placeholder="0.00" type="number" step="0.01" style={{ ...INPUT, width: 80, flexShrink: 0, textAlign: 'right' }} />
                        <span style={{ fontSize: 11.5, color: '#747474', flexShrink: 0, marginLeft: 8, ...FONT }}>Cost/unit:</span>
                        <input readOnly value={previewEditCostPerUnit != null ? `$${previewEditCostPerUnit.toFixed(2)}` : ''} placeholder="auto" style={{ ...CALC_INPUT, width: 88, flexShrink: 0, textAlign: 'right' }} />
                        <label style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, fontSize: 11.5, color: '#2C2C2C', cursor: 'pointer', marginLeft: 8, ...FONT }}>
                          <input type="checkbox" checked={editForm.active as unknown as boolean} onChange={e => f('active', e.target.checked, true)} style={{ width: 14, height: 14, accentColor: '#2C2C2C', cursor: 'pointer' }} /> Active
                        </label>
                        {EDIT_ACTIONS(s.id)}
                      </div>
                    </td>
                  </tr>
                )
              }

              return (
                <tr key={s.id} style={{ borderTop: '1px solid rgba(216,210,198,0.35)', opacity: s.active ? 1 : 0.5 }}>
                  <td style={TD}><span style={{ fontWeight: 600 }}>{s.name}</span></td>
                  <td data-label="Vendor" style={{ ...TD, color: '#747474' }}>{s.vendor ?? '—'}</td>
                  <td data-label="Order Link" style={TD}>
                    {s.order_url
                      ? <a href={s.order_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: '#3d7684', textDecoration: 'none', ...FONT }}>Order ↗</a>
                      : <span style={{ color: '#747474' }}>—</span>}
                  </td>
                  <td data-label="Units" style={TD}>{s.total_servings ? s.total_servings.toLocaleString() : '—'}</td>
                  <td data-label="Total Cost" style={TD}>{s.package_cost != null ? `$${s.package_cost.toFixed(2)}` : '—'}</td>
                  <td data-label="Cost/Unit" style={{ ...TD, fontWeight: 700, color: '#3d7684' }}>{cpu != null ? `$${cpu.toFixed(2)}` : '—'}</td>
                  <td data-label="Active" style={{ ...TD, textAlign: 'center' }}>
                    <input type="checkbox" checked={!!s.active} onChange={() => toggleActive(s)} style={{ width: 15, height: 15, accentColor: '#2C2C2C', cursor: 'pointer' }} />
                  </td>
                  <td style={{ ...TD, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => { setEditId(s.id); setEditForm({ name: s.name, vendor: s.vendor ?? '', order_url: s.order_url ?? '', package_weight: String(s.package_weight ?? ''), package_extra_oz: String(s.package_extra_oz ?? ''), serving_size: String(s.serving_size ?? ''), serving_unit: s.serving_unit ?? 'tsp', total_servings: String(s.total_servings ?? ''), package_cost: String(s.package_cost ?? ''), category: s.category, active: !!s.active }) }} style={{ border: 'none', background: 'transparent', color: 'rgba(116,116,116,0.5)', cursor: 'pointer', padding: 2, marginRight: 6 }}>
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => deleteSupply(s.id)} style={{ border: 'none', background: 'transparent', color: 'rgba(116,116,116,0.4)', cursor: 'pointer', padding: 2 }}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
    </>
  )
}

// ─── Product card ─────────────────────────────────────────────────────────────

function ProductCard({ product, displayQty, needed, onClick }: { product: ShopifyProduct; displayQty: number; needed: number; onClick: () => void }) {
  const accent = ACCENT_HEX[product.accent_color ?? 'sage'] ?? '#9BAE9A'
  const shownQty = product.is_bundle
    ? Math.max(0, displayQty)
    : Math.max(0, needed + product.shopify_qty)
  const isShort = needed > 0 && shownQty < needed
  const stockColor = isShort ? '#C94040' : '#3A8A5A'

  return (
    <div
      onClick={onClick}
      onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.boxShadow = '0 4px 18px rgba(44,44,44,0.10)'; el.style.borderColor = 'rgba(216,210,198,0.9)' }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.boxShadow = '0 1px 3px rgba(44,44,44,0.05)'; el.style.borderColor = 'rgba(216,210,198,0.6)' }}
      style={{
        background: '#fff', borderRadius: 12,
        border: '1px solid rgba(216,210,198,0.6)',
        boxShadow: '0 1px 3px rgba(44,44,44,0.05)',
        display: 'flex', overflow: 'hidden', cursor: 'pointer',
        transition: 'box-shadow 0.18s, border-color 0.18s',
      }}
    >
      <div style={{ width: 4, flexShrink: 0, background: accent }} />
      <div style={{ flex: 1, padding: '15px 16px 14px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 11 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#2C2C2C', margin: 0, lineHeight: 1.2, ...SERIF }}>{product.title}</p>
          {!!product.is_bundle && (
            <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#78B7C5', background: 'rgba(120,183,197,0.14)', padding: '2px 7px', borderRadius: 999, flexShrink: 0, marginTop: 2, ...FONT }}>Bundle</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20 }}>
          <div>
            <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(116,116,116,0.5)', margin: '0 0 1px', ...FONT }}>Stock</p>
            <p style={{ fontSize: 22, fontWeight: 700, margin: 0, color: stockColor, lineHeight: 1, ...FONT }}>{shownQty}</p>
          </div>
          {product.price && (
            <div>
              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(116,116,116,0.5)', margin: '0 0 2px', ...FONT }}>Price</p>
              <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#2C2C2C', ...FONT }}>${product.price}</p>
            </div>
          )}
          {needed > 0 && (
            <div>
              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(116,116,116,0.5)', margin: '0 0 2px', ...FONT }}>Needed</p>
              <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#C27A54', ...FONT }}>{needed}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Order sidebar ────────────────────────────────────────────────────────────

interface OrderData {
  id: number
  shopify_id: string
  order_number: number
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  total_price: number
  subtotal_price: number
  financial_status: string
  fulfillment_status: string | null
  line_items: string
  created_at: string
  total_tax: number
  total_discounts: number
  total_shipping: number
  discount_codes: string
}

interface OrderLineItem {
  id: number
  title: string
  name: string
  quantity: number
  fulfillable_quantity: number
  price: string
  sku: string
  variant_title: string | null
  total_discount: string
}

function OrderSidebar({ orderNumber, onClose }: { orderNumber: number; onClose: () => void }) {
  const [order, setOrder] = useState<OrderData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/inventory/order/${orderNumber}`)
      .then(r => r.json())
      .then(d => setOrder(d))
      .finally(() => setLoading(false))
  }, [orderNumber])

  const shopifyUrl = order
    ? `https://admin.shopify.com/store/eiy0fe-13/orders/${order.shopify_id}`
    : null

  const lineItems: OrderLineItem[] = (() => {
    if (!order) return []
    try { return JSON.parse(order.line_items) } catch { return [] }
  })()

  const discountCodes: { code: string; amount: string }[] = (() => {
    if (!order) return []
    try { return JSON.parse(order.discount_codes) } catch { return [] }
  })()

  const STAT_ROW = (label: string, val: string, highlight?: boolean) => (
    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid rgba(216,210,198,0.4)' }}>
      <span style={{ fontSize: 12, color: '#747474', ...FONT }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: highlight ? 700 : 500, color: '#2C2C2C', ...FONT }}>{val}</span>
    </div>
  )

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(116,116,116,0.25)' }} onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-white shadow-2xl bottom-sheet-wrap md:top-0 md:left-auto md:w-[400px]">
        {/* Header */}
        <div style={{ padding: '22px 24px', borderBottom: '1px solid rgba(216,210,198,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 4px', ...FONT }}>Shopify Order</p>
            <h2 style={{ ...SERIF, fontSize: 22, fontWeight: 700, margin: 0, color: '#2C2C2C' }}>#{orderNumber}</h2>
            {order && (order.first_name || order.last_name) && (
              <p style={{ fontSize: 14, fontWeight: 600, color: '#2C2C2C', margin: '4px 0 0', ...FONT }}>
                {[order.first_name, order.last_name].filter(Boolean).join(' ')}
              </p>
            )}
            {order && order.email && (
              <p style={{ fontSize: 12, color: '#747474', margin: '2px 0 0', ...FONT }}>{order.email}</p>
            )}
            {order && order.phone && (
              <p style={{ fontSize: 12, color: '#747474', margin: '1px 0 0', ...FONT }}>{order.phone}</p>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {shopifyUrl && (
              <a href={shopifyUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, fontWeight: 600, color: '#3d7684', textDecoration: 'none', ...FONT, display: 'flex', alignItems: 'center', gap: 4 }}>
                <ExternalLink size={12} /> Shopify
              </a>
            )}
            <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: 'rgba(116,116,116,0.5)', cursor: 'pointer', padding: 6, display: 'flex' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {loading ? (
            <p style={{ color: '#747474', fontSize: 13, ...FONT }}>Loading…</p>
          ) : !order ? (
            <p style={{ color: '#C27A54', fontSize: 13, ...FONT }}>Order not found.</p>
          ) : (
            <>
              {/* Status badges */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { label: order.financial_status, ok: order.financial_status === 'paid' },
                  { label: order.fulfillment_status ?? 'unfulfilled', ok: order.fulfillment_status === 'fulfilled' },
                ].map(({ label, ok }) => (
                  <span key={label} style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                    padding: '3px 10px', borderRadius: 999,
                    background: ok ? 'rgba(92,138,63,0.12)' : 'rgba(194,122,84,0.12)',
                    color: ok ? '#5c8a3f' : '#C27A54',
                    border: `1px solid ${ok ? 'rgba(92,138,63,0.25)' : 'rgba(194,122,84,0.25)'}`,
                    ...FONT,
                  }}>{label}</span>
                ))}
              </div>

              {/* Date */}
              {STAT_ROW('Placed', new Date(order.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }))}
              {discountCodes.length > 0 && STAT_ROW('Discount', discountCodes.map(d => d.code).join(', '))}

              {/* Line items */}
              <div>
                <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 10px', ...FONT }}>Items</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {lineItems.map(item => {
                    const lineTotal = parseFloat(item.price) * item.quantity - parseFloat(item.total_discount || '0')
                    const unfulfilled = item.fulfillable_quantity > 0
                    return (
                      <div key={item.id} style={{
                        display: 'flex', alignItems: 'flex-start', gap: 12,
                        padding: '11px 14px', background: '#FAF9F6', borderRadius: 8, marginBottom: 4,
                        border: unfulfilled ? '1px solid rgba(194,122,84,0.2)' : '1px solid transparent',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: '#2C2C2C', margin: '0 0 2px', ...FONT }}>{item.title}</p>
                          {item.variant_title && (
                            <p style={{ fontSize: 11, color: '#747474', margin: '0 0 4px', ...FONT }}>{item.variant_title}</p>
                          )}
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11.5, color: '#747474', ...FONT }}>qty {item.quantity}</span>
                            {unfulfilled && (
                              <span style={{ fontSize: 10.5, fontWeight: 700, color: '#C27A54', ...FONT }}>
                                {item.fulfillable_quantity} to pack
                              </span>
                            )}
                            {item.sku && <span style={{ fontSize: 10.5, color: 'rgba(116,116,116,0.5)', ...FONT }}>SKU: {item.sku}</span>}
                          </div>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#2C2C2C', flexShrink: 0, ...FONT }}>
                          ${lineTotal.toFixed(2)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Totals */}
              <div style={{ background: '#FBF0E3', borderRadius: 10, padding: '14px 16px' }}>
                {[
                  { label: 'Subtotal', val: `$${Number(order.subtotal_price).toFixed(2)}` },
                  order.total_discounts > 0 && { label: 'Discounts', val: `-$${Number(order.total_discounts).toFixed(2)}` },
                  order.total_shipping > 0 && { label: 'Shipping', val: `$${Number(order.total_shipping).toFixed(2)}` },
                  { label: 'Tax', val: `$${Number(order.total_tax).toFixed(2)}` },
                ].filter(Boolean).map((r) => {
                  const row = r as { label: string; val: string }
                  return (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(216,210,198,0.4)' }}>
                      <span style={{ fontSize: 12, color: '#747474', ...FONT }}>{row.label}</span>
                      <span style={{ fontSize: 12, color: '#2C2C2C', ...FONT }}>{row.val}</span>
                    </div>
                  )
                })}
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#2C2C2C', ...FONT }}>Total</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#2C2C2C', ...FONT }}>${Number(order.total_price).toFixed(2)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Blend recipe sidebar ─────────────────────────────────────────────────────

function BlendRecipeSidebar({ blend, shopifyId, canFill, jarsNeeded, onClose }: { blend: string; shopifyId: string; canFill: number; jarsNeeded: number; onClose: () => void }) {
  const [details, setDetails] = useState<ProductDetails | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/inventory/product-details/${shopifyId}`)
      .then(r => r.json())
      .then((d: ProductDetails) => setDetails(d))
      .finally(() => setLoading(false))
  }, [shopifyId])

  const totalTbsp = details?.ingredients.reduce((s, r) => s + r.tbsp, 0) ?? 0

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(116,116,116,0.25)' }} onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-white shadow-2xl bottom-sheet-wrap md:top-0 md:left-auto md:w-[420px]">
        <div style={{ padding: '22px 24px', borderBottom: '1px solid rgba(216,210,198,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 4px', ...FONT }}>Blend recipe</p>
            <h2 style={{ ...SERIF, fontSize: 22, fontWeight: 700, margin: '0 0 6px', color: '#2C2C2C' }}>{blend}</h2>
            {jarsNeeded > 0 && (() => {
              const isBlocked = canFill === 0
              const isPartial = canFill > 0 && canFill < jarsNeeded
              if (isBlocked) return (
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', padding: '3px 9px', borderRadius: 999, background: 'rgba(154,58,58,0.1)', color: '#9a3a3a', ...FONT }}>
                  Blocked — {jarsNeeded} jars needed
                </span>
              )
              if (isPartial) return (
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', padding: '3px 9px', borderRadius: 999, background: 'rgba(194,122,84,0.12)', color: '#C27A54', ...FONT }}>
                  Can fill {canFill} of {jarsNeeded} jars
                </span>
              )
              return null
            })()}
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: 'rgba(116,116,116,0.5)', cursor: 'pointer', padding: 6, display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {loading ? (
            <p style={{ color: '#747474', fontSize: 13, ...FONT }}>Loading…</p>
          ) : !details || details.ingredients.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#2C2C2C', margin: '0 0 6px', ...FONT }}>No ingredients yet</p>
              <p style={{ fontSize: 12, color: '#747474', margin: 0, ...FONT }}>Open the product in the Products tab to add the blend formula.</p>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 10px', ...FONT }}>Ingredients & Supplies</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(216,210,198,0.5)' }}>
                {details.ingredients.map((ing, i) => {
                  const oz = ing.oz_per_tbsp != null ? (ing.tbsp * ing.oz_per_tbsp).toFixed(2) : null
                  // Compute how many jars this ingredient alone allows
                  const totalOz = (ing.package_weight ?? 0) * 16 + (ing.package_extra_oz ?? 0)
                  const tbspPerContainer = (totalOz > 0 && ing.oz_per_tbsp) ? totalOz / ing.oz_per_tbsp : 0
                  const tbspOnHand = Math.max(0, ing.containers_on_hand) * tbspPerContainer
                  const maxFromThis = (tbspPerContainer > 0 && ing.tbsp > 0) ? Math.floor(tbspOnHand / ing.tbsp) : Infinity
                  // Highlight when this ingredient caps us at canFill and canFill < what's needed
                  const isBlocking = canFill < jarsNeeded && maxFromThis <= canFill
                  return (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px', gap: 8, alignItems: 'center', padding: '11px 14px', background: isBlocking ? 'rgba(154,58,58,0.06)' : i % 2 === 0 ? '#fff' : '#FAFAF8', borderLeft: isBlocking ? '3px solid #9a3a3a' : '3px solid transparent' }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: isBlocking ? '#9a3a3a' : '#2C2C2C', ...FONT }}>{ing.supply_name}</span>
                      <span style={{ fontSize: 13, color: isBlocking ? '#b05050' : '#747474', textAlign: 'right', fontVariantNumeric: 'tabular-nums', ...FONT }}>{ing.tbsp} tbsp</span>
                      {oz && <span style={{ fontSize: 12, color: isBlocking ? 'rgba(154,58,58,0.6)' : 'rgba(116,116,116,0.6)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', ...FONT }}>{oz} oz</span>}
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px 0', borderTop: '1px solid rgba(216,210,198,0.4)', marginTop: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#747474', textTransform: 'uppercase', letterSpacing: '0.08em', ...FONT }}>Total</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#2C2C2C', fontVariantNumeric: 'tabular-nums', ...FONT }}>{totalTbsp.toFixed(2)} tbsp</span>
              </div>
              {details.packaging.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 10px', ...FONT }}>Packaging</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(216,210,198,0.5)' }}>
                    {details.packaging.map((pkg, i) => (
                      <div key={i} style={{ padding: '11px 14px', background: i % 2 === 0 ? '#fff' : '#FAFAF8' }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#2C2C2C', ...FONT }}>{pkg.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Types for orders analysis ────────────────────────────────────────────────

interface OrderAnalysisItem {
  title: string
  variantTitle: string | null
  sku: string
  price: string
  needed: number
  inventoryQty: number  // raw Shopify qty (can be negative)
  onHand: number        // max(0, inventoryQty)
  canFill: number
  short: number
  productId: string
  assignedQty: number   // qty from stored manual assignment (0 if FIFO)
}

interface OrderAnalysis {
  orderId: number
  shopifyId: string
  orderNumber: number
  email: string
  totalPrice: number
  financialStatus: string
  fulfillmentStatus: string | null
  createdAt: string
  items: OrderAnalysisItem[]
  totalNeeded: number
  totalCanFill: number
  totalShort: number
  status: 'ready' | 'partial' | 'short'
}

interface SupplyLevel {
  id: number
  name: string
  vendor: string | null
  order_url: string | null
  package_cost: number | null
  containers_on_hand: number
  tbsp_per_container: number | null
  tbsp_on_hand: number | null
  tbsp_needed: number
  missing_data: boolean
  updated_at: string | null
}

interface PackagingLevel {
  id: number
  name: string
  vendor: string | null
  order_url: string | null
  package_cost: number | null
  units_per_package: number | null
  units_on_hand: number
  units_needed: number
}

interface LabelInventoryRow {
  shopify_id: string
  title: string
  supply_id: number | null
  units_on_hand: number
  units_needed: number
  labeled_jars: number
  excluded: boolean
}

interface SupplyOrderItem {
  id: number
  supply_order_id: number
  supply_id: number | null
  shopify_product_id: string | null
  description: string
  qty: number
  unit: string | null
  delivered: number
  delivered_at: string | null
  delivered_qty: number | null
  supply_name: string | null
}

interface SupplyOrder {
  id: number
  gmail_id: string | null
  vendor: string
  order_number: string | null
  order_date: string | null
  estimated_delivery: string | null
  tracking_number: string | null
  status: string
  subject: string | null
  created_at: string
  items: SupplyOrderItem[]
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const [products, setProducts] = useState<ShopifyProduct[]>([])
  const [supplies, setSupplies] = useState<Supply[]>([])
  const [allBundleComponents, setAllBundleComponents] = useState<(BundleComponent & { bundle_shopify_id: string })[]>([])
  const [shopifyStatus, setShopifyStatus] = useState<ShopifyStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [tab, setTab] = useState<'products' | 'supplies' | 'pack-queue' | 'orders'>('products')

  interface FillRecommendation {
    shopifyId: string; blend: string; currentStock: number; totalSold: number
    unitsPerWeek: number; weeksOfStock: number | null; suggestedFill: number
  }
  interface FillPlanData { jarsOnHand: number; weeksOfHistory: number; recommendations: FillRecommendation[] }
  const [fillPlan, setFillPlan] = useState<FillPlanData | null>(null)
  const [fillPlanLoading, setFillPlanLoading] = useState(false)
  const loadFillPlan = useCallback(async () => {
    setFillPlanLoading(true)
    const res = await fetch('/api/inventory/fill-recommendations')
    setFillPlan(await res.json())
    setFillPlanLoading(false)
  }, [])
  type PackQueueRow = { blend: string; jars: number; orderCount: number; orderNumbers: number[]; orderBreakdown: { orderNumber: number; qty: number; createdAt: string }[]; shopifyId: string; labeledJars: number; canFill: number; fillableNow: number; fullyFillable: boolean; limitingIngredient: string | null }
  const [packQueue, setPackQueue] = useState<{ rows: PackQueueRow[]; totalJars: number; openOrderCount: number; recommendations: PackQueueRow[] } | null>(null)
  const [packConfirm, setPackConfirm] = useState<{ shopifyId: string; blend: string; qty: number; assignments: { orderNumber: number; needed: number; assign: number; alreadyAssigned: number }[] } | null>(null)
  const [packLoading, setPackLoading] = useState(false)
  const [packedQtys, setPackedQtys] = useState<Record<string, string>>({})
  const [packingFor, setPackingFor] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [labelingQtys, setLabelingQtys] = useState<Record<string, string>>({})
  const [labelingFor, setLabelingFor] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [ordersAnalysis, setOrdersAnalysis] = useState<OrderAnalysis[] | null>(null)
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<number | null>(null)
  const [reassignModal, setReassignModal] = useState<{ productId: string; title: string; fromOrderNumber: number; fromCanFill: number; toOrderNumber: number | null; qty: number } | null>(null)
  const [reassigning, setReassigning] = useState(false)
  const [selectedBlend, setSelectedBlend] = useState<{ blend: string; shopifyId: string; canFill: number; jarsNeeded: number } | null>(null)
  const [supplyBreakdown, setSupplyBreakdown] = useState<{ supplyName: string; items: { blend: string; jars: number; tbspPerJar: number; totalTbsp: number }[] } | null>(null)
  const [supplyBreakdownLoading, setSupplyBreakdownLoading] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<ShopifyProduct | null>(null)
  const [supplyLevels, setSupplyLevels] = useState<SupplyLevel[] | null>(null)
  const [packagingLevels, setPackagingLevels] = useState<PackagingLevel[] | null>(null)
  const [labelInventory, setLabelInventory] = useState<LabelInventoryRow[] | null>(null)
  const [supplyOrders, setSupplyOrders] = useState<SupplyOrder[] | null>(null)
  const [orderSidebarId, setOrderSidebarId] = useState<number | null>(null)
  const [deliverState, setDeliverState] = useState<Record<number, { checked: boolean; qty: string }>>({})
  const [savingDelivery, setSavingDelivery] = useState(false)
  const [syncingOrders, setSyncingOrders] = useState(false)
  const [syncResult, setSyncResult] = useState<{ synced: number; found: number } | null>(null)
  const [notifOpen, setNotifOpen] = useState(false)
  const [manualOrderFor, setManualOrderFor] = useState<{ supplyId: number | null; name: string; vendor?: string | null; shopifyProductId?: string } | null>(null)
  const [manualOrderForm, setManualOrderForm] = useState({ vendor: '', description: '', qty: '', expectedDelivery: '' })
  const [manualOrderDupes, setManualOrderDupes] = useState<{ id: number; vendor: string; order_date: string | null; status: string }[] | null>(null)
  const [addingManualOrder, setAddingManualOrder] = useState(false)
  const [blendOrdersDrawer, setBlendOrdersDrawer] = useState<{ blend: string; orderNumbers: number[] } | null>(null)

  const loadData = useCallback(async () => {
    const [invRes, supRes, statusRes, bundleRes] = await Promise.all([
      fetch('/api/inventory'),
      fetch('/api/supplies'),
      fetch('/api/shopify/connect'),
      fetch('/api/inventory/bundle-components'),
    ])
    const invData = await invRes.json() as { source: string; rows: Parameters<typeof parseProduct>[0][] }
    const supData = await supRes.json()
    const status = await statusRes.json() as ShopifyStatus
    const bundleData = await bundleRes.json()
    setShopifyStatus(status)
    if (invData.source === 'shopify') setProducts(invData.rows.map(parseProduct))
    setSupplies(Array.isArray(supData) ? supData : [])
    setAllBundleComponents(Array.isArray(bundleData) ? bundleData : [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData(); loadPackQueue(); loadOrdersAnalysis() }, [loadData])

  // Refresh when tab/app becomes visible (handles iPhone home screen resume + desktop tab switching)
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') { loadData(); loadPackQueue() } }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadData])

  async function handleSync() {
    setSyncing(true)
    try {
      await fetch('/api/shopify/sync', { method: 'POST' })
      await loadData()
      loadPackQueue()
      loadOrdersAnalysis()
      loadSupplyLevels()
      loadPackagingLevels()
      loadLabelInventory()
      loadSupplyOrders()
    } finally { setSyncing(false) }
  }

  function getDisplayQty(p: ShopifyProduct): number {
    if (!p.is_bundle) return p.shopify_qty
    const comps = allBundleComponents.filter(c => c.bundle_shopify_id === p.shopify_id)
    return computeBundleQty(p.shopify_id, comps, products)
  }

  const activeNonBundle = products.filter(p => p.status === 'active' && !p.is_bundle)
  const activeBundles = products.filter(p => p.status === 'active' && !!p.is_bundle)
  const active = [...activeNonBundle, ...activeBundles]
  const draft = products.filter(p => p.status === 'draft')
  const criticalProducts = products.filter(p => p.status === 'active' && !p.is_bundle && getDisplayQty(p) < 2)
  const warningProducts  = products.filter(p => p.status === 'active' && !p.is_bundle && getDisplayQty(p) >= 2 && getDisplayQty(p) < p.reorder_threshold)
  const lowCount = criticalProducts.length + warningProducts.length

  const syncedLabel = shopifyStatus?.last_synced_at
    ? new Date(shopifyStatus.last_synced_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Never'

  function loadPackQueue() {
    setPackLoading(true)
    fetch('/api/inventory/pack-queue')
      .then(r => r.json())
      .then(d => setPackQueue(d))
      .finally(() => setPackLoading(false))
  }

  function loadOrdersAnalysis() {
    setOrdersLoading(true)
    fetch('/api/inventory/orders-analysis')
      .then(r => r.json())
      .then(d => setOrdersAnalysis(Array.isArray(d) ? d : []))
      .finally(() => setOrdersLoading(false))
  }

  function loadSupplyLevels() {
    fetch('/api/inventory/supply-levels')
      .then(r => r.json())
      .then(d => setSupplyLevels(Array.isArray(d) ? d : []))
  }

  function loadPackagingLevels() {
    fetch('/api/inventory/packaging-levels')
      .then(r => r.json())
      .then(d => setPackagingLevels(Array.isArray(d) ? d : []))
  }

  function loadLabelInventory() {
    fetch('/api/inventory/label-inventory')
      .then(r => r.json())
      .then(d => setLabelInventory(Array.isArray(d) ? d : []))
  }

  function loadSupplyOrders() {
    fetch('/api/inventory/supply-orders')
      .then(r => r.json())
      .then(d => setSupplyOrders(Array.isArray(d) ? d : []))
  }

  async function syncSupplyOrders() {
    setSyncingOrders(true)
    try {
      const res = await fetch('/api/inventory/supply-orders/sync', { method: 'POST' })
      const data = await res.json()
      setSyncResult({ synced: data.synced ?? 0, found: data.found ?? 0 })
    } catch { /* ignore */ }
    loadSupplyOrders()
    setSyncingOrders(false)
  }

  async function saveDelivery(orderId: number) {
    setSavingDelivery(true)
    const items = Object.entries(deliverState).map(([idStr, val]) => ({
      id: parseInt(idStr),
      delivered: val.checked,
      delivered_qty: parseFloat(val.qty) || undefined,
    }))
    const res = await fetch('/api/inventory/supply-orders/deliver', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, items }),
    })
    const data = await res.json()
    // Update local order status
    setSupplyOrders(prev => prev ? prev.map(o =>
      o.id === orderId ? { ...o, status: data.status, items: o.items.map(i => {
        const s = deliverState[i.id]
        return s ? { ...i, delivered: s.checked ? 1 : 0, delivered_qty: parseFloat(s.qty) || i.qty } : i
      }) } : o
    ) : prev)
    if (supplyLevels) loadSupplyLevels()
    if (packagingLevels) loadPackagingLevels()
    if (labelInventory) loadLabelInventory()
    setSavingDelivery(false)
  }

  async function deleteOrder(orderId: number) {
    await fetch('/api/inventory/supply-orders', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: orderId }),
    })
    setSupplyOrders(prev => prev ? prev.filter(o => o.id !== orderId) : prev)
    setOrderSidebarId(null)
  }

  function openPackConfirm(shopifyId: string, blend: string, qty: number, breakdown: { orderNumber: number; qty: number }[]) {
    // Auto-assign to oldest orders first
    let remaining = qty
    const assignments = breakdown.map(o => {
      const orderData = ordersAnalysis?.find(oa => oa.orderNumber === o.orderNumber)
      const itemData = orderData?.items.find(i => i.productId === shopifyId)
      const alreadyAssigned = itemData?.canFill ?? 0
      const stillNeeded = Math.max(0, o.qty - alreadyAssigned)
      const assign = Math.min(remaining, stillNeeded)
      remaining -= assign
      return { orderNumber: o.orderNumber, needed: o.qty, assign, alreadyAssigned }
    })
    setPackConfirm({ shopifyId, blend, qty, assignments })
  }

  const afterPackRef = useRef<(() => void) | null>(null)

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  async function recordPacked(shopifyId: string, blend: string, packedQty: number, assignments?: { orderNumber: number; qty: number }[]) {
    if (!packedQty || packedQty <= 0) return
    setPackingFor(shopifyId)
    const res = await fetch('/api/inventory/log-pack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopify_id: shopifyId, qty: packedQty, assignments }),
    })
    const data = await res.json()
    if (!res.ok) {
      showToast(`Error logging ${blend}: ${data.error ?? res.status}`)
    } else {
      if (data.newQty != null) {
        setProducts(prev => prev.map(p =>
          p.shopify_id === shopifyId ? { ...p, shopify_qty: data.newQty } : p
        ))
      }
      showToast(`Logged ${packedQty} jar${packedQty !== 1 ? 's' : ''} of ${blend}`)
      if (data.shopifyWarning) showToast(`Shopify sync skipped — update manually`)
    }
    setPackedQtys(prev => ({ ...prev, [shopifyId]: '' }))
    loadPackQueue()
    if (ordersAnalysis) loadOrdersAnalysis()
    if (supplyLevels) loadSupplyLevels()
    if (packagingLevels) loadPackagingLevels()
    if (labelInventory) loadLabelInventory()
    setPackingFor(null)
    const cb = afterPackRef.current
    afterPackRef.current = null
    cb?.()
  }

  async function reassignPacked() {
    if (!reassignModal || !reassignModal.toOrderNumber || reassignModal.qty <= 0) return
    setReassigning(true)
    const toOrder = ordersAnalysis?.find(o => o.orderNumber === reassignModal.toOrderNumber)
    const toItem = toOrder?.items.find(i => i.productId === reassignModal.productId)
    const to_can_fill = toItem?.canFill ?? 0
    await fetch('/api/inventory/pack-assignments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopify_product_id: reassignModal.productId,
        from_order_number: reassignModal.fromOrderNumber,
        to_order_number: reassignModal.toOrderNumber,
        qty: reassignModal.qty,
        from_can_fill: reassignModal.fromCanFill,
        to_can_fill,
      }),
    })
    setReassignModal(null)
    setReassigning(false)
    loadOrdersAnalysis()
  }

  async function logLabeling(shopifyId: string, qty: number) {
    if (!qty || qty === 0) return
    setLabelingFor(shopifyId)
    const res = await fetch('/api/inventory/log-labeling', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopify_id: shopifyId, qty }),
    })
    const data = await res.json()
    if (!res.ok) {
      showToast(`Error logging labels: ${data.error ?? res.status}`)
    } else {
      setLabelingQtys(prev => ({ ...prev, [shopifyId]: '' }))
      loadPackQueue()
      if (supplyLevels) loadSupplyLevels()
      if (packagingLevels) loadPackagingLevels()
      if (labelInventory) loadLabelInventory()
    }
    setLabelingFor(null)
  }

  async function resetStock() {
    setResetting(true)
    setResetConfirm(false)
    await fetch('/api/inventory/reset-stock', { method: 'POST' })
    await loadData()
    loadPackQueue()
    if (ordersAnalysis) loadOrdersAnalysis()
    setResetting(false)
  }

  async function submitManualOrder(force = false) {
    if (!manualOrderFor || !manualOrderForm.vendor.trim() || !manualOrderForm.description.trim() || !manualOrderForm.qty) return
    setAddingManualOrder(true)
    const res = await fetch('/api/inventory/supply-orders/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supply_id: manualOrderFor.supplyId,
        shopify_product_id: manualOrderFor.shopifyProductId ?? null,
        vendor: manualOrderForm.vendor.trim(),
        description: manualOrderForm.description.trim(),
        qty: parseFloat(manualOrderForm.qty) || 0,
        expected_delivery: manualOrderForm.expectedDelivery || null,
        force,
      }),
    })
    const data = await res.json()
    setAddingManualOrder(false)
    if (data.duplicate && !force) {
      setManualOrderDupes(data.orders)
      return
    }
    setManualOrderFor(null)
    setManualOrderForm({ vendor: '', description: '', qty: '', expectedDelivery: '' })
    setManualOrderDupes(null)
    loadSupplyOrders()
  }

  const TAB_BTN = (label: string, val: 'products' | 'supplies' | 'pack-queue' | 'orders') => (
    <button
      key={val}
      onClick={() => setTab(val)}
      style={{
        ...FONT, fontSize: 13, fontWeight: tab === val ? 600 : 500,
        padding: '10px 18px', background: 'transparent', border: 'none',
        borderBottom: tab === val ? '2px solid #C27A54' : '2px solid transparent',
        color: tab === val ? '#2C2C2C' : '#747474',
        cursor: 'pointer', marginBottom: -1,
      }}
    >
      {label}
    </button>
  )

  return (
    <>
      <div className="page-wrap" style={{ maxWidth: 1160 }}>
        <PageHeader
          eyebrow="Operations"
          title="Inventory"
          meta={shopifyStatus?.connected ? `${active.length} active · ${draft.length} draft · Synced ${syncedLabel}` : undefined}
          actions={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {lowCount > 0 && (
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setNotifOpen(p => !p)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 13px', borderRadius: 10, border: `1px solid ${criticalProducts.length > 0 ? 'rgba(201,64,64,0.35)' : 'rgba(194,122,84,0.35)'}`, background: criticalProducts.length > 0 ? 'rgba(201,64,64,0.07)' : 'rgba(194,122,84,0.07)', color: criticalProducts.length > 0 ? '#C94040' : '#C27A54', cursor: 'pointer', ...FONT }}
                  >
                    <Bell size={14} />
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{lowCount}</span>
                  </button>
                  {notifOpen && (
                    <>
                      <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setNotifOpen(false)} />
                      <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 99, background: '#fff', border: '1px solid rgba(216,210,198,0.8)', borderRadius: 12, boxShadow: '0 4px 20px rgba(44,44,44,0.12)', minWidth: 260, padding: '12px 0', ...FONT }}>
                        {criticalProducts.length > 0 && (
                          <div>
                            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#C94040', margin: '0 0 4px', padding: '0 14px' }}>Out of stock</p>
                            {criticalProducts.map(p => (
                              <button key={p.shopify_id} onClick={() => { setSelectedProduct(p); setNotifOpen(false) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 14px', fontSize: 12.5, color: '#2C2C2C', background: 'none', border: 'none', cursor: 'pointer', ...FONT }}>
                                {p.title} <span style={{ color: '#C94040', fontWeight: 600 }}>({getDisplayQty(p)})</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {warningProducts.length > 0 && (
                          <div style={{ marginTop: criticalProducts.length > 0 ? 10 : 0 }}>
                            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#C27A54', margin: '0 0 4px', padding: '0 14px' }}>Below reorder</p>
                            {warningProducts.map(p => (
                              <button key={p.shopify_id} onClick={() => { setSelectedProduct(p); setNotifOpen(false) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 14px', fontSize: 12.5, color: '#2C2C2C', background: 'none', border: 'none', cursor: 'pointer', ...FONT }}>
                                {p.title} <span style={{ color: '#C27A54', fontWeight: 600 }}>({getDisplayQty(p)})</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
              {shopifyStatus?.connected && (
                <>
                  <a href="https://admin.shopify.com/store/eiy0fe-13/products" target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10, border: '1px solid #D8D2C6', background: 'transparent', color: '#2C2C2C', fontSize: 13, fontWeight: 600, textDecoration: 'none', ...FONT }}>
                    <ExternalLink size={14} /> Shopify
                  </a>
                  <button onClick={handleSync} disabled={syncing}
                    style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10, background: '#2C2C2C', color: '#FAF9F6', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', ...FONT }}>
                    <RefreshCw size={14} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
                    {syncing ? 'Syncing…' : 'Sync now'}
                  </button>
                </>
              )}
            </div>
          }
        />

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #D8D2C6', marginBottom: 24 }}>
          {TAB_BTN('Products', 'products')}
          <button
            onClick={() => { setTab('supplies'); loadSupplyLevels(); loadPackagingLevels(); loadLabelInventory(); loadSupplyOrders() }}
            style={{
              ...FONT, fontSize: 13, fontWeight: tab === 'supplies' ? 600 : 500,
              padding: '10px 18px', background: 'transparent', border: 'none',
              borderBottom: tab === 'supplies' ? '2px solid #C27A54' : '2px solid transparent',
              color: tab === 'supplies' ? '#2C2C2C' : '#747474',
              cursor: 'pointer', marginBottom: -1,
            }}
          >
            Supplies
          </button>
          <button
            onClick={() => { setTab('pack-queue'); loadPackQueue(); loadOrdersAnalysis(); loadFillPlan() }}
            style={{
              ...FONT, fontSize: 13, fontWeight: tab === 'pack-queue' ? 600 : 500,
              padding: '10px 18px', background: 'transparent', border: 'none',
              borderBottom: tab === 'pack-queue' ? '2px solid #C27A54' : '2px solid transparent',
              color: tab === 'pack-queue' ? '#2C2C2C' : '#747474',
              cursor: 'pointer', marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            Queue
            {packQueue && packQueue.totalJars > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(194,122,84,0.15)', color: '#C27A54' }}>
                {packQueue.totalJars}
              </span>
            )}
          </button>
          <button
            onClick={() => { setTab('orders'); loadOrdersAnalysis() }}
            style={{
              ...FONT, fontSize: 13, fontWeight: tab === 'orders' ? 600 : 500,
              padding: '10px 18px', background: 'transparent', border: 'none',
              borderBottom: tab === 'orders' ? '2px solid #C27A54' : '2px solid transparent',
              color: tab === 'orders' ? '#2C2C2C' : '#747474',
              cursor: 'pointer', marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            Orders
            {ordersAnalysis && ordersAnalysis.length > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(92,138,63,0.12)', color: '#5c8a3f' }}>
                {ordersAnalysis.length}
              </span>
            )}
          </button>
        </div>

        {/* Products tab */}
        {tab === 'products' && (
          loading ? (
            <p style={{ color: '#747474', fontSize: 13, ...FONT }}>Loading…</p>
          ) : !shopifyStatus?.connected ? (
            <div style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 12, padding: '24px', color: '#747474', fontSize: 13, ...FONT }}>
              Connect Shopify on the Marketing page to see live inventory.
            </div>
          ) : (
            <div>
              {active.length > 0 && (
                <div style={{ marginBottom: 32 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <h2 style={{ ...FONT, fontSize: 15, fontWeight: 600, color: '#2C2C2C', margin: 0 }}>Active</h2>
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 10px', borderRadius: 999, background: 'rgba(160,198,109,0.18)', color: '#7c9d4e' }}>{active.length}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12 }}>
                    {active.map(p => {
                      const neededJars = packQueue?.rows.find(r => r.blend === p.title)?.jars ?? 0
                      return <ProductCard key={p.shopify_id} product={p} displayQty={getDisplayQty(p)} needed={neededJars} onClick={() => setSelectedProduct(p)} />
                    })}
                  </div>
                </div>
              )}
              {draft.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <h2 style={{ ...FONT, fontSize: 15, fontWeight: 600, color: '#2C2C2C', margin: 0 }}>Draft</h2>
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 10px', borderRadius: 999, background: 'rgba(216,210,198,0.5)', color: 'rgba(116,116,116,0.8)' }}>{draft.length}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 12, opacity: 0.7 }}>
                    {draft.map(p => {
                      const neededJars = packQueue?.rows.find(r => r.blend === p.title)?.jars ?? 0
                      return <ProductCard key={p.shopify_id} product={p} displayQty={getDisplayQty(p)} needed={neededJars} onClick={() => setSelectedProduct(p)} />
                    })}
                  </div>
                </div>
              )}
              {products.length === 0 && (
                <p style={{ color: '#747474', fontSize: 13, ...FONT }}>No products synced yet. Hit Sync now to pull from Shopify.</p>
              )}
            </div>
          )
        )}

        {/* Supplies tab */}
        {tab === 'supplies' && (
          <SuppliesTab
            supplies={supplies}
            supplyLevels={supplyLevels}
            packagingLevels={packagingLevels}
            labelInventory={labelInventory}
            supplyOrders={supplyOrders}
            onAdd={s => setSupplies(prev => [...prev, s])}
            onUpdate={s => setSupplies(prev => prev.map(x => x.id === s.id ? s : x))}
            onDelete={id => setSupplies(prev => prev.filter(s => s.id !== id))}
            onSupplyLevelChange={() => { loadSupplyLevels(); loadPackagingLevels(); loadLabelInventory() }}
            orderSidebarId={orderSidebarId}
            setOrderSidebarId={(id) => {
              setOrderSidebarId(id)
              if (id != null) {
                const order = supplyOrders?.find(o => o.id === id)
                if (order) {
                  const init: Record<number, { checked: boolean; qty: string }> = {}
                  for (const item of order.items) {
                    init[item.id] = { checked: item.delivered === 1, qty: String(item.delivered_qty ?? item.qty) }
                  }
                  setDeliverState(init)
                }
              }
            }}
            deliverState={deliverState}
            setDeliverState={setDeliverState}
            onSaveDelivery={saveDelivery}
            savingDelivery={savingDelivery}
            setManualOrderFor={(val) => {
              setManualOrderFor(val)
              setManualOrderForm({ vendor: val.vendor ?? '', description: val.name, qty: '', expectedDelivery: '' })
              setManualOrderDupes(null)
            }}
            onDeleteOrder={deleteOrder}
            onTbspBreakdown={(supplyId) => {
              setSupplyBreakdownLoading(true)
              fetch(`/api/inventory/supply-breakdown/${supplyId}`)
                .then(r => r.json())
                .then(d => setSupplyBreakdown({ supplyName: d.supply, items: d.items }))
                .finally(() => setSupplyBreakdownLoading(false))
            }}
          />
        )}

        {/* Pack Queue tab */}
        {tab === 'pack-queue' && (
          packLoading ? (
            <p style={{ color: '#747474', fontSize: 13, ...FONT }}>Loading…</p>
          ) : !packQueue ? (
            <p style={{ color: '#747474', fontSize: 13, ...FONT }}>No data.</p>
          ) : packQueue.rows.length === 0 ? (
            <div style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 12, padding: '32px 24px', textAlign: 'center' }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#2C2C2C', margin: '0 0 6px', ...FONT }}>All caught up</p>
              <p style={{ fontSize: 13, color: '#747474', margin: 0, ...FONT }}>No unfulfilled jars to pack right now.</p>
            </div>
          ) : (
            <div>
              {/* Summary strip — 3 KPI cards always in one row */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                  {/* Unfulfilled jars */}
                  {(() => {
                    const readyJars = ordersAnalysis ? ordersAnalysis.reduce((s, o) => s + o.totalCanFill, 0) : 0
                    return (
                      <div style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 10, padding: '12px 14px' }}>
                        <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 4px', ...FONT }}>Unfulfilled</p>
                        <p style={{ fontSize: 24, fontWeight: 700, color: '#C27A54', margin: '0 0 6px', fontVariantNumeric: 'tabular-nums', ...FONT }}>{packQueue.totalJars}</p>
                        {readyJars > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999, background: 'rgba(92,138,63,0.12)', color: '#5c8a3f', ...FONT }}>
                            {readyJars} ready
                          </span>
                        )}
                      </div>
                    )
                  })()}
                  {[
                    { label: 'Open orders', value: packQueue.openOrderCount, color: '#2C2C2C' },
                    { label: 'Blends', value: packQueue.rows.filter(r => r.jars > 0).length, color: '#2C2C2C' },
                  ].map(stat => (
                    <div key={stat.label} style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 10, padding: '12px 14px' }}>
                      <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 4px', ...FONT }}>{stat.label}</p>
                      <p style={{ fontSize: 24, fontWeight: 700, color: stat.color, margin: 0, fontVariantNumeric: 'tabular-nums', ...FONT }}>{stat.value}</p>
                    </div>
                  ))}
                </div>
                {/* Reset action */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  {resetConfirm ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: '#fff', border: '1px solid rgba(194,122,84,0.4)', borderRadius: 10, padding: '12px 14px' }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: '#2C2C2C', margin: 0, ...FONT }}>Reset all stock to −orders?</p>
                      <p style={{ fontSize: 11, color: '#747474', margin: 0, ...FONT }}>Sets every product to 0 minus unfulfilled jars needed. This updates Shopify.</p>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={resetStock}
                          disabled={resetting}
                          style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 6, background: '#C27A54', color: '#fff', border: 'none', cursor: 'pointer', ...FONT }}
                        >
                          {resetting ? 'Resetting…' : 'Yes, reset'}
                        </button>
                        <button
                          onClick={() => setResetConfirm(false)}
                          style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 6, background: 'transparent', color: '#747474', border: '1px solid #D8D2C6', cursor: 'pointer', ...FONT }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setResetConfirm(true)}
                      disabled={resetting}
                      style={{ fontSize: 12, fontWeight: 600, padding: '8px 14px', borderRadius: 8, background: '#fff', color: '#747474', border: '1px solid rgba(216,210,198,0.6)', cursor: 'pointer', ...FONT, whiteSpace: 'nowrap' }}
                    >
                      {resetting ? 'Resetting…' : 'Reset stock counts'}
                    </button>
                  )}
                </div>
              </div>

              {/* Blend cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {packQueue.rows.map((row) => {
                  const sid = row.shopifyId
                  const product = products.find(p => p.shopify_id === sid)
                  const inventoryQty = product ? product.shopify_qty : 0
                  const packed = Math.max(0, row.jars + inventoryQty)
                  const labeled = row.labeledJars ?? 0
                  const toPack = Math.max(0, row.jars - packed)
                  const isPacking = packingFor === sid
                  const isLabeling = labelingFor === sid
                  const onHandColor = packed > 0 ? '#5c8a3f' : 'rgba(116,116,116,0.5)'
                  const labeledColor = labeled > 0 ? '#3d7684' : 'rgba(116,116,116,0.5)'
                  const toPackColor = toPack > 0 ? '#C94040' : '#5c8a3f'
                  const suggested = fillPlan?.recommendations.find(r => r.shopifyId === sid)?.suggestedFill ?? 0
                  const dotColor = row.fullyFillable ? '#5c8a3f' : row.fillableNow > 0 ? '#C27A54' : '#9a3a3a'
                  const tip = row.fullyFillable
                    ? `Can fill all ${row.jars > 0 ? `${row.jars} ordered` : `${row.labeledJars} labeled`} jars`
                    : row.fillableNow > 0
                      ? `Can fill ${Math.min(row.fillableNow, row.jars || row.labeledJars)} of ${row.jars || row.labeledJars}${row.limitingIngredient ? ` — limited by ${row.limitingIngredient}` : ''}`
                      : `Blocked${row.limitingIngredient ? ` — low on ${row.limitingIngredient}` : ''}`
                  return (
                    <div key={row.blend} style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 12, overflow: 'hidden' }}>
                      {/* Card header */}
                      <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid rgba(216,210,198,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                          <button
                            onClick={() => setSelectedBlend({ blend: row.blend, shopifyId: row.shopifyId, canFill: row.canFill, jarsNeeded: row.jars })}
                            style={{ fontSize: 14, fontWeight: 600, color: '#2C2C2C', ...FONT, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                          >{row.blend}</button>
                          {(row.jars > 0 || row.labeledJars > 0) && (
                            <span title={tip} style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0, display: 'inline-block' }} />
                          )}
                        </div>
                        {row.orderNumbers.length > 0 && (
                          <button
                            onClick={() => setBlendOrdersDrawer({ blend: row.blend, orderNumbers: row.orderNumbers })}
                            style={{ fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 999, background: 'rgba(61,118,132,0.1)', color: '#3d7684', border: '1px solid rgba(61,118,132,0.2)', cursor: 'pointer', flexShrink: 0, ...FONT }}
                          >{row.orderNumbers.length} {row.orderNumbers.length === 1 ? 'order' : 'orders'}</button>
                        )}
                      </div>

                      {/* Stats row */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: '10px 12px', borderBottom: '1px solid rgba(216,210,198,0.4)' }}>
                        {[
                          { label: 'Needed', value: row.jars, color: '#C27A54', bg: 'rgba(194,122,84,0.08)' },
                          { label: 'On Hand', value: packed, color: onHandColor, bg: packed >= row.jars ? 'rgba(92,138,63,0.08)' : 'rgba(153,64,64,0.08)' },
                          { label: 'To Pack', value: toPack, color: toPackColor, bg: toPack > 0 ? 'rgba(201,64,64,0.08)' : 'rgba(92,138,63,0.08)' },
                          { label: 'Labeled', value: labeled > 0 ? labeled : '—', color: labeledColor, bg: 'rgba(116,116,116,0.06)' },
                          { label: 'Build', value: suggested > 0 ? suggested : '—', color: suggested > 0 ? '#3d7684' : 'rgba(116,116,116,0.35)', bg: suggested > 0 ? 'rgba(61,118,132,0.08)' : 'rgba(116,116,116,0.04)' },
                        ].map(s => (
                          <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: s.bg, borderRadius: 6, padding: '5px 10px' }}>
                            <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', ...FONT }}>{s.label}</span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums', ...FONT }}>{s.value}</span>
                          </div>
                        ))}
                      </div>

                      {/* Actions row */}
                      {sid && (
                        <div style={{ padding: '10px 16px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          {/* Log labeling */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 160px' }}>
                            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(116,116,116,0.55)', flexShrink: 0, ...FONT }}>Label</span>
                            <input
                              type="number" step="1" placeholder="0"
                              value={labelingQtys[sid] ?? ''}
                              onChange={e => setLabelingQtys(prev => ({ ...prev, [sid]: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter') { const qty = parseInt((e.currentTarget as HTMLInputElement).value); if (qty !== 0 && !isNaN(qty)) logLabeling(sid, qty) } }}
                              style={{ width: 60, fontSize: 13, ...FONT, border: '1px solid #D8D2C6', borderRadius: 6, padding: '5px 8px', outline: 'none', textAlign: 'right' }}
                            />
                            <span style={{ fontSize: 11, color: '#747474', ...FONT }}>jars</span>
                            <button
                              disabled={!labelingQtys[sid] || !!isLabeling}
                              onClick={() => { const qty = parseInt(labelingQtys[sid] ?? '0'); if (qty !== 0 && !isNaN(qty)) logLabeling(sid, qty) }}
                              style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 6, background: labelingQtys[sid] && !isLabeling ? '#3d7684' : '#D8D2C6', color: labelingQtys[sid] && !isLabeling ? '#FAF9F6' : '#747474', border: 'none', cursor: labelingQtys[sid] ? 'pointer' : 'default', ...FONT, transition: 'background 0.15s' }}
                            >{isLabeling ? '…' : 'Log'}</button>
                          </div>
                          {/* Log packed */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 160px' }}>
                            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(116,116,116,0.55)', flexShrink: 0, ...FONT }}>Pack</span>
                            <input
                              type="number" min="1" step="1" placeholder="0"
                              value={packedQtys[sid] ?? ''}
                              onChange={e => setPackedQtys(prev => ({ ...prev, [sid]: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter') { const qty = parseInt((e.currentTarget as HTMLInputElement).value); if (qty > 0) { if (row.orderBreakdown.length > 0) openPackConfirm(sid, row.blend, qty, row.orderBreakdown); else recordPacked(sid, row.blend, qty) } } }}
                              style={{ width: 60, fontSize: 13, ...FONT, border: '1px solid #D8D2C6', borderRadius: 6, padding: '5px 8px', outline: 'none', textAlign: 'right' }}
                            />
                            <span style={{ fontSize: 11, color: '#747474', ...FONT }}>jars</span>
                            <button
                              disabled={!packedQtys[sid] || isPacking}
                              onClick={() => { const qty = parseInt(packedQtys[sid] ?? '0'); if (qty > 0) { if (row.orderBreakdown.length > 0) openPackConfirm(sid, row.blend, qty, row.orderBreakdown); else recordPacked(sid, row.blend, qty) } }}
                              style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 6, background: packedQtys[sid] && !isPacking ? '#2C2C2C' : '#D8D2C6', color: packedQtys[sid] && !isPacking ? '#FAF9F6' : '#747474', border: 'none', cursor: packedQtys[sid] ? 'pointer' : 'default', ...FONT, transition: 'background 0.15s' }}
                            >{isPacking ? '…' : 'Log'}</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <p style={{ fontSize: 11, color: 'rgba(116,116,116,0.5)', margin: '12px 0 0', ...FONT }}>
                Counts reflect <em>fulfillable</em> quantity on unfulfilled Shopify orders. Logging packed jars adds them to on-hand inventory.
              </p>
            </div>
          )
        )}

        {/* Orders tab */}
        {tab === 'orders' && (
          ordersLoading ? (
            <p style={{ color: '#747474', fontSize: 13, ...FONT }}>Loading…</p>
          ) : !ordersAnalysis ? (
            <p style={{ color: '#747474', fontSize: 13, ...FONT }}>No data.</p>
          ) : ordersAnalysis.length === 0 ? (
            <div style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 12, padding: '32px 24px', textAlign: 'center' }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#2C2C2C', margin: '0 0 6px', ...FONT }}>No open orders</p>
              <p style={{ fontSize: 13, color: '#747474', margin: 0, ...FONT }}>All orders are fulfilled.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {ordersAnalysis.map(order => {
                const statusColor = order.status === 'ready' ? '#5c8a3f' : order.status === 'partial' ? '#C27A54' : '#9a3a3a'
                const statusBg = order.status === 'ready' ? 'rgba(92,138,63,0.1)' : order.status === 'partial' ? 'rgba(194,122,84,0.1)' : 'rgba(154,58,58,0.1)'
                const statusLabel = order.status === 'ready' ? 'Ready to ship' : order.status === 'partial' ? `${order.totalCanFill} of ${order.totalNeeded} fillable` : `Short ${order.totalShort}`
                return (
                  <div key={order.orderId} style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 12 }}>
                    {/* Order header */}
                    <div
                      onClick={() => setSelectedOrder(order.orderNumber)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', cursor: 'pointer', borderBottom: '1px solid rgba(216,210,198,0.5)', gap: 8, flexWrap: 'wrap' }}
                    >
                      <div className="order-hdr-left" style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 auto', minWidth: 0 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#2C2C2C', flexShrink: 0, ...FONT }}>#{order.orderNumber}</span>
                        <span className="order-hdr-email" style={{ fontSize: 11, color: '#747474', ...FONT }}>{order.email}</span>
                        <span style={{ fontSize: 11, color: 'rgba(116,116,116,0.5)', flexShrink: 0, ...FONT }}>
                          {new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: statusBg, color: statusColor, ...FONT }}>
                          {statusLabel}
                        </span>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#2C2C2C', ...FONT }}>${Number(order.totalPrice).toFixed(2)}</span>
                        <ExternalLink size={13} style={{ color: 'rgba(116,116,116,0.4)' }} />
                      </div>
                    </div>

                    {/* Items */}
                    <div style={{ padding: '4px 0' }}>
                      {order.items.map((item, j) => {
                        const fillable = item.canFill === item.needed
                        const short = item.short > 0
                        return (
                          <div key={j} style={{ padding: '10px 18px', borderBottom: j < order.items.length - 1 ? '1px solid rgba(216,210,198,0.3)' : 'none' }}>
                            {/* Title row */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                              <div style={{ ...FONT, fontSize: 13, fontWeight: 500, color: '#2C2C2C', minWidth: 0, flex: 1 }}>{item.title}</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                                {short ? (
                                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(194,122,84,0.12)', color: '#C27A54', ...FONT }}>
                                    -{item.short} short
                                  </span>
                                ) : (
                                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(92,138,63,0.1)', color: '#5c8a3f', ...FONT }}>
                                    ✓ good
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Stats + action row */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                              {[
                                { label: 'Needed', val: item.needed, color: '#2C2C2C' },
                                { label: 'On hand', val: item.onHand, color: item.onHand > 0 ? '#5c8a3f' : '#C27A54' },
                                { label: 'Can fill', val: item.canFill, color: fillable ? '#5c8a3f' : '#C27A54' },
                              ].map(s => (
                                <div key={s.label} style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                                  <span style={{ fontSize: 10, color: 'rgba(116,116,116,0.5)', ...FONT }}>{s.label}</span>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums', ...FONT }}>{s.val}</span>
                                </div>
                              ))}
                              {item.canFill > 0 && (
                                <button
                                  onClick={() => setReassignModal({ productId: item.productId, title: item.title, fromOrderNumber: order.orderNumber, fromCanFill: item.canFill, toOrderNumber: null, qty: item.canFill })}
                                  style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(116,116,116,0.3)', background: 'transparent', color: '#747474', cursor: 'pointer', ...FONT, marginLeft: 'auto' }}
                                >
                                  Reassign
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>

      {/* TBSP breakdown modal */}
      {(supplyBreakdown || supplyBreakdownLoading) && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(116,116,116,0.35)' }} onClick={() => setSupplyBreakdown(null)} />
          <div className="fixed z-50" style={{ top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(460px, calc(100vw - 32px))', background: '#FAF9F6', borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(216,210,198,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 3px', ...FONT }}>TBSP needed breakdown</p>
                <h3 style={{ ...SERIF, fontSize: 18, fontWeight: 700, margin: 0, color: '#2C2C2C' }}>{supplyBreakdown?.supplyName ?? '…'}</h3>
              </div>
              <button onClick={() => setSupplyBreakdown(null)} style={{ border: 'none', background: 'transparent', color: 'rgba(116,116,116,0.5)', cursor: 'pointer', padding: 6, display: 'flex' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '16px 24px 24px', maxHeight: '60vh', overflowY: 'auto', overflowX: 'auto' }}>
              {supplyBreakdownLoading ? (
                <p style={{ color: '#747474', fontSize: 13, ...FONT }}>Loading…</p>
              ) : !supplyBreakdown || supplyBreakdown.items.length === 0 ? (
                <p style={{ color: '#747474', fontSize: 13, ...FONT }}>No blends require this ingredient for current orders.</p>
              ) : (
                <div style={{ minWidth: 260 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 60px 70px', gap: 8, padding: '0 0 8px', borderBottom: '1px solid rgba(216,210,198,0.5)', marginBottom: 4 }}>
                    {['Blend', 'Jars', 'Tbsp/Jar', 'Total Tbsp'].map(h => (
                      <span key={h} style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', ...FONT, textAlign: h !== 'Blend' ? 'right' : 'left' }}>{h}</span>
                    ))}
                  </div>
                  {supplyBreakdown.items.map((item, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 50px 60px 70px', gap: 8, padding: '9px 0', borderBottom: i < supplyBreakdown.items.length - 1 ? '1px solid rgba(216,210,198,0.3)' : 'none', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#2C2C2C', ...FONT }}>{item.blend}</span>
                      <span style={{ fontSize: 13, color: '#747474', textAlign: 'right', fontVariantNumeric: 'tabular-nums', ...FONT }}>{item.jars}</span>
                      <span style={{ fontSize: 13, color: '#747474', textAlign: 'right', fontVariantNumeric: 'tabular-nums', ...FONT }}>{item.tbspPerJar}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#2C2C2C', textAlign: 'right', fontVariantNumeric: 'tabular-nums', ...FONT }}>{item.totalTbsp.toFixed(2)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 60px 70px', gap: 8, padding: '10px 0 0', borderTop: '1px solid rgba(216,210,198,0.5)', marginTop: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#747474', textTransform: 'uppercase', letterSpacing: '0.08em', ...FONT }}>Total</span>
                    <span />
                    <span />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#C27A54', textAlign: 'right', fontVariantNumeric: 'tabular-nums', ...FONT }}>{supplyBreakdown.items.reduce((s, r) => s + r.totalTbsp, 0).toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Order detail sidebar */}
      {selectedBlend && (
        <BlendRecipeSidebar blend={selectedBlend.blend} shopifyId={selectedBlend.shopifyId} canFill={selectedBlend.canFill} jarsNeeded={selectedBlend.jarsNeeded} onClose={() => setSelectedBlend(null)} />
      )}
      {selectedOrder && (
        <OrderSidebar orderNumber={selectedOrder} onClose={() => setSelectedOrder(null)} />
      )}

      {/* Blend orders mini drawer */}
      {blendOrdersDrawer && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(44,44,44,0.22)' }} onClick={() => setBlendOrdersDrawer(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col bottom-sheet-wrap md:top-0 md:left-auto md:w-[320px]" style={{ background: '#FAF9F6', boxShadow: '0 -4px 32px rgba(44,44,44,0.13)' }}>
            <div style={{ background: '#2C2C2C', padding: '22px 24px 18px', position: 'relative' }}>
              <button onClick={() => setBlendOrdersDrawer(null)} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 8, color: 'rgba(250,249,246,0.7)', cursor: 'pointer', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} /></button>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(250,249,246,0.45)', marginBottom: 6, ...FONT }}>Orders</div>
              <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0, color: '#FAF9F6', ...SERIF }}>{blendOrdersDrawer.blend}</h2>
            </div>
            <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {blendOrdersDrawer.orderNumbers.map((num: number) => (
                <button
                  key={num}
                  onClick={() => { setBlendOrdersDrawer(null); setSelectedOrder(num) }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 10, background: '#fff', border: '1px solid rgba(216,210,198,0.6)', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#3d7684', ...FONT }}>Order #{num}</span>
                  <ExternalLink size={13} color="rgba(116,116,116,0.5)" />
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Manual on-order sidebar */}
      {packConfirm && (() => {
        const total = packConfirm.assignments.reduce((s, a) => s + a.assign, 0)
        const backstock = packConfirm.qty - total
        const isOver = total > packConfirm.qty
        const isValid = !isOver
        return (
          <>
            <div className="fixed inset-0 z-40" style={{ background: 'rgba(44,44,44,0.35)' }} onClick={() => setPackConfirm(null)} />
            <div className="fixed z-50" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(480px, 95vw)', background: '#FAF9F6', borderRadius: 16, boxShadow: '0 8px 48px rgba(44,44,44,0.22)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
              <div style={{ padding: '24px 28px 18px', borderBottom: '1px solid rgba(216,210,198,0.5)' }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', marginBottom: 6, ...FONT }}>Confirm Packed Jars</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#2C2C2C', ...FONT }}>{packConfirm.qty} × {packConfirm.blend}</div>
                <div style={{ fontSize: 12, color: '#747474', marginTop: 4, ...FONT }}>Assign to orders below — oldest first. Remainder goes to backstock.</div>
              </div>
              <div style={{ overflowY: 'auto', padding: '16px 28px', flex: 1 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0 12px', marginBottom: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.5)', ...FONT }}>Order</div>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.5)', textAlign: 'right', ...FONT }}>Needed</div>
                  <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.5)', textAlign: 'right', ...FONT }}>Assign</div>
                </div>
                {packConfirm.assignments.map((a, idx) => (
                  <div key={a.orderNumber} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0 12px', alignItems: 'center', padding: '10px 0', borderTop: '1px solid rgba(216,210,198,0.35)' }}>
                    <div>
                      <button
                        onClick={() => { setPackConfirm(null); setSelectedOrder(a.orderNumber) }}
                        style={{ fontSize: 14, fontWeight: 600, color: '#2C2C2C', ...FONT, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', textDecoration: 'underline', textDecorationColor: 'rgba(44,44,44,0.25)', textUnderlineOffset: 3 }}
                      >#{a.orderNumber}</button>
                      {a.alreadyAssigned > 0 && (
                        <div style={{ fontSize: 11, color: '#C27A54', marginTop: 2, ...FONT }}>{a.alreadyAssigned} already assigned</div>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: '#747474', textAlign: 'right', fontVariantNumeric: 'tabular-nums', ...FONT }}>{a.needed} jar{a.needed !== 1 ? 's' : ''}</div>
                    <input
                      type="number" min="0" max={packConfirm.qty} step="1"
                      value={a.assign}
                      onChange={e => {
                        const val = Math.max(0, parseInt(e.target.value) || 0)
                        setPackConfirm(prev => prev ? {
                          ...prev,
                          assignments: prev.assignments.map((x, i) => i === idx ? { ...x, assign: val } : x)
                        } : prev)
                      }}
                      style={{ width: 64, fontSize: 13, fontWeight: 600, ...FONT, border: `1px solid ${a.assign > 0 ? 'rgba(58,138,90,0.4)' : '#D8D2C6'}`, borderRadius: 6, padding: '5px 8px', outline: 'none', textAlign: 'right', background: a.assign > 0 ? 'rgba(58,138,90,0.06)' : '#fff' }}
                    />
                  </div>
                ))}
                {/* Backstock row */}
                {backstock > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0 12px', alignItems: 'center', padding: '10px 0', borderTop: '1px solid rgba(216,210,198,0.35)' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#747474', ...FONT }}>Backstock</div>
                    <div style={{ fontSize: 13, color: '#747474', textAlign: 'right', ...FONT }}>—</div>
                    <div style={{ width: 64, fontSize: 13, fontWeight: 600, color: '#5c8a3f', textAlign: 'right', fontVariantNumeric: 'tabular-nums', ...FONT }}>{backstock}</div>
                  </div>
                )}
                {isOver && (
                  <div style={{ marginTop: 10, fontSize: 12, color: '#9a3a3a', fontWeight: 500, ...FONT }}>
                    Over-assigned by {total - packConfirm.qty} jar{total - packConfirm.qty !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
              <div style={{ padding: '16px 28px 24px', borderTop: '1px solid rgba(216,210,198,0.5)', display: 'flex', gap: 8 }}>
                <button
                  disabled={!isValid || packingFor === packConfirm.shopifyId}
                  onClick={() => {
                    const { shopifyId, blend, qty, assignments } = packConfirm
                    const assignmentPayload = assignments.map(a => ({ orderNumber: a.orderNumber, qty: a.assign }))
                    setPackConfirm(null)
                    setPackedQtys(prev => ({ ...prev, [shopifyId]: '' }))
                    recordPacked(shopifyId, blend, qty, assignmentPayload)
                  }}
                  style={{ flex: 1, padding: '12px 0', borderRadius: 8, border: 'none', background: isValid ? '#2C2C2C' : '#D8D2C6', color: isValid ? '#FAF9F6' : '#747474', fontSize: 13, fontWeight: 600, cursor: isValid ? 'pointer' : 'default', ...FONT }}
                >
                  {packingFor === packConfirm.shopifyId ? 'Logging…' : 'Confirm & Log'}
                </button>
                <button
                  onClick={() => setPackConfirm(null)}
                  style={{ padding: '12px 18px', borderRadius: 8, border: '1px solid #D8D2C6', background: 'transparent', color: '#747474', fontSize: 13, fontWeight: 600, cursor: 'pointer', ...FONT }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </>
        )
      })()}

      {reassignModal && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(116,116,116,0.4)' }} onClick={() => setReassignModal(null)} />
          <div className="fixed z-50" style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#FAF9F6', borderRadius: 16, boxShadow: '0 8px 40px rgba(44,44,44,0.18)', width: 'min(400px, 90vw)', overflow: 'hidden' }}>
            <div style={{ padding: '22px 28px 18px' }}>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 4px', ...FONT }}>Reassign packed jars</p>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#2C2C2C', ...FONT }}>{reassignModal.title}</div>
              <div style={{ fontSize: 12, color: '#747474', marginTop: 2, ...FONT }}>{reassignModal.fromCanFill} jar{reassignModal.fromCanFill !== 1 ? 's' : ''} available from #{reassignModal.fromOrderNumber}</div>
            </div>
            <div style={{ padding: '0 28px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#747474', display: 'block', marginBottom: 6, ...FONT }}>Move to order #</label>
                <select
                  value={reassignModal.toOrderNumber ?? ''}
                  onChange={e => setReassignModal(prev => prev ? { ...prev, toOrderNumber: Number(e.target.value) || null } : prev)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(216,210,198,0.8)', background: '#fff', fontSize: 13, color: '#2C2C2C', ...FONT }}
                >
                  <option value="">Select order…</option>
                  {(ordersAnalysis ?? [])
                    .filter(o => o.orderNumber !== reassignModal.fromOrderNumber)
                    .map(o => (
                      <option key={o.orderNumber} value={o.orderNumber}>#{o.orderNumber} — {o.email}</option>
                    ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#747474', display: 'block', marginBottom: 6, ...FONT }}>Qty to move</label>
                <input
                  type="number" min={1} max={reassignModal.fromCanFill} step={1}
                  value={reassignModal.qty}
                  onChange={e => setReassignModal(prev => prev ? { ...prev, qty: Math.max(1, Math.min(prev.fromCanFill, Number(e.target.value) || 1)) } : prev)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid rgba(216,210,198,0.8)', background: '#fff', fontSize: 13, color: '#2C2C2C', boxSizing: 'border-box', ...FONT }}
                />
              </div>
            </div>
            <div style={{ padding: '16px 28px 24px', borderTop: '1px solid rgba(216,210,198,0.5)', display: 'flex', gap: 8 }}>
              <button
                disabled={!reassignModal.toOrderNumber || reassigning}
                onClick={reassignPacked}
                style={{ flex: 1, padding: '12px 0', borderRadius: 8, border: 'none', background: reassignModal.toOrderNumber ? '#2C2C2C' : '#D8D2C6', color: reassignModal.toOrderNumber ? '#FAF9F6' : '#747474', fontSize: 13, fontWeight: 600, cursor: reassignModal.toOrderNumber ? 'pointer' : 'default', ...FONT }}
              >
                {reassigning ? 'Moving…' : 'Confirm Reassign'}
              </button>
              <button
                onClick={() => setReassignModal(null)}
                style={{ padding: '12px 18px', borderRadius: 8, border: '1px solid #D8D2C6', background: 'transparent', color: '#747474', fontSize: 13, fontWeight: 600, cursor: 'pointer', ...FONT }}
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {manualOrderFor && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(116,116,116,0.25)' }} onClick={() => { setManualOrderFor(null); setManualOrderDupes(null) }} />
          <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-white shadow-2xl bottom-sheet-wrap md:top-0 md:left-auto md:w-[380px]">
            <div style={{ padding: '22px 24px', borderBottom: '1px solid rgba(216,210,198,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 4px', ...FONT }}>Manual entry</p>
                <h2 style={{ ...SERIF, fontSize: 20, fontWeight: 700, margin: 0, color: '#2C2C2C' }}>Add On-Order Item</h2>
                <p style={{ fontSize: 12, color: '#747474', margin: '4px 0 0', ...FONT }}>{manualOrderFor.name}</p>
              </div>
              <button onClick={() => { setManualOrderFor(null); setManualOrderDupes(null) }} style={{ border: 'none', background: 'transparent', color: 'rgba(116,116,116,0.5)', cursor: 'pointer', padding: 6, display: 'flex' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {manualOrderDupes && manualOrderDupes.length > 0 && (
                <div style={{ background: 'rgba(194,122,84,0.08)', border: '1px solid rgba(194,122,84,0.35)', borderRadius: 10, padding: '12px 14px' }}>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: '#C27A54', margin: '0 0 6px', ...FONT }}>⚠ Existing pending order</p>
                  {manualOrderDupes.map(o => (
                    <p key={o.id} style={{ fontSize: 12, color: '#2C2C2C', margin: '0 0 2px', ...FONT }}>{o.vendor}{o.order_date ? ` · ${o.order_date}` : ''} <span style={{ color: '#747474' }}>({o.status})</span></p>
                  ))}
                  <p style={{ fontSize: 11.5, color: '#747474', margin: '6px 0 0', ...FONT }}>Add anyway to track a separate shipment?</p>
                </div>
              )}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.7)', display: 'block', marginBottom: 5, ...FONT }}>Vendor</label>
                <input value={manualOrderForm.vendor} onChange={e => setManualOrderForm(p => ({ ...p, vendor: e.target.value }))} placeholder="e.g. Amazon, Uline…" style={{ width: '100%', fontSize: 13, padding: '9px 11px', border: '1px solid #D8D2C6', borderRadius: 8, outline: 'none', boxSizing: 'border-box', ...FONT }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.7)', display: 'block', marginBottom: 5, ...FONT }}>Description</label>
                <input value={manualOrderForm.description} onChange={e => setManualOrderForm(p => ({ ...p, description: e.target.value }))} placeholder="Item description" style={{ width: '100%', fontSize: 13, padding: '9px 11px', border: '1px solid #D8D2C6', borderRadius: 8, outline: 'none', boxSizing: 'border-box', ...FONT }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.7)', display: 'block', marginBottom: 5, ...FONT }}>Quantity</label>
                <input type="number" min="0" step="1" value={manualOrderForm.qty} onChange={e => setManualOrderForm(p => ({ ...p, qty: e.target.value }))} placeholder="0" style={{ width: '100%', fontSize: 13, padding: '9px 11px', border: '1px solid #D8D2C6', borderRadius: 8, outline: 'none', boxSizing: 'border-box', ...FONT }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.7)', display: 'block', marginBottom: 5, ...FONT }}>Expected delivery (optional)</label>
                <input type="date" value={manualOrderForm.expectedDelivery} onChange={e => setManualOrderForm(p => ({ ...p, expectedDelivery: e.target.value }))} style={{ width: '100%', fontSize: 13, padding: '9px 11px', border: '1px solid #D8D2C6', borderRadius: 8, outline: 'none', boxSizing: 'border-box', ...FONT }} />
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(216,210,198,0.5)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {manualOrderDupes && manualOrderDupes.length > 0 ? (
                <>
                  <button onClick={() => submitManualOrder(true)} disabled={addingManualOrder || !manualOrderForm.vendor.trim() || !manualOrderForm.description.trim() || !manualOrderForm.qty}
                    style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: '#C27A54', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (!manualOrderForm.vendor.trim() || !manualOrderForm.description.trim() || !manualOrderForm.qty) ? 0.5 : 1, ...FONT }}>
                    {addingManualOrder ? 'Adding…' : 'Add anyway'}
                  </button>
                  <button onClick={() => { setManualOrderFor(null); setManualOrderDupes(null) }} style={{ padding: '10px 0', borderRadius: 8, border: '1px solid #D8D2C6', background: 'transparent', color: '#2C2C2C', fontSize: 13, fontWeight: 600, cursor: 'pointer', ...FONT }}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => submitManualOrder(false)} disabled={addingManualOrder || !manualOrderForm.vendor.trim() || !manualOrderForm.description.trim() || !manualOrderForm.qty}
                    style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: '#2C2C2C', color: '#FAF9F6', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (!manualOrderForm.vendor.trim() || !manualOrderForm.description.trim() || !manualOrderForm.qty) ? 0.5 : 1, ...FONT }}>
                    {addingManualOrder ? 'Adding…' : 'Save'}
                  </button>
                  <button onClick={() => { setManualOrderFor(null); setManualOrderDupes(null) }} style={{ padding: '10px 0', borderRadius: 8, border: '1px solid #D8D2C6', background: 'transparent', color: '#2C2C2C', fontSize: 13, fontWeight: 600, cursor: 'pointer', ...FONT }}>
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Product detail panel */}
      {selectedProduct && (
        <ProductPanel
          product={selectedProduct}
          needed={packQueue?.rows.find(r => r.shopifyId === selectedProduct.shopify_id)?.jars ?? 0}
          supplies={supplies}
          allProducts={products}
          onClose={() => setSelectedProduct(null)}
          onProductUpdate={updates => {
            const merged = { ...selectedProduct, ...updates }
            setSelectedProduct(merged)
            setProducts(prev => prev.map(p => p.shopify_id === merged.shopify_id ? merged : p))
          }}
          onBundleComponentsChange={(bundleId, comps) => {
            setAllBundleComponents(prev => {
              const filtered = prev.filter(c => c.bundle_shopify_id !== bundleId)
              return [...filtered, ...comps.map(c => ({ ...c, bundle_shopify_id: bundleId }))]
            })
          }}
          onPackedChange={() => {
            loadPackQueue()
            if (supplyLevels) loadSupplyLevels()
            if (packagingLevels) loadPackagingLevels()
            if (labelInventory) loadLabelInventory()
            if (ordersAnalysis) loadOrdersAnalysis()
          }}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 'calc(56px + env(safe-area-inset-bottom, 0px) + 12px)', left: '50%', transform: 'translateX(-50%)',
          background: '#2C2C2C', color: '#FAF9F6', padding: '10px 22px',
          borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999,
          boxShadow: '0 4px 18px rgba(44,44,44,0.28)', whiteSpace: 'nowrap', ...FONT,
        }}>
          {toast}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .product-desc-preview p { margin: 0 0 6px; }
        .product-desc-preview h1, .product-desc-preview h2, .product-desc-preview h3, .product-desc-preview h4 { font-size: 13px; font-weight: 600; margin: 0 0 4px; color: #2C2C2C; }
        .product-desc-preview ul, .product-desc-preview ol { margin: 0 0 6px; padding-left: 18px; }
        .product-desc-preview li { margin-bottom: 2px; }
        .product-desc-preview strong { font-weight: 600; color: #2C2C2C; }
        .product-desc-preview a { color: #3d7684; text-decoration: none; }
      `}</style>
    </>
  )
}
