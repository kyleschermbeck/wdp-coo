'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Globe, Monitor, Smartphone, MapPin, FileText } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GASummary {
  sessions: number
  newUsers: number
  totalUsers: number
  pageViews: number
  bounceRate: number           // already a percentage e.g. 37.1
  avgSessionDuration: number
  avgSessionDurationFmt: string
  conversions: number
  revenue: number
}

interface GASource  { channel: string; sessions: number; newUsers: number; pct: number }
interface GAPage    { path: string; title: string; views: number; avgDurationFmt: string }
interface GADevice  { category: string; sessions: number; pct: number }
interface GALocation { country: string; sessions: number; newUsers: number; pct: number }

interface GAData {
  summary: GASummary
  sources: GASource[]
  pages: GAPage[]
  devices?: GADevice[]
  locations?: GALocation[]
  property_name?: string
  days: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FONT      = "'Jost', system-ui, sans-serif"
const SERIF     = "'Cormorant Garamond', Georgia, serif"
const BORDER    = '1px solid rgba(216,210,198,0.6)'
const INK       = '#2C2C2C'
const INK_MID   = 'rgba(44,44,44,0.55)'
const INK_LIGHT = 'rgba(44,44,44,0.35)'
const OATMILK   = '#FBF7F3'

function fmt(n: number | null | undefined) {
  if (n == null || isNaN(n as number)) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return String(Math.round(n))
}

function cleanTitle(title: string, path: string) {
  // Strip " – Weeknight Dinner Party" suffix
  const t = title.replace(/\s*[–—-]\s*Weeknight Dinner Party\s*$/i, '').trim()
  if (!t || t === path) {
    if (path === '/') return 'Home'
    return path.replace(/^\//, '').split('/').pop()?.replace(/-/g, ' ') || path
  }
  return t
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{ background: '#fff', border: BORDER, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK_LIGHT, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, color: accent ?? INK, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontFamily: FONT, fontSize: 11, color: INK_MID, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function HBar({ label, pct, count, sub }: { label: string; pct: number; count: number; sub?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 500, color: INK }}>{label}</span>
        <span style={{ fontFamily: FONT, fontSize: 12, color: INK_MID }}>
          <span style={{ fontWeight: 700, color: INK }}>{fmt(count)}</span>
          {sub && <span style={{ marginLeft: 6, color: INK_LIGHT }}>{sub}</span>}
          <span style={{ marginLeft: 6, color: INK_LIGHT }}>({pct}%)</span>
        </span>
      </div>
      <div style={{ height: 5, background: 'rgba(216,210,198,0.35)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${Math.min(pct, 100)}%`, borderRadius: 3,
          background: 'linear-gradient(90deg, #9BAE9A 0%, #C27A54 100%)',
          transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>
    </div>
  )
}

// ─── Main Drawer ──────────────────────────────────────────────────────────────

export function GADrawer() {
  const [data, setData] = useState<GAData | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  useEffect(() => {
    setLoading(true)
    setData(null)
    fetch(`/api/google-analytics/data?days=${days}`)
      .then(r => r.json())
      .then((d: GAData) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [days])

  const s = data?.summary

  return (
    <div>
      {/* Period selector */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT, margin: 0 }}>
          {data?.property_name ?? 'Google Analytics'} · Last {days} days
        </p>
        <div style={{ display: 'flex', gap: 4 }}>
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)} style={{
              fontFamily: FONT, fontSize: 11, fontWeight: days === d ? 700 : 500,
              color: days === d ? INK : INK_MID,
              background: days === d ? OATMILK : 'transparent',
              border: days === d ? BORDER : '1px solid transparent',
              borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
              transition: 'all 0.12s ease',
            }}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ fontFamily: FONT, fontSize: 13, color: INK_LIGHT, padding: '40px 0', textAlign: 'center' }}>Loading…</div>
      )}
      {!loading && !data && (
        <div style={{ fontFamily: FONT, fontSize: 13, color: INK_LIGHT, padding: '40px 0', textAlign: 'center' }}>Could not load Analytics data.</div>
      )}

      {!loading && s && (
        <>
          {/* ── KPIs ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
            <KpiTile label="Sessions"    value={fmt(s.sessions)}   sub={`${fmt(s.newUsers)} new users`} />
            <KpiTile label="Page Views"  value={fmt(s.pageViews)}  sub={s.sessions > 0 ? `${(s.pageViews / s.sessions).toFixed(1)} per session` : undefined} />
            <KpiTile label="Avg Session" value={s.avgSessionDurationFmt ?? '—'} sub="time on site" />
            <KpiTile label="Bounce Rate" value={s.bounceRate != null ? s.bounceRate.toFixed(0) + '%' : '—'}
              sub="left without interacting" accent={s.bounceRate > 65 ? '#C94040' : undefined} />
          </div>

          {/* Conversions + Revenue */}
          {(s.conversions > 0 || s.revenue > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
              {s.conversions > 0 && <KpiTile label="Conversions" value={fmt(s.conversions)} />}
              {s.revenue > 0 && <KpiTile label="Revenue"
                value={`$${s.revenue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                accent="#3A8A5A" />}
            </div>
          )}

          {/* ── Traffic Sources ── */}
          {data.sources?.length > 0 && (
            <div style={{ background: '#fff', border: BORDER, borderRadius: 10, padding: '16px 18px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Globe size={13} style={{ color: INK_LIGHT }} />
                <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK_LIGHT }}>Traffic Sources</span>
              </div>
              {data.sources.map(src => (
                <HBar key={src.channel} label={src.channel} pct={src.pct} count={src.sessions} />
              ))}
            </div>
          )}

          {/* ── Locations ── */}
          {data.locations && data.locations.length > 0 && (
            <div style={{ background: '#fff', border: BORDER, borderRadius: 10, padding: '16px 18px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <MapPin size={13} style={{ color: INK_LIGHT }} />
                <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK_LIGHT }}>Top Locations</span>
              </div>
              {data.locations.map(loc => (
                <HBar key={loc.country} label={loc.country} pct={loc.pct} count={loc.sessions} sub={`${fmt(loc.newUsers)} new`} />
              ))}
            </div>
          )}

          {/* ── Top Pages ── */}
          {data.pages?.length > 0 && (
            <div style={{ background: '#fff', border: BORDER, borderRadius: 10, padding: '16px 18px', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <FileText size={13} style={{ color: INK_LIGHT }} />
                <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK_LIGHT }}>Top Pages</span>
              </div>
              {/* Header row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px 64px', gap: 8, paddingBottom: 8, borderBottom: '1px solid rgba(216,210,198,0.4)', marginBottom: 4 }}>
                <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK_LIGHT }}>Page</span>
                <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK_LIGHT, textAlign: 'right' }}>Views</span>
                <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK_LIGHT, textAlign: 'right' }}>Avg Time</span>
              </div>
              {data.pages.map((pg, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '1fr 64px 64px', gap: 8,
                  padding: '8px 0',
                  borderBottom: i < data.pages.length - 1 ? '1px solid rgba(216,210,198,0.2)' : 'none',
                  alignItems: 'center',
                }}>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 500, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {cleanTitle(pg.title, pg.path)}
                    </div>
                    <div style={{ fontFamily: FONT, fontSize: 10, color: INK_LIGHT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pg.path}</div>
                  </div>
                  <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: INK, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(pg.views)}</div>
                  <div style={{ fontFamily: FONT, fontSize: 12, color: INK_MID, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pg.avgDurationFmt}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Device Split ── */}
          {data.devices && data.devices.length > 0 && (
            <div style={{ background: '#fff', border: BORDER, borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Monitor size={13} style={{ color: INK_LIGHT }} />
                <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK_LIGHT }}>Devices</span>
              </div>
              <div style={{ display: 'flex', gap: 20 }}>
                {data.devices.map(d => (
                  <div key={d.category} style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      {d.category === 'mobile'
                        ? <Smartphone size={12} style={{ color: INK_LIGHT }} />
                        : <Monitor size={12} style={{ color: INK_LIGHT }} />}
                      <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: INK, textTransform: 'capitalize' }}>{d.category}</span>
                    </div>
                    <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: INK, marginBottom: 2 }}>{d.pct}%</div>
                    <div style={{ fontFamily: FONT, fontSize: 11, color: INK_LIGHT }}>{fmt(d.sessions)} sessions</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{ paddingTop: 4 }}>
            <a href="https://analytics.google.com" target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontSize: 12, fontWeight: 600, color: INK_LIGHT, textDecoration: 'none' }}>
              Open Google Analytics <ExternalLink size={11} />
            </a>
          </div>
        </>
      )}
    </div>
  )
}
