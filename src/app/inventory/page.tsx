'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { AlertTriangle, RefreshCw, Plus, X, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { StatusRail } from '@/components/ui/StatusRail'
import { StatusBadge } from '@/components/ui/StatusBadge'

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
  ingredients: Array<{ id: number; supply_id: number; tbsp: number; supply_name: string; oz_per_tbsp: number | null; package_cost: number | null; package_weight: number | null }>
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
  product, supplies, allProducts, onClose, onProductUpdate, onBundleComponentsChange,
}: { product: ShopifyProduct; supplies: Supply[]; allProducts: ShopifyProduct[]; onClose: () => void; onProductUpdate?: (updates: Partial<ShopifyProduct>) => void; onBundleComponentsChange?: (bundleShopifyId: string, comps: BundleComponent[]) => void }) {
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
  const [editableQty, setEditableQty] = useState(String(product.shopify_qty))
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
    setEditableQty(String(product.shopify_qty))
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
  const displayQty = isBundle ? bundleQty : product.shopify_qty
  const isLow = displayQty < 2

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(116,116,116,0.25)' }} onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 flex flex-col bg-white shadow-2xl" style={{ width: 'min(420px, 100vw)' }}>
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
            {/* On-hand qty — read-only computed for bundles, editable otherwise */}
            <div>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 5px', ...FONT }}>
                {isBundle ? 'On-Hand Qty · Computed' : 'On-Hand Qty · Shopify'}
              </p>
              {isBundle ? (
                <div style={{ padding: '9px 11px', border: '1px solid #D8D2C6', borderRadius: 8, fontSize: 13.5, color: '#2C2C2C', ...FONT, background: '#FAFAF8' }}>
                  {bundleQty}
                  <span style={{ fontSize: 10, color: '#78B7C5', fontWeight: 600, marginLeft: 8, ...FONT }}>from components</span>
                </div>
              ) : (
                <input
                  type="number" min="0" step="1"
                  value={editableQty}
                  onChange={e => {
                    const qty = parseInt(e.target.value) || 0
                    setEditableQty(e.target.value)
                    onProductUpdate?.({ shopify_qty: qty })
                    if (product.inventory_item_id) {
                      patchShopify({ inventory_qty: qty, inventory_item_id: product.inventory_item_id })
                    }
                  }}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid #D8D2C6', borderRadius: 8, fontSize: 13.5, color: '#2C2C2C', ...FONT, outline: 'none' }}
                />
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
  serving_size: '', serving_unit: 'tsp', total_servings: '',
  package_cost: '',
  category: 'product', active: true,
}

function SuppliesTab({ supplies, onAdd, onUpdate, onDelete }: {
  supplies: Supply[]
  onAdd: (s: Supply) => void
  onUpdate: (s: Supply) => void
  onDelete: (id: number) => void
}) {
  const [form, setForm] = useState<NewSupplyForm>(EMPTY_FORM)
  const [adding, setAdding] = useState(false)
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<NewSupplyForm>(EMPTY_FORM)

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

  return (
    <>
    {/* Add Supply slide-in panel */}
    {showAddPanel && (
      <>
        <div className="fixed inset-0 z-40" style={{ background: 'rgba(116,116,116,0.25)' }} onClick={() => { setShowAddPanel(false); setForm(EMPTY_FORM) }} />
        <div className="fixed right-0 top-0 bottom-0 z-50 flex flex-col bg-white shadow-2xl" style={{ width: 'min(400px, 100vw)' }}>
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

    <div>
      {/* Header row with Add button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
        <button onClick={() => setShowAddPanel(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2C2C2C', color: '#FAF9F6', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', ...FONT }}>
          <Plus size={13} /> Add Supply
        </button>
      </div>

      {/* Ingredient supplies table */}
      <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 8px', ...FONT }}>Ingredient Supplies</p>
      <div style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FBF0E3' }}>
              {['Supply', 'Vendor', 'Package', 'Servings', 'oz/Tbsp', '$/Tbsp', 'Active', ''].map(h => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {productSupplies.length === 0 && (
              <tr><td colSpan={8} style={{ ...TD, padding: '20px 14px', color: '#747474' }}>No ingredient supplies yet.</td></tr>
            )}
            {productSupplies.map(s => {
              const isEditing = editId === s.id
              const pkgLbs = s.package_weight
              const pkgOz = s.package_extra_oz ?? 0
              const pkgStr = pkgLbs != null
                ? [pkgLbs ? `${pkgLbs} lb` : '', pkgOz ? `${pkgOz} oz` : ''].filter(Boolean).join(' ') || '—'
                : '—'
              const servUnit = s.serving_unit ?? 'tsp'
              const servStr = s.total_servings
                ? `${s.total_servings} × ${s.serving_size ?? '?'} ${servUnit}`
                : s.serving_size ? `${s.serving_size} ${servUnit}/serving` : '—'
              const cpt = calcCostPerTbsp(s)

              if (isEditing) {
                return (
                  <tr key={s.id} style={{ borderTop: '1px solid rgba(216,210,198,0.35)' }}>
                    <td colSpan={8} style={{ padding: '12px 14px', background: '#FBF0E3' }}>
                      {EDIT_TOP_ROW(true)}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11.5, color: '#747474', flexShrink: 0, ...FONT }}>Package:</span>
                        <input value={editForm.package_weight} onChange={e => f('package_weight', e.target.value, true)} placeholder="lbs" type="number" style={{ ...INPUT, width: 62, flexShrink: 0, textAlign: 'right' }} />
                        <span style={{ fontSize: 11.5, color: '#747474', flexShrink: 0, ...FONT }}>lb</span>
                        <input value={editForm.package_extra_oz} onChange={e => f('package_extra_oz', e.target.value, true)} placeholder="oz" type="number" step="0.1" style={{ ...INPUT, width: 62, flexShrink: 0, textAlign: 'right' }} />
                        <span style={{ fontSize: 11.5, color: '#747474', flexShrink: 0, ...FONT }}>oz · $</span>
                        <input value={editForm.package_cost} onChange={e => f('package_cost', e.target.value, true)} placeholder="cost" type="number" step="0.01" style={{ ...INPUT, width: 72, flexShrink: 0, textAlign: 'right' }} />
                        <span style={{ fontSize: 11.5, color: '#747474', flexShrink: 0, marginLeft: 8, ...FONT }}>Servings:</span>
                        <input value={editForm.total_servings} onChange={e => f('total_servings', e.target.value, true)} placeholder="count" type="number" style={{ ...INPUT, width: 62, flexShrink: 0, textAlign: 'right' }} />
                        <span style={{ fontSize: 11.5, color: '#747474', flexShrink: 0, ...FONT }}>×</span>
                        <input value={editForm.serving_size} onChange={e => f('serving_size', e.target.value, true)} placeholder="size" type="number" step="0.01" style={{ ...INPUT, width: 70, flexShrink: 0, textAlign: 'right' }} />
                        <select value={editForm.serving_unit} onChange={e => f('serving_unit', e.target.value, true)} style={{ ...SELECT, width: 58, flexShrink: 0 }}>
                          <option value="tsp">tsp</option>
                          <option value="oz">oz</option>
                        </select>
                        <span style={{ fontSize: 11.5, color: '#747474', flexShrink: 0, marginLeft: 8, ...FONT }}>oz/tbsp:</span>
                        <input readOnly value={previewEdit.ozPerTbsp != null ? previewEdit.ozPerTbsp.toFixed(4) : ''} placeholder="auto" style={{ ...CALC_INPUT, width: 72, flexShrink: 0, textAlign: 'right' }} />
                        <span style={{ fontSize: 11.5, color: '#747474', flexShrink: 0, marginLeft: 4, ...FONT }}>$/tbsp:</span>
                        <input readOnly value={previewEdit.costPerTbsp != null ? previewEdit.costPerTbsp.toFixed(2) : ''} placeholder="auto" style={{ ...CALC_INPUT, width: 72, flexShrink: 0, textAlign: 'right' }} />
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
                  <td style={{ ...TD, color: '#747474' }}>{s.vendor ?? '—'}</td>
                  <td style={TD}>
                    <span>{pkgStr}</span>
                    {s.package_cost != null && <span style={{ color: '#747474' }}> · ${s.package_cost.toFixed(2)}</span>}
                  </td>
                  <td style={TD}>{servStr}</td>
                  <td style={TD}>{(() => { const v = calcOzPerTbsp(s); return v != null ? v.toFixed(4) : '—' })()}</td>
                  <td style={{ ...TD, fontWeight: 700, color: '#5c8a3f' }}>{cpt != null ? `$${cpt.toFixed(2)}` : '—'}</td>
                  <td style={{ ...TD, textAlign: 'center' }}>
                    <input type="checkbox" checked={!!s.active} onChange={() => toggleActive(s)} style={{ width: 15, height: 15, accentColor: '#2C2C2C', cursor: 'pointer' }} />
                  </td>
                  <td style={{ ...TD, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {s.order_url && <a href={s.order_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, fontWeight: 600, color: '#3d7684', textDecoration: 'none', marginRight: 10, ...FONT }}>Order ↗</a>}
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

      {/* Packaging supplies table */}
      <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 8px', ...FONT }}>Packaging Supplies</p>
      <div style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 12, overflow: 'hidden' }}>
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
                  <td style={{ ...TD, color: '#747474' }}>{s.vendor ?? '—'}</td>
                  <td style={TD}>
                    {s.order_url
                      ? <a href={s.order_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 600, color: '#3d7684', textDecoration: 'none', ...FONT }}>Order ↗</a>
                      : <span style={{ color: '#747474' }}>—</span>}
                  </td>
                  <td style={TD}>{s.total_servings ? s.total_servings.toLocaleString() : '—'}</td>
                  <td style={TD}>{s.package_cost != null ? `$${s.package_cost.toFixed(2)}` : '—'}</td>
                  <td style={{ ...TD, fontWeight: 700, color: '#3d7684' }}>{cpu != null ? `$${cpu.toFixed(2)}` : '—'}</td>
                  <td style={{ ...TD, textAlign: 'center' }}>
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

function ProductCard({ product, displayQty, onClick }: { product: ShopifyProduct; displayQty: number; onClick: () => void }) {
  const accent = ACCENT_HEX[product.accent_color ?? 'sage'] ?? '#9BAE9A'
  const isActive = product.status === 'active' && !product.is_bundle
  const isCritical = isActive && displayQty < 2
  const isWarning  = isActive && !isCritical && displayQty < product.reorder_threshold

  const borderColor = isCritical ? '#C94040' : isWarning ? '#B87816' : 'rgba(216,210,198,0.6)'
  const stockColor  = isCritical ? '#C94040' : isWarning ? '#B87816' : '#3A8A5A'

  return (
    <div onClick={onClick} style={{
      background: '#fff', borderRadius: 10,
      border: `1px solid ${borderColor}`,
      borderLeft: isCritical ? '3px solid #C94040' : isWarning ? '3px solid #B87816' : `1px solid ${borderColor}`,
      display: 'flex', overflow: 'hidden', cursor: 'pointer',
      transition: 'box-shadow 0.15s',
    }}>
      {/* accent rail — only show when not exception (exception uses left border) */}
      {!isCritical && !isWarning && <div style={{ width: 4, flexShrink: 0, background: accent }} />}
      <div style={{ flex: 1, padding: '14px 16px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#2C2C2C', margin: 0, ...FONT }}>{product.title}</p>
          {!!product.is_bundle && (
            <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#78B7C5', background: 'rgba(120,183,197,0.14)', padding: '2px 7px', borderRadius: 999, flexShrink: 0, ...FONT }}>Bundle</span>
          )}
          {isCritical && <StatusBadge severity="critical" label="Critical" size="sm" dot />}
          {isWarning  && <StatusBadge severity="warning"  label="Low stock" size="sm" dot />}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 22 }}>
          <div>
            <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(116,116,116,0.6)', margin: '0 0 2px', ...FONT }}>Stock</p>
            <p style={{ fontSize: 19, fontWeight: 700, margin: 0, color: stockColor, ...FONT }}>{displayQty}</p>
          </div>
          {product.price && (
            <div>
              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(116,116,154,0.6)', margin: '0 0 2px', ...FONT }}>Price</p>
              <p style={{ fontSize: 13.5, fontWeight: 600, margin: 0, color: '#2C2C2C', ...FONT }}>${product.price}</p>
            </div>
          )}
          <div>
            <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(116,116,116,0.6)', margin: '0 0 2px', ...FONT }}>Restock at</p>
            <p style={{ fontSize: 13.5, margin: 0, color: 'rgba(116,116,116,0.7)', ...FONT }}>{product.reorder_threshold}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const [products, setProducts] = useState<ShopifyProduct[]>([])
  const [supplies, setSupplies] = useState<Supply[]>([])
  const [allBundleComponents, setAllBundleComponents] = useState<(BundleComponent & { bundle_shopify_id: string })[]>([])
  const [shopifyStatus, setShopifyStatus] = useState<ShopifyStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [tab, setTab] = useState<'products' | 'supplies'>('products')
  const [selectedProduct, setSelectedProduct] = useState<ShopifyProduct | null>(null)

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

  useEffect(() => { loadData() }, [loadData])

  async function handleSync() {
    setSyncing(true)
    try { await fetch('/api/shopify/sync', { method: 'POST' }); await loadData() }
    finally { setSyncing(false) }
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

  const TAB_BTN = (label: string, val: 'products' | 'supplies') => (
    <button
      key={val}
      onClick={() => setTab(val)}
      style={{
        ...FONT, fontSize: 13, fontWeight: tab === val ? 600 : 500,
        padding: '10px 18px', background: 'transparent', border: 'none',
        borderBottom: tab === val ? '2px solid #2C2C2C' : '2px solid transparent',
        color: tab === val ? '#2C2C2C' : '#747474',
        cursor: 'pointer', marginBottom: -1,
      }}
    >
      {label}
    </button>
  )

  return (
    <>
      <div style={{ padding: 'clamp(18px,4vw,40px) clamp(16px,4vw,44px) 90px', maxWidth: 1160 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#747474', margin: '0 0 6px', ...FONT }}>Operations</p>
            <h1 style={{ ...SERIF, fontWeight: 700, fontSize: 42, margin: 0, color: '#2C2C2C' }}>Inventory</h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {shopifyStatus?.connected && (
              <>
                <a href="https://admin.shopify.com/store/eiy0fe-13/products" target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 8, border: '1px solid #D8D2C6', background: 'transparent', color: '#2C2C2C', fontSize: 13.5, fontWeight: 600, textDecoration: 'none', ...FONT }}>
                  <ExternalLink size={14} /> Shopify
                </a>
                <button onClick={handleSync} disabled={syncing}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 8, background: '#2C2C2C', color: '#FAF9F6', fontSize: 13.5, fontWeight: 600, border: 'none', cursor: 'pointer', ...FONT }}>
                  <RefreshCw size={14} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
                  {syncing ? 'Syncing…' : 'Sync now'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Exception rail — critical first, then warning */}
        {criticalProducts.length > 0 && (
          <StatusRail
            severity="critical"
            message={`${criticalProducts.length} product${criticalProducts.length > 1 ? 's' : ''} out of stock`}
            items={criticalProducts.map(p => ({
              label: `${p.title} (${getDisplayQty(p)})`,
              onClick: () => setSelectedProduct(p),
            }))}
          />
        )}
        {warningProducts.length > 0 && (
          <StatusRail
            severity="warning"
            message={`${warningProducts.length} product${warningProducts.length > 1 ? 's' : ''} below reorder threshold`}
            items={warningProducts.map(p => ({
              label: `${p.title} (${getDisplayQty(p)})`,
              onClick: () => setSelectedProduct(p),
            }))}
          />
        )}

        {/* Status bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <p style={{ fontSize: 12.5, color: 'rgba(116,116,116,0.7)', margin: 0, ...FONT }}>{active.length} active · {draft.length} draft</p>
          <span style={{ fontSize: 12, color: 'rgba(116,116,116,0.5)', ...FONT }}>
            Synced from Shopify · {syncedLabel}
          </span>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #D8D2C6', marginBottom: 24 }}>
          {TAB_BTN('Products', 'products')}
          {TAB_BTN('Supplies', 'supplies')}
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
                    {active.map(p => <ProductCard key={p.shopify_id} product={p} displayQty={getDisplayQty(p)} onClick={() => setSelectedProduct(p)} />)}
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
                    {draft.map(p => <ProductCard key={p.shopify_id} product={p} displayQty={getDisplayQty(p)} onClick={() => setSelectedProduct(p)} />)}
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
            onAdd={s => setSupplies(prev => [...prev, s])}
            onUpdate={s => setSupplies(prev => prev.map(x => x.id === s.id ? s : x))}
            onDelete={id => setSupplies(prev => prev.filter(s => s.id !== id))}
          />
        )}
      </div>

      {/* Product detail panel */}
      {selectedProduct && (
        <ProductPanel
          product={selectedProduct}
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
        />
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
