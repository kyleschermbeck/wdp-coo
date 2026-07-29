'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'

const FONT: React.CSSProperties = { fontFamily: "'Jost', system-ui, sans-serif" }
const SERIF: React.CSSProperties = { fontFamily: "'Cormorant Garamond', Georgia, serif" }

const PILL = (bg: string, color: string): React.CSSProperties => ({
  ...FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
  padding: '3px 9px', borderRadius: 999, background: bg, color,
})

// ─── Static data (design spec) ───────────────────────────────────────────────

const STATS = [
  { label: 'Your Price Position', value: 'Mid-tier', sub: '$14–16/jar vs $9–22 category range' },
  { label: 'Share of Voice (IG)', value: '~6%', sub: 'among 6 tracked spice-blend brands' },
  { label: 'Price Gap vs Leader', value: '-18%', sub: 'vs. category leader Spiceology' },
]

const COMPETITORS = [
  { name: 'Weeknight Dinner Party (you)', price: '$14–16', positioning: 'Home-cook-made, weeknight simplicity', followers: '4.2K', retail: 'DTC + 2 wholesale accounts', isWDP: true },
  { name: 'Spiceology', price: '$17–22', positioning: 'Chef-driven, premium single origin', followers: '112K', retail: 'DTC + national grocery', isWDP: false },
  { name: 'Diaspora Co.', price: '$10–14', positioning: 'Single-origin, sourcing-forward story', followers: '86K', retail: 'DTC + specialty grocers', isWDP: false },
  { name: 'Burlap & Barrel', price: '$9–13', positioning: 'Farmer-direct, single-origin spices', followers: '64K', retail: 'DTC + Whole Foods', isWDP: false },
  { name: 'Fly By Jing', price: '$16–24', positioning: 'Bold flavor, viral social-first brand', followers: '210K', retail: 'DTC + Target + Whole Foods', isWDP: false },
]

const PROFILES = [
  {
    name: 'Spiceology',
    tagline: '"Chef-inspired flavor, made simple."',
    segment: 'Serious home cooks 35–55, higher household income, values chef pedigree and versatility across a large SKU range.',
    branding: 'Clean minimalist labels, chef collabs and recipe video content, matte black + kraft packaging, frequent recipe-card email sends.',
  },
  {
    name: 'Diaspora Co.',
    tagline: '"Single-origin spices, farmer-direct."',
    segment: 'Values-driven cooks 28–45, urban, willing to pay a premium for traceability and fair-trade sourcing stories.',
    branding: 'Warm editorial photography, farmer profile storytelling, bold jewel-tone packaging, long-form Instagram captions and newsletter essays.',
  },
  {
    name: 'Burlap & Barrel',
    tagline: '"Extraordinary spices, direct trade."',
    segment: 'Food-curious professionals 30–50, gift-givers, drawn to single-origin rarity and transparent farmer pricing.',
    branding: 'Photography-forward grid, farmer-and-harvest video content, minimal kraft-and-color labels, strong wholesale/retail merchandising kit.',
  },
  {
    name: 'Fly By Jing',
    tagline: '"Bold, unapologetic flavor."',
    segment: 'Younger, social-first foodies 22–38, drawn to viral flavor moments and founder personality.',
    branding: 'Saturated red/gold packaging, short-form video-first content (Reels/TikTok), founder-led storytelling, frequent limited-drop collabs.',
  },
]

const OPPORTUNITIES = [
  { title: 'Underpriced vs. positioning', detail: "You're 18% below the category leader while offering comparable quality — room to test a modest price increase on bundles." },
  { title: 'Wholesale is wide open', detail: 'Most competitors lean DTC-first; a fast regional wholesale push could win shelf space before they prioritize it.' },
  { title: 'Content format gap', detail: "Fly By Jing's growth is short-form video first — none of your recent content is video; low-cost test opportunity." },
  { title: 'Bundle gifting angle', detail: 'No tracked competitor has a strong holiday gift-bundle push yet — your Holiday Gift Bundles project could move first.' },
]

const THREATS = [
  { title: 'Fly By Jing scaling into grocery', detail: 'Recently expanded into Target and Whole Foods — increasing shelf competition in the premium spice set.' },
  { title: 'Category-wide price compression', detail: 'Two competitors ran 20%+ off promotions last month, pressuring perceived value across the category.' },
  { title: 'Rising paid social costs', detail: 'CPMs in the food/CPG space are up industry-wide — organic content and email are safer growth levers right now.' },
]

const SOURCES = [
  { type: 'Website', label: 'Spiceology — spiceology.com', note: 'Pricing, product line, positioning copy', url: 'https://spiceology.com', typeBg: 'rgba(160,198,109,0.2)', typeColor: '#5c8a3f' },
  { type: 'Website', label: 'Diaspora Co. — diasporaco.com', note: 'Pricing, sourcing story, retail list', url: 'https://diasporaco.com', typeBg: 'rgba(160,198,109,0.2)', typeColor: '#5c8a3f' },
  { type: 'Website', label: 'Burlap & Barrel — burlapandbarrel.com', note: 'Pricing, retail partners', url: 'https://burlapandbarrel.com', typeBg: 'rgba(160,198,109,0.2)', typeColor: '#5c8a3f' },
  { type: 'Website', label: 'Fly By Jing — flybyjing.com', note: 'Pricing, retail partners, brand voice', url: 'https://flybyjing.com', typeBg: 'rgba(160,198,109,0.2)', typeColor: '#5c8a3f' },
  { type: 'Instagram', label: '@spiceology, @diasporaco, @burlapandbarrel, @flybyjing', note: 'Follower counts, content format, posting cadence', url: 'https://instagram.com', typeBg: 'rgba(248,175,168,0.25)', typeColor: '#b5675f' },
  { type: 'Traffic Data', label: 'SimilarWeb', note: 'Estimated site traffic and channel mix', url: 'https://similarweb.com', typeBg: 'rgba(120,183,197,0.22)', typeColor: '#3d7684' },
  { type: 'Retail', label: 'Whole Foods / Target product listings', note: 'Retail placement and shelf pricing', url: 'https://www.wholefoodsmarket.com', typeBg: 'rgba(240,215,122,0.3)', typeColor: '#a17a1f' },
  { type: 'Internal', label: 'Shopify + Klaviyo account data', note: 'Your own price points, followers, and email performance', url: '#', typeBg: 'rgba(216,210,198,0.5)', typeColor: 'rgba(116,116,116,0.8)' },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

interface AiInsight { category: string; finding: string; action: string; priority: 'high' | 'medium' | 'low' }
interface AiResult { summary: string; insights: AiInsight[] }

const PRIORITY_STYLE: Record<string, React.CSSProperties> = {
  high:   { background: 'rgba(163,90,55,0.12)', color: '#a35a37' },
  medium: { background: 'rgba(240,215,122,0.3)', color: '#a17a1f' },
  low:    { background: 'rgba(216,210,198,0.5)', color: '#747474' },
}

export default function CompetitivePage() {
  const [notes, setNotes] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [aiResult, setAiResult] = useState<AiResult | null>(null)
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/competitive/notes')
      .then(r => r.json())
      .then((d: { notes?: string; insights?: string; refreshed_at?: string | null }) => {
        if (d.notes) setNotes(d.notes)
        if (d.insights) { try { setAiResult(JSON.parse(d.insights)) } catch { /* empty */ } }
        if (d.refreshed_at) setRefreshedAt(d.refreshed_at)
      })
      .catch(() => {})
  }, [])

  function saveNotes(val: string) {
    fetch('/api/competitive/notes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: val }),
    }).catch(() => {})
  }

  async function refresh() {
    setRefreshing(true)
    setError(null)
    try {
      const res = await fetch('/api/competitive/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      })
      const data = await res.json() as { insights?: AiResult; refreshed_at?: string; error?: string }
      if (data.error) { setError(data.error); return }
      if (data.insights) setAiResult(data.insights)
      if (data.refreshed_at) setRefreshedAt(data.refreshed_at)
    } catch {
      setError('Failed to refresh — check your API key.')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div style={{ padding: 'clamp(18px,4vw,40px) clamp(16px,4vw,44px) 90px', maxWidth: 1160, ...FONT }}>

      {/* Header */}
      <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#747474', margin: '0 0 6px' }}>
        Operations
      </p>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
        <h1 style={{ ...SERIF, fontWeight: 700, fontSize: 42, margin: 0, color: '#2C2C2C' }}>
          Competitive Insights
        </h1>
        <button
          onClick={refresh}
          disabled={refreshing}
          style={{ ...FONT, display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', borderRadius: 10, background: '#2C2C2C', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: refreshing ? 'default' : 'pointer', opacity: refreshing ? 0.6 : 1, flexShrink: 0, marginBottom: 4 }}
        >
          {refreshing ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {refreshing ? 'Refreshing…' : 'Refresh Analysis'}
        </button>
      </div>
      <p style={{ fontSize: 14, color: '#747474', margin: '0 0 16px', maxWidth: 640, lineHeight: 1.6 }}>
        How Weeknight Dinner Party stacks up against the brands fighting for the same shelf — and what it suggests for your next move.
      </p>

      {/* Customization box */}
      <div style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.7)', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#747474', margin: '0 0 8px', ...FONT }}>
          Focus Areas / Customize Analysis
        </p>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={() => saveNotes(notes)}
          placeholder="Tell the AI what to focus on — e.g. 'compare our pricing vs. Diaspora for a potential price increase', 'what are competitors doing on TikTok?', 'any gaps in the wholesale channel?'"
          rows={3}
          style={{ ...FONT, width: '100%', fontSize: 13, color: '#2C2C2C', background: 'rgba(240,237,230,0.4)', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 8, padding: '9px 12px', resize: 'vertical', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box' }}
        />
        {error && <p style={{ ...FONT, fontSize: 12, color: '#a35a37', marginTop: 6 }}>{error}</p>}
      </div>

      {/* AI insights (shown after refresh) */}
      {aiResult && (
        <div style={{ background: 'rgba(122,158,126,0.06)', border: '1px solid rgba(122,158,126,0.25)', borderRadius: 12, padding: '20px 22px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={14} color="#3d7684" />
              <p style={{ ...FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#3d7684', margin: 0 }}>
                AI Analysis{refreshedAt ? ` · ${new Date(refreshedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
              </p>
            </div>
          </div>
          <p style={{ ...FONT, fontSize: 13.5, color: '#2C2C2C', lineHeight: 1.65, margin: '0 0 18px', maxWidth: 720 }}>
            {aiResult.summary}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 10 }}>
            {aiResult.insights.map((ins, i) => (
              <div key={i} style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.5)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <p style={{ ...FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#2C2C2C', margin: 0 }}>{ins.category}</p>
                  <span style={{ ...FONT, ...PRIORITY_STYLE[ins.priority], fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 999 }}>{ins.priority}</span>
                </div>
                <p style={{ ...FONT, fontSize: 12.5, color: '#2C2C2C', lineHeight: 1.5, margin: '0 0 8px' }}>{ins.finding}</p>
                <p style={{ ...FONT, fontSize: 11.5, color: '#5c8a3f', lineHeight: 1.45, margin: 0, fontWeight: 600 }}>→ {ins.action}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agent note */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
        <div style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(120,183,197,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ width: 5, height: 5, borderRadius: 999, background: '#3d7684', display: 'inline-block' }} />
        </div>
        <p style={{ fontSize: 12, color: '#3d7684', margin: 0 }}>
          Base data compiled by the <strong>Marketing Agent</strong> · Updated Jul 10, 2026 ·{' '}
          <a href="#competitive-sources" style={{ color: '#3d7684', textDecoration: 'underline' }}>sources below</a>
        </p>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 24 }}>
        {STATS.map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 12, padding: 18 }}>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.65)', margin: '0 0 6px', ...FONT }}>{s.label}</p>
            <p style={{ ...SERIF, fontSize: 24, fontWeight: 700, color: '#2C2C2C', margin: '0 0 4px', lineHeight: 1 }}>{s.value}</p>
            <p style={{ fontSize: 11.5, color: '#747474', margin: 0, ...FONT }}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Landscape table */}
      <div style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 12, padding: 22, marginBottom: 16, overflowX: 'auto' }}>
        <h2 style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#2C2C2C', margin: '0 0 16px', ...FONT }}>Landscape</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
          <thead>
            <tr>
              {['Brand', 'Price / jar', 'Positioning', 'IG Followers', 'Retail'].map(h => (
                <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', paddingBottom: 10, paddingRight: 16, ...FONT }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPETITORS.map(c => (
              <tr key={c.name} style={{ borderTop: '1px solid rgba(216,210,198,0.35)', background: c.isWDP ? 'rgba(155,174,154,0.06)' : 'transparent' }}>
                <td style={{ padding: '11px 16px 11px 0' }}>
                  <span style={{ fontSize: c.isWDP ? 13.5 : 13, fontWeight: c.isWDP ? 700 : 500, color: c.isWDP ? '#2C2C2C' : '#747474', ...FONT }}>
                    {c.name}
                  </span>
                </td>
                <td style={{ padding: '11px 16px 11px 0', fontSize: 13, color: '#2C2C2C', fontWeight: c.isWDP ? 600 : 400, ...FONT }}>{c.price}</td>
                <td style={{ padding: '11px 16px 11px 0', fontSize: 12.5, color: '#747474', ...FONT, maxWidth: 260 }}>{c.positioning}</td>
                <td style={{ padding: '11px 16px 11px 0', fontSize: 13, color: '#2C2C2C', fontWeight: c.isWDP ? 600 : 400, ...FONT }}>{c.followers}</td>
                <td style={{ padding: '11px 0', fontSize: 12.5, color: '#747474', ...FONT }}>{c.retail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Customer Segments & Brand Voice */}
      <div style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 12, padding: 22, marginBottom: 16 }}>
        <h2 style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#2C2C2C', margin: '0 0 16px', ...FONT }}>
          Customer Segments &amp; Brand Voice
        </h2>
        <div>
          {PROFILES.map(p => (
            <div
              key={p.name}
              style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 20, padding: '16px 0', borderTop: '1px solid rgba(216,210,198,0.35)' }}
            >
              <div>
                <p style={{ fontSize: 13.5, fontWeight: 700, color: '#2C2C2C', margin: '0 0 4px', ...FONT }}>{p.name}</p>
                <p style={{ fontSize: 11, color: '#747474', margin: 0, ...FONT, fontStyle: 'italic' }}>{p.tagline}</p>
              </div>
              <div>
                <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 5px', ...FONT }}>Core customer</p>
                <p style={{ fontSize: 12.5, color: '#2C2C2C', lineHeight: 1.5, margin: 0, ...FONT }}>{p.segment}</p>
              </div>
              <div>
                <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.6)', margin: '0 0 5px', ...FONT }}>Branding &amp; collateral</p>
                <p style={{ fontSize: 12.5, color: '#2C2C2C', lineHeight: 1.5, margin: 0, ...FONT }}>{p.branding}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Opportunities + Threats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16, marginBottom: 16 }}>
        <div style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 12, padding: 22 }}>
          <h2 style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#2C2C2C', margin: '0 0 14px', ...FONT }}>Opportunities</h2>
          <div>
            {OPPORTUNITIES.map(op => (
              <div key={op.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 0', borderTop: '1px solid rgba(216,210,198,0.4)' }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, flexShrink: 0, marginTop: 6, background: '#5c8a3f', display: 'inline-block' }} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#2C2C2C', margin: '0 0 2px', ...FONT }}>{op.title}</p>
                  <p style={{ fontSize: 12, color: '#747474', margin: 0, lineHeight: 1.5, ...FONT }}>{op.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 12, padding: 22 }}>
          <h2 style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#2C2C2C', margin: '0 0 14px', ...FONT }}>Watch Out For</h2>
          <div>
            {THREATS.map(th => (
              <div key={th.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 0', borderTop: '1px solid rgba(216,210,198,0.4)' }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, flexShrink: 0, marginTop: 6, background: '#a35a37', display: 'inline-block' }} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#2C2C2C', margin: '0 0 2px', ...FONT }}>{th.title}</p>
                  <p style={{ fontSize: 12, color: '#747474', margin: 0, lineHeight: 1.5, ...FONT }}>{th.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sources */}
      <div id="competitive-sources" style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 12, padding: 22 }}>
        <h2 style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#2C2C2C', margin: '0 0 6px', ...FONT }}>Sources</h2>
        <p style={{ fontSize: 11.5, color: 'rgba(116,116,116,0.65)', margin: '0 0 14px', ...FONT }}>
          Where the Marketing Agent pulled this from — check the primary source before acting on any figure here.
        </p>
        <div>
          {SOURCES.map(src => (
            <div key={src.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: '1px solid rgba(216,210,198,0.35)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{ ...PILL(src.typeBg, src.typeColor), flexShrink: 0 }}>{src.type}</span>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: '#2C2C2C', margin: 0, ...FONT }}>{src.label}</p>
                  <p style={{ fontSize: 11, color: '#747474', margin: '1px 0 0', ...FONT }}>{src.note}</p>
                </div>
              </div>
              {src.url !== '#' && (
                <a
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 11.5, fontWeight: 600, color: '#3d7684', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0, ...FONT }}
                >
                  Visit ↗
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
