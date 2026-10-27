'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/ui/PageHeader'
import { DetailDrawer } from '@/components/ui/DetailDrawer'
import { StatusRail } from '@/components/ui/StatusRail'
import { KlaviyoDrawer } from '@/components/marketing/KlaviyoDrawer'
import { GADrawer } from '@/components/marketing/GADrawer'
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameDay,
  isSameMonth,
  parseISO,
  addDays,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, Trash2, Edit2, Check, X, RefreshCw, ExternalLink, Mail, MessageSquare, Paperclip, ImageIcon, FileText, Download, Sparkles, ThumbsUp, ThumbsDown } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface MarketingGoal {
  id: number
  title: string
  description?: string
  category: string
  target_value?: number
  current_value: number
  unit: string
  due_date?: string
  status: string
  created_at: string
}

interface MarketingEvent {
  id: number
  title: string
  date: string
  platform: string
  type: string
  status: string
  notes?: string
  pillar?: string
  created_at: string
}

interface EventAttachment {
  id: number
  event_id: number
  filename: string
  original_name: string
  mime_type: string | null
  size: number | null
  created_at: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS = ['Overview', 'Content', 'Strategy', 'Brand'] as const
type Tab = typeof TABS[number]

const STRATEGY_SECTIONS = [
  { key: 'brand_voice', label: 'Brand Voice & Tone' },
  { key: 'target_audience', label: 'Target Audience' },
  { key: 'brand_positioning', label: 'Brand Positioning' },
  { key: 'channel_strategy', label: 'Channel Strategy' },
  { key: 'key_messaging', label: 'Key Messaging' },
]

const CATEGORY_COLORS: Record<string, string> = {
  revenue:    'bg-thyme-light text-thyme border-thyme/30',
  growth:     'bg-sage-light text-sage border-sage/30',
  engagement: 'bg-candy-light text-candy border-candy/30',
  awareness:  'bg-blueberry-light text-blueberry border-blueberry/30',
  retention:  'bg-terracotta-light text-terracotta border-terracotta/30',
}

const PLATFORM_COLORS: Record<string, string> = {
  instagram:   'bg-transparent border border-candy/60 text-candy',
  tiktok:      'bg-ink-dark text-cream',
  facebook:    'bg-blueberry text-white',
  email:       'bg-sage text-white',
  meta_ads:    'bg-blueberry text-white',
  google_ads:  'bg-tomato text-white',
  blog:        'bg-citrus text-ink-dark',
  wholesale:   'bg-terracotta text-white',
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook',
  email: 'Email', meta_ads: 'Meta Ads', google_ads: 'Google Ads',
  blog: 'Blog', wholesale: 'Wholesale',
}

const EVENT_STATUS_COLORS: Record<string, string> = {
  planned:   'bg-oatmilk text-ink border-mushroom/60',
  scheduled: 'bg-butter-light text-ink-dark border-butter/40',
  published: 'bg-thyme-light text-thyme border-thyme/30',
  cancelled: 'bg-mushroom/20 text-ink/50 border-mushroom/40 line-through',
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

interface ShopifyStatus {
  connected: boolean
  store_url?: string
  last_synced_at?: string | null
}

interface ShopifyOrderRow {
  id: number
  shopify_id: string
  order_number: number
  email: string | null
  total_price: number
  financial_status: string
  fulfillment_status: string | null
  created_at: string
}

const OTHER_INTEGRATION_CARDS = [
  {
    name: 'Google Analytics',
    logo: '/logos/googleanalytics.svg',
    bead: 'bg-citrus',
    description: 'Sessions, conversion rate, traffic sources, and top pages.',
  },
]

// ─── Instagram types ──────────────────────────────────────────────────────────

interface IgProfile {
  username?: string; name?: string; biography?: string
  followers_count?: number; follows_count?: number; media_count?: number
  profile_picture_url?: string
}

interface IgMediaItem {
  id: string; media_type: string; media_url?: string; thumbnail_url?: string
  caption?: string; timestamp: string; like_count?: number; comments_count?: number
  permalink?: string
  insights?: { reach?: number; impressions?: number; saved?: number; plays?: number }
}

interface IgStory {
  id: string; media_url?: string; timestamp: string
  insights?: { reach?: number; impressions?: number; replies?: number }
}

interface IgDemographics {
  genderAge: { gender: string; age: string; value: number }[]
  topCities: { name: string; value: number }[]
  topCountries: { name: string; value: number }[]
  bestHours: { hour: number; count: number }[]
}

interface IgAnalytics {
  profile: IgProfile
  accountInsights: { reach30d: number; impressions30d: number; profileViews30d: number; websiteClicks30d: number }
  demographics: IgDemographics
  media: IgMediaItem[]
  stories: IgStory[]
}

interface IgPostDetail {
  media: IgMediaItem & { isReel: boolean; isCarousel: boolean }
  insightsAvailable: boolean
  metrics: Record<string, number>
  followBreakdown: { type: string; value: number }[]
  ageGenderBreakdown: { label: string; value: number }[]
  cityBreakdown: { name: string; value: number }[]
  countryBreakdown: { name: string; value: number }[]
}

interface IgStoryDetail {
  media: { id: string; media_type: string; media_url?: string; timestamp: string }
  insightsAvailable: boolean
  metrics: Record<string, number>  // views, reach, replies, likes, total_interactions, navigation, profile_visits, follows
  followBreakdown: { type: string; value: number }[]
  navBreakdown: { action: string; value: number }[]
}

function fmtNum(n: number | undefined): string {
  if (n === undefined || n === null) return '—'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function fmtCurrency(n: number | undefined): string {
  if (n === undefined || n === null) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtPct(n: number | undefined): string {
  if (n === undefined || n === null) return '—'
  return `${n.toFixed(2)}%`
}

// ─── Meta Ads types ───────────────────────────────────────────────────────────

interface MetaAdsSummary {
  spend: number; reach: number; impressions: number; clicks: number
  ctr: number; cpm: number; cpc: number; frequency: number
  purchases: number; purchase_value: number; roas: number
  add_to_carts: number; checkouts: number; cost_per_purchase: number
}

interface MetaAdsCampaign {
  id: string; name: string; status: string; objective?: string
  daily_budget: number | null; lifetime_budget: number | null
  start_time: string | null; stop_time: string | null
  spend: number; reach: number; impressions: number; clicks: number
  ctr: number; frequency: number; purchases: number; purchase_value: number
  add_to_carts: number; checkouts: number; roas: number; cost_per_purchase: number
}

interface MetaAdsAd {
  ad_id: string; ad_name: string; campaign_name: string; thumbnail_url?: string
  spend: number; reach: number; impressions: number; clicks: number
  ctr: number; frequency: number; purchases: number; purchase_value: number
  add_to_carts: number; checkouts: number; roas: number; cost_per_purchase: number
}

interface MetaAdsAnalytics {
  summary: MetaAdsSummary
  campaigns: MetaAdsCampaign[]
  ads: MetaAdsAd[]
  trend: Array<{ date: string; spend: number; reach: number; impressions: number }>
  account_name: string | null
  days: number
}

// ─── Google Analytics ─────────────────────────────────────────────────────────

interface GASummary {
  sessions: number; newUsers: number; totalUsers: number; pageViews: number
  bounceRate: number; avgSessionDuration: number; avgSessionDurationFmt: string
  conversions: number; revenue: number
}
interface GASource { channel: string; sessions: number; newUsers: number; pct: number }
interface GAPage { path: string; title: string; views: number; avgDurationFmt: string }
interface GADevice { category: string; sessions: number; pct: number }
interface GAData {
  summary: GASummary
  sources: GASource[]
  pages: GAPage[]
  trend: Array<{ date: string; sessions: number; newUsers: number }>
  devices: GADevice[]
  property_name: string | null
  days: number
}

function GoogleAnalyticsCard() {
  const FONT_S = { fontFamily: "'Jost', system-ui, sans-serif" }
  const [status, setStatus] = useState<{ connected: boolean; property_name?: string | null } | null>(null)
  const [data, setData] = useState<GAData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [days, setDays] = useState(30)

  // Connect form state — OAuth2 flow
  const [propertyId, setPropertyId] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  function loadData(d = days) {
    setLoading(true); setError(null)
    fetch(`/api/google-analytics/data?days=${d}`)
      .then(r => r.json())
      .then((d: GAData & { error?: string }) => {
        if (d.error) { setError(d.error); setData(null) }
        else setData(d)
      })
      .catch(() => setError('Failed to load analytics'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    // Check for OAuth callback result in URL params
    const params = new URLSearchParams(window.location.search)
    if (params.get('ga_connected') === '1') {
      window.history.replaceState({}, '', '/marketing')
    }
    if (params.get('ga_error')) {
      setError(`Google auth error: ${params.get('ga_error')}`)
      window.history.replaceState({}, '', '/marketing')
    }

    fetch('/api/google-analytics/status')
      .then(r => r.json())
      .then((s: { connected: boolean; property_name?: string }) => {
        setStatus(s)
        if (s.connected) loadData()
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (status?.connected) loadData(days)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

  // Auto-parse JSON credentials pasted into the form
  function handleJsonPaste(raw: string) {
    try {
      const parsed = JSON.parse(raw) as { web?: { client_id?: string; client_secret?: string }; installed?: { client_id?: string; client_secret?: string }; client_id?: string; client_secret?: string }
      const creds = parsed.web ?? parsed.installed ?? parsed
      if (creds.client_id) setClientId(creds.client_id)
      if (creds.client_secret) setClientSecret(creds.client_secret)
    } catch { /* not JSON, ignore */ }
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setSaveError(null)
    const res = await fetch('/api/google-analytics/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
        property_id: propertyId.trim(),
        measurement_id: 'G-6X8DB23243',
      }),
    })
    const d = await res.json() as { auth_url?: string; error?: string }
    setSaving(false)
    if (!res.ok || d.error) { setSaveError(d.error ?? 'Failed to initiate connection'); return }
    // Redirect to Google's OAuth consent screen
    if (d.auth_url) window.location.href = d.auth_url
  }

  async function disconnect() {
    await fetch('/api/google-analytics/connect', { method: 'DELETE' })
    setStatus({ connected: false }); setData(null)
  }

  const CHANNEL_COLORS: Record<string, string> = {
    'Organic Search': 'bg-thyme/10 text-thyme border-thyme/30',
    'Direct': 'bg-blueberry/10 text-blueberry border-blueberry/30',
    'Paid Social': 'bg-candy/10 text-candy border-candy/30',
    'Organic Social': 'bg-candy/5 text-candy/70 border-candy/20',
    'Email': 'bg-butter/30 text-ink border-mushroom/40',
    'Referral': 'bg-sage/10 text-sage border-sage/30',
    'Paid Search': 'bg-terracotta/10 text-terracotta border-terracotta/30',
    'Unassigned': 'bg-oatmilk text-ink/50 border-mushroom/30',
  }
  const fmtN = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n)

  return (
    <div className="rounded-xl border border-mushroom/50 bg-white flex overflow-hidden col-span-2">
      <div className="w-1 shrink-0 bg-[#E37400]" />
      <div className="flex-1 p-5 min-w-0">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/googleanalytics.svg" alt="GA" className="w-5 h-5 object-contain"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <span className="text-base font-semibold text-ink-dark" style={FONT_S}>Google Analytics</span>
            {(data?.property_name ?? status?.property_name) && (
              <span className="text-xs text-ink/40" style={FONT_S}>{data?.property_name ?? status?.property_name}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {status?.connected ? (
              <>
                <select value={days} onChange={e => setDays(Number(e.target.value))}
                  className="text-xs border border-mushroom/50 rounded-lg px-2 py-1 bg-oatmilk/30 text-ink-dark outline-none cursor-pointer"
                  style={FONT_S}>
                  <option value={7}>Last 7 days</option>
                  <option value={14}>Last 14 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={90}>Last 90 days</option>
                </select>
                <button onClick={() => loadData(days)} disabled={loading}
                  className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border border-mushroom/50 text-ink/50 hover:text-ink hover:border-mushroom transition-colors disabled:opacity-40 cursor-pointer"
                  style={FONT_S}>
                  <RefreshCw className={cn('w-2.5 h-2.5', loading && 'animate-spin')} />
                  {loading ? 'Loading…' : 'Refresh'}
                </button>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-thyme/10 text-thyme border border-thyme/30" style={FONT_S}>Connected</span>
                <button onClick={disconnect} className="text-[10px] text-ink/30 hover:text-ink/60 transition-colors cursor-pointer" style={FONT_S}>Disconnect</button>
              </>
            ) : (
              <button onClick={() => setConnecting(v => !v)}
                className="text-xs px-3 py-1.5 rounded-lg bg-ink-dark text-cream hover:bg-ink transition-colors cursor-pointer"
                style={FONT_S}>{connecting ? 'Cancel' : 'Connect'}</button>
            )}
          </div>
        </div>

        {/* Connect form — OAuth2 */}
        {!status?.connected && connecting && (
          <form onSubmit={handleConnect} className="space-y-3 mb-2">
            {/* Step 1: one-time Google Cloud setup */}
            <div className="rounded-lg bg-oatmilk/60 border border-mushroom/40 p-3.5 text-xs text-ink/60 space-y-1.5" style={FONT_S}>
              <p className="font-semibold text-ink/80">One-time setup — add a redirect URI</p>
              <p>In <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-blueberry underline">Google Cloud Console → Credentials</a>, open your OAuth 2.0 Client ID and add this to <strong>Authorized redirect URIs</strong>:</p>
              <code className="block bg-white border border-mushroom/40 rounded px-2 py-1 text-ink/80 select-all">http://localhost:3000/api/google-analytics/callback</code>
              <p className="mt-1">Also make sure <strong>Google Analytics Data API</strong> is enabled for your project.</p>
            </div>

            {/* Paste full JSON OR fill in manually */}
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-ink/50 block mb-1" style={FONT_S}>Paste your client credentials JSON (auto-fills fields below)</label>
              <textarea rows={2} placeholder='{"web":{"client_id":"…","client_secret":"…",…}}'
                onChange={e => handleJsonPaste(e.target.value)}
                className="w-full text-xs border border-mushroom/50 rounded-lg px-3 py-2 bg-white text-ink-dark outline-none focus:border-ink/30 resize-none"
                style={{ fontFamily: 'monospace' }} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-ink/50 block mb-1" style={FONT_S}>Client ID</label>
                <input value={clientId} onChange={e => setClientId(e.target.value)} required
                  placeholder="495905312167-….apps.googleusercontent.com"
                  className="w-full text-xs border border-mushroom/50 rounded-lg px-3 py-2 bg-white text-ink-dark outline-none focus:border-ink/30"
                  style={FONT_S} />
              </div>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-ink/50 block mb-1" style={FONT_S}>Client Secret</label>
                <input value={clientSecret} onChange={e => setClientSecret(e.target.value)} required type="password"
                  placeholder="GOCSPX-…"
                  className="w-full text-xs border border-mushroom/50 rounded-lg px-3 py-2 bg-white text-ink-dark outline-none focus:border-ink/30"
                  style={FONT_S} />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-ink/50 block mb-1" style={FONT_S}>GA4 Property ID <span className="normal-case font-normal">(numeric — Admin → Property Settings, not the G- ID)</span></label>
              <input value={propertyId} onChange={e => setPropertyId(e.target.value)} required
                placeholder="e.g. 123456789"
                className="w-full text-sm border border-mushroom/50 rounded-lg px-3 py-2 bg-white text-ink-dark outline-none focus:border-ink/30"
                style={FONT_S} />
            </div>

            {saveError && <p className="text-xs text-terracotta" style={FONT_S}>{saveError}</p>}
            <button type="submit" disabled={saving || !clientId || !clientSecret || !propertyId}
              className="text-sm px-4 py-2 rounded-lg bg-ink-dark text-cream hover:bg-ink disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-default"
              style={FONT_S}>{saving ? 'Saving…' : 'Authorize with Google →'}</button>
          </form>
        )}

        {/* Error from OAuth callback */}
        {error && !status?.connected && (
          <p className="text-xs text-terracotta mb-3" style={FONT_S}>{error}</p>
        )}

        {!status?.connected && !connecting && !error && (
          <p className="text-sm text-ink-dark leading-relaxed" style={FONT_S}>
            Connect Google Analytics to track sessions, traffic sources, top pages, and user behaviour across your site.
          </p>
        )}

        {status?.connected && loading && (
          <p className="text-sm text-ink/40 py-4" style={FONT_S}>Loading analytics…</p>
        )}
        {status?.connected && error && (
          <p className="text-sm text-terracotta py-2" style={FONT_S}>{error}</p>
        )}

        {status?.connected && data && !loading && (
          <div className="space-y-5">

            {/* Summary KPIs */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Sessions',    value: fmtN(data.summary.sessions) },
                { label: 'New Users',   value: fmtN(data.summary.newUsers) },
                { label: 'Page Views',  value: fmtN(data.summary.pageViews) },
                { label: 'Avg Session', value: data.summary.avgSessionDurationFmt },
              ].map(s => (
                <div key={s.label} className="bg-oatmilk/40 rounded-lg px-3 py-2.5 text-center border border-mushroom/30">
                  <p className="text-lg font-bold text-ink-dark leading-none" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>{s.value}</p>
                  <p className="text-[10px] text-ink/50 mt-0.5 uppercase tracking-wide" style={FONT_S}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* Secondary row */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Bounce Rate', value: `${data.summary.bounceRate.toFixed(1)}%` },
                { label: 'Conversions', value: fmtN(data.summary.conversions) },
                { label: 'Revenue',     value: data.summary.revenue > 0 ? `$${data.summary.revenue.toFixed(2)}` : '—' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-lg px-3 py-2 border border-mushroom/30 flex items-center justify-between">
                  <span className="text-xs text-ink/50" style={FONT_S}>{s.label}</span>
                  <span className="text-sm font-semibold text-ink-dark" style={FONT_S}>{s.value}</span>
                </div>
              ))}
            </div>

            {/* Traffic sources + devices */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/40 mb-2" style={FONT_S}>Traffic Sources</p>
                <div className="space-y-1.5">
                  {data.sources.length === 0 && <p className="text-xs text-ink/40" style={FONT_S}>No data</p>}
                  {data.sources.map(s => (
                    <div key={s.channel} className="flex items-center gap-2">
                      <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap shrink-0', CHANNEL_COLORS[s.channel] ?? 'bg-oatmilk text-ink/50 border-mushroom/30')} style={FONT_S}>
                        {s.channel}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full bg-oatmilk/60 overflow-hidden">
                        <div className="h-full rounded-full bg-ink/20" style={{ width: `${s.pct}%` }} />
                      </div>
                      <span className="text-xs text-ink/60 tabular-nums w-10 text-right shrink-0" style={FONT_S}>{fmtN(s.sessions)}</span>
                      <span className="text-[10px] text-ink/30 tabular-nums w-7 text-right shrink-0" style={FONT_S}>{s.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/40 mb-2" style={FONT_S}>Devices</p>
                <div className="space-y-1.5">
                  {data.devices.length === 0 && <p className="text-xs text-ink/40" style={FONT_S}>No data</p>}
                  {data.devices.map(d => (
                    <div key={d.category} className="flex items-center gap-2">
                      <span className="text-xs text-ink/70 capitalize w-14 shrink-0" style={FONT_S}>{d.category}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-oatmilk/60 overflow-hidden">
                        <div className="h-full rounded-full bg-[#E37400]/40" style={{ width: `${d.pct}%` }} />
                      </div>
                      <span className="text-xs text-ink/60 tabular-nums w-10 text-right shrink-0" style={FONT_S}>{fmtN(d.sessions)}</span>
                      <span className="text-[10px] text-ink/30 tabular-nums w-7 text-right shrink-0" style={FONT_S}>{d.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Top pages */}
            {data.pages.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/40 mb-2" style={FONT_S}>Top Pages</p>
                <div className="rounded-xl border border-mushroom/40 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-oatmilk/40 border-b border-mushroom/30">
                        {['Page', 'Views', 'Avg Time'].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-semibold text-ink/50 uppercase tracking-wider text-[10px]" style={FONT_S}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.pages.map((p, i) => (
                        <tr key={p.path} className={cn('border-b border-mushroom/20 last:border-0', i % 2 === 0 ? 'bg-white' : 'bg-oatmilk/20')}>
                          <td className="px-3 py-2 max-w-[280px]" style={FONT_S}>
                            <p className="text-ink-dark font-medium truncate" title={p.path}>{p.path}</p>
                            {p.title && p.title !== p.path && <p className="text-[10px] text-ink/40 truncate">{p.title}</p>}
                          </td>
                          <td className="px-3 py-2 text-ink/70 tabular-nums whitespace-nowrap" style={FONT_S}>{fmtN(p.views)}</td>
                          <td className="px-3 py-2 text-ink/70 whitespace-nowrap" style={FONT_S}>{p.avgDurationFmt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}

function MetaAdsConnectForm({ onConnected }: { onConnected: () => void }) {
  const [token, setToken]       = useState('')
  const [accountId, setAccountId] = useState('')
  const [appId, setAppId]       = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [result, setResult]     = useState<{ token_exchanged?: boolean; token_expiry?: number | null } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!token.trim() || !accountId.trim()) return
    setSaving(true); setError(null); setResult(null)
    const res = await fetch('/api/meta-ads/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: token.trim(),
        ad_account_id: accountId.trim(),
        ...(appId.trim() ? { app_id: appId.trim(), app_secret: appSecret.trim() } : {}),
      }),
    })
    const data = await res.json() as { ok?: boolean; error?: string; token_exchanged?: boolean; token_expiry?: number | null }
    if (!res.ok || data.error) { setError(data.error ?? 'Connection failed'); setSaving(false); return }
    setResult({ token_exchanged: data.token_exchanged, token_expiry: data.token_expiry })
    setTimeout(onConnected, 1200)
  }

  return (
    <form onSubmit={submit} className="space-y-3 mt-3">
      <p className="text-xs text-ink/50 leading-relaxed" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
        Requires a User Access Token with <code className="bg-oatmilk px-1 rounded text-[10px]">ads_read</code> permission.
        Add your App credentials below to auto-exchange for a <strong>60-day token</strong> — otherwise the token expires in ~2 hours.
      </p>
      <div>
        <label className="block text-xs text-ink/50 mb-1" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Access Token <span className="text-terracotta">*</span></label>
        <input value={token} onChange={e => setToken(e.target.value)} placeholder="EAAxxxxxxxxxxxxxxxx…"
          className="w-full px-3 py-2 text-xs border border-mushroom/60 rounded-lg bg-oatmilk/30 text-ink-dark outline-none focus:ring-2 focus:ring-ink/15 placeholder:text-ink/30 font-mono" />
      </div>
      <div>
        <label className="block text-xs text-ink/50 mb-1" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Ad Account ID <span className="text-terracotta">*</span></label>
        <input value={accountId} onChange={e => setAccountId(e.target.value)} placeholder="act_123456789 or 123456789"
          className="w-full px-3 py-2 text-xs border border-mushroom/60 rounded-lg bg-oatmilk/30 text-ink-dark outline-none focus:ring-2 focus:ring-ink/15 placeholder:text-ink/30 font-mono" />
        <p className="text-[10px] text-ink/30 mt-1" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Found in Meta Business Suite → Settings → Ad Accounts</p>
      </div>
      {/* App credentials for long-lived token */}
      <div className="border border-mushroom/40 rounded-lg p-3 space-y-2 bg-oatmilk/20">
        <p className="text-[10px] font-semibold text-ink/40 uppercase tracking-widest" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>App Credentials (recommended — for 60-day tokens)</p>
        <div>
          <label className="block text-xs text-ink/50 mb-1" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>App ID</label>
          <input value={appId} onChange={e => setAppId(e.target.value)} placeholder="From Meta for Developers → Your App → Settings"
            className="w-full px-3 py-2 text-xs border border-mushroom/60 rounded-lg bg-white text-ink-dark outline-none focus:ring-2 focus:ring-ink/15 placeholder:text-ink/30 font-mono" />
        </div>
        <div>
          <label className="block text-xs text-ink/50 mb-1" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>App Secret</label>
          <input value={appSecret} onChange={e => setAppSecret(e.target.value)} type="password" placeholder="••••••••••••••••"
            className="w-full px-3 py-2 text-xs border border-mushroom/60 rounded-lg bg-white text-ink-dark outline-none focus:ring-2 focus:ring-ink/15 placeholder:text-ink/30 font-mono" />
        </div>
      </div>
      {error && <p className="text-xs text-terracotta" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{error}</p>}
      {result?.token_exchanged && (
        <p className="text-xs text-sage font-medium" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
          ✓ Exchanged for a long-lived token{result.token_expiry ? ` — expires ${new Date(result.token_expiry).toLocaleDateString()}` : ''}
        </p>
      )}
      <button type="submit" disabled={saving || !token.trim() || !accountId.trim()}
        className="text-xs px-3 py-1.5 rounded-lg bg-ink-dark text-cream hover:bg-ink transition-colors cursor-pointer disabled:opacity-40"
        style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
        {saving ? 'Connecting…' : 'Connect'}
      </button>
    </form>
  )
}

// ─── Shopify Campaigns Card ───────────────────────────────────────────────────

interface ShopifyCampaignActivity {
  id: string; title: string; status: string; channel: string; currency: string
  budget_total: number | null; budget_remaining: number | null
  start: string | null; end: string | null
  clicks: number; impressions: number; spent: number
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null
}

function ShopifyCampaignsCard({ campaigns, scopeError, syncing, onSync }: {
  campaigns: ShopifyCampaignActivity[] | null
  scopeError: boolean
  syncing: boolean
  onSync: () => void
}) {
  const FONT_S = { fontFamily: "'Jost', system-ui, sans-serif" }
  const STATUS_COLORS: Record<string, string> = {
    ACTIVE:    'bg-thyme/10 text-thyme border-thyme/30',
    PAUSED:    'bg-butter/40 text-ink border-mushroom/40',
    COMPLETED: 'bg-oatmilk text-ink/50 border-mushroom/30',
    INACTIVE:  'bg-oatmilk text-ink/50 border-mushroom/30',
  }

  const totalSpend       = (campaigns ?? []).reduce((s, c) => s + c.spent, 0)
  const totalClicks      = (campaigns ?? []).reduce((s, c) => s + c.clicks, 0)
  const totalImpressions = (campaigns ?? []).reduce((s, c) => s + c.impressions, 0)

  return (
    <div className="rounded-xl border border-mushroom/50 bg-white flex overflow-hidden">
      <div className="w-1 shrink-0" style={{ background: '#96BF48' }} />
      <div className="flex-1 p-5 min-w-0">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: '#96BF48' }}>
              <span className="text-[10px] font-bold text-white">S</span>
            </div>
            <span className="text-base font-semibold text-ink-dark" style={FONT_S}>Shopify Campaigns</span>
            <span className="text-xs text-ink/40" style={FONT_S}>Campaign Autopilot</span>
          </div>
          <button
            onClick={onSync}
            disabled={syncing}
            className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border border-mushroom/50 text-ink/50 hover:text-ink hover:border-mushroom transition-colors disabled:opacity-40 cursor-pointer"
            style={FONT_S}
          >
            <RefreshCw className={cn('w-2.5 h-2.5', syncing && 'animate-spin')} />
            {syncing ? 'Syncing…' : 'Sync'}
          </button>
        </div>

        {/* Scope error */}
        {scopeError && (
          <div className="rounded-lg border border-butter/60 bg-butter/20 p-4 space-y-1">
            <p className="text-sm font-semibold text-ink-dark" style={FONT_S}>Reconnect Shopify to enable this</p>
            <p className="text-xs text-ink/60 leading-relaxed" style={FONT_S}>
              Campaign Autopilot data requires the <code className="bg-oatmilk px-1 rounded text-[10px]">read_marketing_events</code> scope.
              Go to <strong>Settings → Shopify</strong> and reconnect your store — your existing data won't be affected.
            </p>
          </div>
        )}

        {/* Loading */}
        {!scopeError && !campaigns && syncing && (
          <p className="text-sm text-ink/40 py-4" style={FONT_S}>Loading campaigns…</p>
        )}

        {/* Empty */}
        {!scopeError && campaigns && campaigns.length === 0 && (
          <p className="text-sm text-ink/40 py-4" style={FONT_S}>No Campaign Autopilot campaigns found.</p>
        )}

        {/* Data */}
        {!scopeError && campaigns && campaigns.length > 0 && (
          <div className="space-y-5">

            {/* Summary row */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Total Spend',   value: fmtCurrency(totalSpend) },
                { label: 'Clicks',        value: fmtNum(totalClicks) },
                { label: 'Impressions',   value: fmtNum(totalImpressions) },
                { label: 'Campaigns',     value: String(campaigns.length) },
              ].map(s => (
                <div key={s.label} className="bg-oatmilk/40 rounded-lg px-3 py-2.5 text-center border border-mushroom/30">
                  <p className="text-lg font-bold text-ink-dark leading-none" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>{s.value}</p>
                  <p className="text-[10px] text-ink/50 mt-0.5 uppercase tracking-wide" style={FONT_S}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* Campaigns table */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/40 mb-2" style={FONT_S}>Campaigns</p>
              <div className="rounded-xl border border-mushroom/40 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-oatmilk/40 border-b border-mushroom/30">
                      {['Campaign', 'Channel', 'Status', 'Budget', 'Spent', 'Clicks', 'Impressions', 'Dates'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-ink/50 uppercase tracking-wider text-[10px] whitespace-nowrap" style={FONT_S}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c, i) => {
                      const startStr = c.start ? new Date(c.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null
                      const endStr   = c.end   ? new Date(c.end).toLocaleDateString('en-US',   { month: 'short', day: 'numeric' }) : null
                      const dateStr  = startStr ? (endStr ? `${startStr} – ${endStr}` : `${startStr}+`) : '—'
                      return (
                        <tr key={c.id} className={cn('border-b border-mushroom/20 last:border-0', i % 2 === 0 ? 'bg-white' : 'bg-oatmilk/20')}>
                          <td className="px-3 py-2.5 text-ink-dark font-medium max-w-[160px] truncate whitespace-nowrap" style={FONT_S} title={c.title}>{c.title}</td>
                          <td className="px-3 py-2.5 text-ink/60 whitespace-nowrap capitalize" style={FONT_S}>{c.channel.toLowerCase().replace(/_/g, ' ')}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className={cn('text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full border', STATUS_COLORS[c.status] ?? 'bg-oatmilk text-ink border-mushroom/40')} style={FONT_S}>
                              {c.status.toLowerCase()}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-ink/70 whitespace-nowrap" style={FONT_S}>
                            {c.budget_total != null ? fmtCurrency(c.budget_total) : '—'}
                            {c.budget_remaining != null && c.budget_total != null && (
                              <span className="text-[10px] text-ink/30 ml-1">({fmtCurrency(c.budget_remaining)} left)</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-ink-dark font-medium whitespace-nowrap" style={FONT_S}>{fmtCurrency(c.spent)}</td>
                          <td className="px-3 py-2.5 text-ink/70 whitespace-nowrap" style={FONT_S}>{fmtNum(c.clicks)}</td>
                          <td className="px-3 py-2.5 text-ink/70 whitespace-nowrap" style={FONT_S}>{fmtNum(c.impressions)}</td>
                          <td className="px-3 py-2.5 text-ink/40 whitespace-nowrap text-[10px]" style={FONT_S}>{dateStr}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  )
}

function MetaAdsCard() {
  const [status, setStatus] = useState<{ connected: boolean; account_name?: string } | null>(null)
  const [analytics, setAnalytics] = useState<MetaAdsAnalytics | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tokenExpired, setTokenExpired] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [days, setDays] = useState(30)
  const [insights, setInsights] = useState<string | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/meta-ads/status').then(r => r.json()).then(setStatus)
  }, [])

  function loadAnalytics() {
    setLoading(true); setError(null); setTokenExpired(false)
    setInsights(null); setInsightsError(null)
    fetch(`/api/meta-ads/analytics?days=${days}`)
      .then(r => r.json())
      .then((d: MetaAdsAnalytics & { error?: string; token_expired?: boolean; message?: string }) => {
        if (d.token_expired) { setTokenExpired(true); setError(d.message ?? 'Token expired'); setLoading(false); return }
        if (d.error) { setError(d.error); setLoading(false); return }
        setAnalytics(d); setLoading(false)
      })
      .catch(() => { setError('Failed to load analytics'); setLoading(false) })
  }

  function loadInsights(data: MetaAdsAnalytics) {
    setInsightsLoading(true); setInsightsError(null)
    fetch('/api/meta-ads/insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days, summary: data.summary, campaigns: data.campaigns, ads: data.ads ?? [] }),
    })
      .then(r => r.json())
      .then((d: { insights?: string; error?: string }) => {
        if (d.error) { setInsightsError(d.error); setInsightsLoading(false); return }
        setInsights(d.insights ?? null); setInsightsLoading(false)
      })
      .catch(() => { setInsightsError('Failed to load insights'); setInsightsLoading(false) })
  }

  useEffect(() => {
    if (!status?.connected) return
    loadAnalytics()
  }, [status, days]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSync() {
    setSyncing(true)
    try {
      // Also persist fresh data into the DB cache so the command center stays up to date
      await fetch('/api/meta-ads/sync', { method: 'POST' }).catch(() => {/* non-fatal */})
      loadAnalytics()
    } finally { setSyncing(false) }
  }

  async function disconnect() {
    await fetch('/api/meta-ads/status', { method: 'DELETE' })
    setStatus({ connected: false }); setAnalytics(null)
  }

  const CAMPAIGN_STATUS_COLORS: Record<string, string> = {
    ACTIVE:          'bg-thyme/10 text-thyme border-thyme/30',
    PAUSED:          'bg-butter/40 text-ink border-mushroom/40',
    COMPLETED:       'bg-oatmilk text-ink/50 border-mushroom/30',
    ARCHIVED:        'bg-oatmilk text-ink/40 border-mushroom/20',
    WITH_ISSUES:     'bg-terracotta/10 text-terracotta border-terracotta/30',
    IN_PROCESS:      'bg-blueberry/10 text-blueberry border-blueberry/30',
    PENDING_REVIEW:  'bg-butter/60 text-ink/70 border-mushroom/40',
    CAMPAIGN_PAUSED: 'bg-butter/40 text-ink border-mushroom/40',
  }

  return (
    <div className="rounded-xl border border-mushroom/50 bg-white flex overflow-hidden col-span-2">
      <div className="w-1 shrink-0 bg-blueberry" />
      <div className="flex-1 p-5 min-w-0">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/meta.svg" alt="Meta" className="w-5 h-5 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <span className="text-base font-semibold text-ink-dark" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Meta Ads</span>
            {analytics?.account_name && (
              <span className="text-xs text-ink/40" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{analytics.account_name}</span>
            )}
            <a
              href="https://adsmanager.facebook.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-ink/40 hover:text-blueberry transition-colors"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            >
              <ExternalLink className="w-3 h-3" />
              Ads Manager
            </a>
          </div>
          <div className="flex items-center gap-2">
            {status?.connected ? (
              <>
                {/* Date range selector */}
                <select
                  value={days}
                  onChange={e => setDays(Number(e.target.value))}
                  className="text-xs border border-mushroom/50 rounded-lg px-2 py-1 bg-oatmilk/30 text-ink-dark outline-none cursor-pointer"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                >
                  <option value={7}>Last 7 days</option>
                  <option value={14}>Last 14 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={90}>Last 90 days</option>
                </select>
                <button
                  onClick={handleSync}
                  disabled={syncing || loading}
                  className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border border-mushroom/50 text-ink/50 hover:text-ink hover:border-mushroom transition-colors disabled:opacity-40 cursor-pointer"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                >
                  <RefreshCw className={cn('w-2.5 h-2.5', (syncing || loading) && 'animate-spin')} />
                  {syncing || loading ? 'Syncing…' : 'Sync'}
                </button>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-thyme/10 text-thyme border border-thyme/30" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                  Connected
                </span>
                <button onClick={disconnect} className="text-[10px] text-ink/30 hover:text-ink/60 transition-colors cursor-pointer" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={() => setConnecting(v => !v)}
                className="text-xs px-3 py-1.5 rounded-lg bg-ink-dark text-cream hover:bg-ink transition-colors cursor-pointer"
                style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
              >
                {connecting ? 'Cancel' : 'Connect'}
              </button>
            )}
          </div>
        </div>

        {!status?.connected && connecting && (
          <MetaAdsConnectForm onConnected={() => { setConnecting(false); setStatus({ connected: true }) }} />
        )}

        {!status?.connected && !connecting && (
          <p className="text-sm text-ink-dark leading-relaxed" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
            Connect your Meta Ads account to track ad spend, ROAS, reach, impressions, and campaign performance.
          </p>
        )}

        {status?.connected && loading && (
          <p className="text-sm text-ink/40 py-4" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Loading analytics…</p>
        )}
        {status?.connected && error && (
          tokenExpired ? (
            <div className="rounded-lg border border-terracotta/30 bg-terracotta/5 p-3 mt-2 space-y-2">
              <p className="text-xs font-semibold text-terracotta" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>⚠ Access token expired</p>
              <p className="text-xs text-ink/60 leading-relaxed" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{error}</p>
              <button
                onClick={() => setConnecting(true)}
                className="text-xs px-3 py-1.5 rounded-lg bg-terracotta text-white hover:bg-terracotta/90 cursor-pointer"
                style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
              >Reconnect Meta Ads</button>
            </div>
          ) : (
            <p className="text-sm text-terracotta py-2" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{error}</p>
          )
        )}

        {status?.connected && analytics && !loading && (
          <div className="space-y-5">

            {/* Summary stats */}
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: 'Spend',       value: fmtCurrency(analytics.summary.spend) },
                { label: 'ROAS',        value: analytics.summary.roas > 0 ? `${analytics.summary.roas.toFixed(2)}×` : '—' },
                { label: 'Reach',       value: fmtNum(analytics.summary.reach) },
                { label: 'Clicks',      value: fmtNum(analytics.summary.clicks) },
                { label: 'Purchases',   value: fmtNum(analytics.summary.purchases) },
              ].map(s => (
                <div key={s.label} className="bg-oatmilk/40 rounded-lg px-3 py-2.5 text-center border border-mushroom/30">
                  <p className="text-lg font-bold text-ink-dark leading-none" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>{s.value}</p>
                  <p className="text-[10px] text-ink/50 mt-0.5 uppercase tracking-wide" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* Secondary stats */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'CTR',               value: fmtPct(analytics.summary.ctr) },
                { label: 'CPM',               value: fmtCurrency(analytics.summary.cpm) },
                { label: 'CPC',               value: fmtCurrency(analytics.summary.cpc) },
                { label: 'Frequency',         value: analytics.summary.frequency > 0 ? analytics.summary.frequency.toFixed(2) : '—' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-lg px-3 py-2 border border-mushroom/30 flex items-center justify-between">
                  <span className="text-xs text-ink/50" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{s.label}</span>
                  <span className="text-sm font-semibold text-ink-dark" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{s.value}</span>
                </div>
              ))}
            </div>

            {/* Conversion funnel */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/40 mb-2" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Conversion Funnel</p>
              <div className="flex items-stretch gap-0 rounded-xl border border-mushroom/40 overflow-hidden">
                {[
                  { label: 'Clicks',      value: fmtNum(analytics.summary.clicks),                    sub: 'link clicks' },
                  { label: 'Add to Cart', value: fmtNum(analytics.summary.add_to_carts),              sub: 'added item' },
                  { label: 'Checkout',    value: fmtNum(analytics.summary.checkouts),                 sub: 'started checkout' },
                  { label: 'Purchases',   value: fmtNum(analytics.summary.purchases),                 sub: 'converted' },
                  { label: 'Cost / Sale', value: analytics.summary.cost_per_purchase > 0 ? fmtCurrency(analytics.summary.cost_per_purchase) : '—', sub: 'per purchase' },
                  { label: 'Revenue',     value: fmtCurrency(analytics.summary.purchase_value),       sub: 'from ads' },
                ].map((s, idx, arr) => (
                  <div key={s.label} className={cn('flex-1 px-3 py-2.5 text-center', idx < arr.length - 1 ? 'border-r border-mushroom/30' : '')}>
                    <p className="text-sm font-bold text-ink-dark leading-none" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>{s.value}</p>
                    <p className="text-[10px] font-semibold text-ink/50 mt-0.5 uppercase tracking-wide" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{s.label}</p>
                    <p className="text-[9px] text-ink/30 mt-0.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{s.sub}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Campaigns table */}
            {analytics.campaigns.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/40 mb-2" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                  Campaigns
                </p>
                <div className="rounded-xl border border-mushroom/40 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-oatmilk/40 border-b border-mushroom/30">
                        {['Campaign', 'Status', 'Spend', 'ROAS', 'Reach', 'Freq', 'Clicks', 'CTR', 'Cart', 'Checkout', 'Purchases', 'Cost/Sale'].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-semibold text-ink/50 uppercase tracking-wider text-[10px] whitespace-nowrap" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.campaigns.map((c, i) => (
                        <tr key={c.id} className={cn('border-b border-mushroom/20 last:border-0', i % 2 === 0 ? 'bg-white' : 'bg-oatmilk/20')}>
                          <td className="px-3 py-2.5 text-ink-dark font-medium max-w-[160px] truncate whitespace-nowrap" style={{ fontFamily: "'Jost', system-ui, sans-serif" }} title={c.name}>{c.name}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className={cn('text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full border', CAMPAIGN_STATUS_COLORS[c.status] ?? 'bg-oatmilk text-ink border-mushroom/40')} style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                              {c.status.toLowerCase()}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-ink-dark whitespace-nowrap" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{fmtCurrency(c.spend)}</td>
                          <td className="px-3 py-2.5 text-ink-dark font-medium whitespace-nowrap" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{c.roas > 0 ? `${c.roas.toFixed(2)}×` : '—'}</td>
                          <td className="px-3 py-2.5 text-ink/70 whitespace-nowrap" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{fmtNum(c.reach)}</td>
                          <td className="px-3 py-2.5 text-ink/70 whitespace-nowrap" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{c.frequency > 0 ? c.frequency.toFixed(2) : '—'}</td>
                          <td className="px-3 py-2.5 text-ink/70 whitespace-nowrap" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{fmtNum(c.clicks)}</td>
                          <td className="px-3 py-2.5 text-ink/70 whitespace-nowrap" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{fmtPct(c.ctr)}</td>
                          <td className="px-3 py-2.5 text-ink/70 whitespace-nowrap" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{fmtNum(c.add_to_carts)}</td>
                          <td className="px-3 py-2.5 text-ink/70 whitespace-nowrap" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{fmtNum(c.checkouts)}</td>
                          <td className="px-3 py-2.5 text-ink/70 whitespace-nowrap" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{fmtNum(c.purchases)}</td>
                          <td className="px-3 py-2.5 text-ink/70 whitespace-nowrap" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{c.cost_per_purchase > 0 ? fmtCurrency(c.cost_per_purchase) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Ads table */}
            {analytics.ads && analytics.ads.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/40 mb-2" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                  Individual Ads
                </p>
                <div className="rounded-xl border border-mushroom/40 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-oatmilk/40 border-b border-mushroom/30">
                        {['Ad', 'Spend', 'ROAS', 'Reach', 'Freq', 'Clicks', 'CTR', 'Cart', 'Checkout', 'Purchases', 'Cost/Sale'].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-semibold text-ink/50 uppercase tracking-wider text-[10px] whitespace-nowrap" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.ads.map((a, i) => (
                        <tr key={a.ad_id} className={cn('border-b border-mushroom/20 last:border-0', i % 2 === 0 ? 'bg-white' : 'bg-oatmilk/20')}>
                          <td className="px-3 py-2.5 whitespace-nowrap" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                            <div className="flex items-center gap-2.5">
                              {a.thumbnail_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={a.thumbnail_url}
                                  alt={a.ad_name}
                                  className="shrink-0 rounded-md border border-mushroom/40 object-cover"
                                  style={{ width: 44, height: 44 }}
                                />
                              ) : (
                                <div className="shrink-0 w-11 h-11 rounded-md border border-mushroom/30 bg-oatmilk/60 flex items-center justify-center">
                                  <span className="text-[10px] text-ink/30" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Ad</span>
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="text-ink-dark font-medium truncate max-w-[140px]" title={a.ad_name}>{a.ad_name}</p>
                                {a.campaign_name && <p className="text-[10px] text-ink/40 truncate max-w-[140px]" title={a.campaign_name}>{a.campaign_name}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-ink-dark whitespace-nowrap" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{fmtCurrency(a.spend)}</td>
                          <td className="px-3 py-2.5 text-ink-dark font-medium whitespace-nowrap" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{a.roas > 0 ? `${a.roas.toFixed(2)}×` : '—'}</td>
                          <td className="px-3 py-2.5 text-ink/70 whitespace-nowrap" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{fmtNum(a.reach)}</td>
                          <td className="px-3 py-2.5 text-ink/70 whitespace-nowrap" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{a.frequency > 0 ? a.frequency.toFixed(2) : '—'}</td>
                          <td className="px-3 py-2.5 text-ink/70 whitespace-nowrap" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{fmtNum(a.clicks)}</td>
                          <td className="px-3 py-2.5 text-ink/70 whitespace-nowrap" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{fmtPct(a.ctr)}</td>
                          <td className="px-3 py-2.5 text-ink/70 whitespace-nowrap" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{fmtNum(a.add_to_carts)}</td>
                          <td className="px-3 py-2.5 text-ink/70 whitespace-nowrap" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{fmtNum(a.checkouts)}</td>
                          <td className="px-3 py-2.5 text-ink/70 whitespace-nowrap" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{fmtNum(a.purchases)}</td>
                          <td className="px-3 py-2.5 text-ink/70 whitespace-nowrap" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{a.cost_per_purchase > 0 ? fmtCurrency(a.cost_per_purchase) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* AI Insights */}
            <div className="rounded-xl border border-blueberry/20 bg-blueberry/5 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-blueberry/15">
                <div className="flex items-center gap-2">
                  <span className="text-sm">✦</span>
                  <span className="text-xs font-semibold text-blueberry" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>AI Insights</span>
                </div>
                <button
                  onClick={() => loadInsights(analytics)}
                  disabled={insightsLoading}
                  className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-blueberry text-white hover:bg-blueberry/85 transition-colors disabled:opacity-50 cursor-pointer"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                >
                  {insightsLoading ? (
                    <><RefreshCw className="w-2.5 h-2.5 animate-spin" /> Analysing…</>
                  ) : insights ? (
                    <><RefreshCw className="w-2.5 h-2.5" /> Refresh</>
                  ) : (
                    <>Get Insights</>
                  )}
                </button>
              </div>
              <div className="px-4 py-3">
                {!insights && !insightsLoading && !insightsError && (
                  <p className="text-xs text-ink/40 italic" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                    Click Get Insights for an AI breakdown of what these numbers mean and what to do next.
                  </p>
                )}
                {insightsError && (
                  <p className="text-xs text-terracotta" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{insightsError}</p>
                )}
                {insightsLoading && (
                  <div className="space-y-2 py-1">
                    {[80, 95, 70, 88, 60].map(w => (
                      <div key={w} className="h-3 rounded-full bg-blueberry/10 animate-pulse" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                )}
                {insights && !insightsLoading && (
                  <div className="text-xs text-ink-dark leading-relaxed space-y-1.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                    {insights.split('\n').map((line, i) => {
                      if (line.startsWith('## ')) {
                        return <p key={i} className="text-[11px] font-semibold uppercase tracking-widest text-blueberry pt-2 pb-0.5 first:pt-0">{line.replace('## ', '')}</p>
                      }
                      if (line.startsWith('- ')) {
                        const parts = line.slice(2).split(/\*\*(.+?)\*\*/)
                        return (
                          <div key={i} className="flex gap-2">
                            <span className="text-blueberry/50 shrink-0">·</span>
                            <span>{parts.map((p, j) => j % 2 === 1 ? <strong key={j} className="font-semibold text-ink-dark">{p}</strong> : p)}</span>
                          </div>
                        )
                      }
                      if (line.trim() === '' || line.startsWith('#')) return null
                      return <p key={i}>{line}</p>
                    })}
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}

function IgPostSidebar({ mediaId, onClose, followerCount }: { mediaId: string; onClose: () => void; followerCount?: number }) {
  const [detail, setDetail] = useState<IgPostDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setDetail(null); setLoading(true)
    fetch(`/api/instagram/post?id=${mediaId}`)
      .then(r => r.json())
      .then((d: IgPostDetail & { error?: string }) => { if (!d.error) setDetail(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [mediaId])

  const m = detail?.media
  const metrics = detail?.metrics ?? {}
  const thumb = m?.thumbnail_url ?? m?.media_url
  const typeLabel = m?.isReel ? 'Reel' : m?.isCarousel ? 'Carousel' : 'Post'
  const engRate = followerCount && (metrics.total_interactions ?? 0) > 0
    ? ((metrics.total_interactions! / followerCount) * 100).toFixed(2) + '%'
    : null

  const insightsAvailable = detail?.insightsAvailable ?? false

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/10 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white shadow-2xl flex flex-col bottom-sheet-wrap md:top-0 md:left-auto md:w-[420px]">

        {/* Header */}
        <div className="px-6 py-5 border-b border-mushroom/40 flex items-center justify-between shrink-0">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/40 mb-0.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
              {loading ? 'Loading…' : typeLabel}
            </p>
            {m && (
              <p className="text-xs text-ink/50" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                {format(new Date(m.timestamp), 'MMMM d, yyyy')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {m?.permalink && (
              <a href={m.permalink} target="_blank" rel="noopener noreferrer"
                className="p-1.5 rounded-lg text-ink/40 hover:text-ink hover:bg-oatmilk transition-colors cursor-pointer">
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-ink/40 hover:text-ink hover:bg-oatmilk transition-colors cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="p-6 text-sm text-ink/40" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Loading post data…</div>
          )}

          {!loading && detail && (
            <>
              {/* Image + caption */}
              <div className="relative">
                {thumb
                  ? <img src={thumb} alt="" className="w-full aspect-square object-cover" /> // eslint-disable-line @next/next/no-img-element
                  : <div className="w-full aspect-square bg-oatmilk flex items-center justify-center"><ImageIcon className="w-8 h-8 text-ink/20" /></div>
                }
                <span className="absolute top-3 left-3 text-[10px] font-semibold uppercase px-2 py-1 rounded-full bg-black/50 text-white" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                  {typeLabel}
                </span>
              </div>

              {m?.caption && (
                <div className="px-6 py-4 border-b border-mushroom/30">
                  <p className="text-sm text-ink leading-relaxed" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{m.caption}</p>
                </div>
              )}

              {/* No-insights banner */}
              {!insightsAvailable && (
                <div className="mx-6 mt-5 px-4 py-3 rounded-lg bg-butter-light border border-butter/50">
                  <p className="text-xs font-medium text-ink-dark mb-0.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Post insights expired</p>
                  <p className="text-[11px] text-ink/60 leading-relaxed" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                    Instagram retains per-post insights for 2 years. Posts older than that lose their metrics data entirely. New posts you publish will have full reach, saves, and audience breakdowns.
                  </p>
                </div>
              )}

              {/* Core metrics */}
              <div className="px-6 py-5 border-b border-mushroom/30">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/40 mb-3" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Performance</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    // Prefer live media counts for likes/comments (avoids 0 from stale insights)
                    { label: 'Likes', value: m?.like_count ?? metrics.likes },
                    { label: 'Comments', value: m?.comments_count ?? metrics.comments },
                    { label: 'Reach', value: metrics.reach },
                    { label: 'Views', value: metrics.views },
                    { label: 'Saves', value: metrics.saved },
                    { label: 'Shares', value: metrics.shares },
                    ...(m?.isReel ? [{ label: 'Plays', value: metrics.plays }] : []),
                    { label: 'Total Engagements', value: metrics.total_interactions },
                    { label: 'Profile Visits', value: metrics.profile_visits },
                    { label: 'Follows', value: metrics.follows },
                    ...(engRate ? [{ label: 'Eng. Rate', value: engRate as unknown as number }] : []),
                  ].filter(s => s.value !== undefined && s.value !== null).map(s => (
                    <div key={s.label} className="bg-oatmilk/40 rounded-lg px-3 py-2.5 text-center border border-mushroom/30">
                      <p className="text-base font-bold text-ink-dark leading-none" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
                        {typeof s.value === 'string' ? s.value : fmtNum(s.value)}
                      </p>
                      <p className="text-[9px] text-ink/50 mt-0.5 uppercase tracking-wide" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Audience breakdowns — only render when insights are available */}
              {insightsAvailable && (
                <div className="px-6 py-5 space-y-5 border-t border-mushroom/30">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/40" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Audience Reached</p>

                  {/* Follower vs Discovery */}
                  <div>
                    <p className="text-xs text-ink/50 mb-2" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Follower vs Discovery</p>
                    {detail.followBreakdown.length > 0 ? (
                      <div className="flex gap-2">
                        {detail.followBreakdown.map(f => {
                          const total = detail.followBreakdown.reduce((s, r) => s + r.value, 0)
                          const pct = total > 0 ? Math.round((f.value / total) * 100) : 0
                          const color = f.type === 'FOLLOWER' ? 'bg-sage/30 border-sage/40' : 'bg-candy/10 border-candy/30'
                          return (
                            <div key={f.type} className={cn('flex-1 rounded-lg border px-3 py-2 text-center', color)}>
                              <p className="text-base font-bold text-ink-dark" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>{pct}%</p>
                              <p className="text-[9px] text-ink/50 uppercase tracking-wide" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                                {f.type === 'FOLLOWER' ? 'Followers' : f.type === 'NON_FOLLOWER' ? 'Non-followers' : f.type}
                              </p>
                              <p className="text-[9px] text-ink/40" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{fmtNum(f.value)}</p>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-ink/30 italic" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>No data available</p>
                    )}
                  </div>

                  {/* Age + Gender */}
                  <div>
                    <p className="text-xs text-ink/50 mb-2" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Age & Gender</p>
                    {detail.ageGenderBreakdown.length > 0 ? (
                      <div className="space-y-1.5">
                        {(() => {
                          const total = detail.ageGenderBreakdown.reduce((s, r) => s + r.value, 0)
                          return detail.ageGenderBreakdown.slice(0, 8).map(r => {
                            const pct = total > 0 ? Math.round((r.value / total) * 100) : 0
                            const barColor = r.label.startsWith('Women') ? 'bg-candy/40' : r.label.startsWith('Men') ? 'bg-blueberry/30' : 'bg-mushroom/40'
                            return (
                              <div key={r.label}>
                                <div className="flex justify-between mb-0.5">
                                  <span className="text-[10px] text-ink-dark" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{r.label}</span>
                                  <span className="text-[10px] text-ink/50" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{pct}%</span>
                                </div>
                                <div className="h-1.5 bg-mushroom/20 rounded-full overflow-hidden">
                                  <div className={cn('h-full rounded-full', barColor)} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            )
                          })
                        })()}
                      </div>
                    ) : (
                      <p className="text-xs text-ink/30 italic" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>No data available</p>
                    )}
                  </div>

                  {/* Top Cities */}
                  <div>
                    <p className="text-xs text-ink/50 mb-2" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Top Cities</p>
                    {detail.cityBreakdown.length > 0 ? (
                      <div className="space-y-1.5">
                        {(() => {
                          const max = detail.cityBreakdown[0]?.value ?? 1
                          return detail.cityBreakdown.map(c => (
                            <div key={c.name}>
                              <div className="flex justify-between mb-0.5">
                                <span className="text-[10px] text-ink-dark truncate max-w-[70%]" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{c.name}</span>
                                <span className="text-[10px] text-ink/50" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{fmtNum(c.value)}</span>
                              </div>
                              <div className="h-1.5 bg-mushroom/20 rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-sage/50" style={{ width: `${Math.round((c.value / max) * 100)}%` }} />
                              </div>
                            </div>
                          ))
                        })()}
                      </div>
                    ) : (
                      <p className="text-xs text-ink/30 italic" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>No data available</p>
                    )}
                  </div>

                  {/* Top Countries */}
                  <div>
                    <p className="text-xs text-ink/50 mb-2" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Top Countries</p>
                    {detail.countryBreakdown.length > 0 ? (
                      <div className="space-y-1">
                        {(() => {
                          const total = detail.countryBreakdown.reduce((s, r) => s + r.value, 0)
                          return detail.countryBreakdown.map(c => (
                            <div key={c.name} className="flex justify-between">
                              <span className="text-[10px] text-ink-dark" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{c.name}</span>
                              <span className="text-[10px] text-ink/50 font-medium" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                                {total > 0 ? Math.round((c.value / total) * 100) : 0}%
                              </span>
                            </div>
                          ))
                        })()}
                      </div>
                    ) : (
                      <p className="text-xs text-ink/30 italic" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>No data available</p>
                    )}
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

function IgStorySidebar({ storyId, onClose }: { storyId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<IgStoryDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setDetail(null); setLoading(true)
    fetch(`/api/instagram/story?id=${storyId}`)
      .then(r => r.json())
      .then((d: IgStoryDetail & { error?: string }) => { if (!d.error) setDetail(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [storyId])

  const m = detail?.media
  const metrics = detail?.metrics ?? {}
  const insightsAvailable = detail?.insightsAvailable ?? false
  const navBreakdown = detail?.navBreakdown ?? []

  // Label mapping for navigation action_type breakdown values (Meta API enum → Instagram UI labels)
  const navActionLabel: Record<string, string> = {
    SWIPE_FORWARD: 'Taps Forward', FORWARD: 'Taps Forward', TAP_FORWARD: 'Taps Forward',
    SWIPE_BACK: 'Taps Back', BACK: 'Taps Back', TAP_BACK: 'Taps Back',
    TAP_EXIT: 'Exited', EXIT: 'Exited', EXITED: 'Exited',
    SWIPE_AWAY: 'Next Story', NEXT_STORY: 'Next Story', SWIPE_UP: 'Next Story',
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/10 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white shadow-2xl flex flex-col bottom-sheet-wrap md:top-0 md:left-auto md:w-[380px]">

        {/* Header */}
        <div className="px-6 py-5 border-b border-mushroom/40 flex items-center justify-between shrink-0">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/40 mb-0.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
              {loading ? 'Loading…' : 'Story'}
            </p>
            {m && (
              <p className="text-xs text-ink/50" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                {format(new Date(m.timestamp), 'MMMM d, yyyy · h:mm a')}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-ink/40 hover:text-ink hover:bg-oatmilk transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="p-6 text-sm text-ink/40" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Loading story data…</div>
          )}

          {!loading && detail && (
            <>
              {/* Story preview — 9:16 aspect ratio */}
              <div className="relative bg-ink-dark">
                {m?.media_url
                  ? <img src={m.media_url} alt="" className="w-full aspect-[9/16] object-cover opacity-90" /> // eslint-disable-line @next/next/no-img-element
                  : <div className="w-full aspect-[9/16] flex items-center justify-center"><ImageIcon className="w-8 h-8 text-white/20" /></div>
                }
                {/* Live badge */}
                <span className="absolute top-3 left-3 text-[10px] font-semibold uppercase px-2 py-1 rounded-full bg-candy text-white" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                  Live
                </span>
              </div>

              {/* Metrics */}
              <div className="px-6 py-5 border-b border-mushroom/30">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/40 mb-3" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Performance</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Reach', value: metrics.reach },
                    { label: 'Replies', value: metrics.replies },
                    { label: 'Shares', value: metrics.shares },
                    { label: 'Navigation', value: metrics.navigation },
                    { label: 'Profile Visits', value: metrics.profile_visits },
                    { label: 'Follows', value: metrics.follows },
                  ].filter(s => s.value !== undefined && s.value !== null).map(s => (
                    <div key={s.label} className="bg-oatmilk/40 rounded-lg px-3 py-2.5 text-center border border-mushroom/30">
                      <p className="text-base font-bold text-ink-dark leading-none" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
                        {typeof s.value === 'string' ? s.value : fmtNum(s.value)}
                      </p>
                      <p className="text-[9px] text-ink/50 mt-0.5 uppercase tracking-wide" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {insightsAvailable && navBreakdown.length > 0 && (
                <div className="px-6 py-5 border-t border-mushroom/30">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/40 mb-3" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Navigation</p>
                  <div className="space-y-1.5">
                    {navBreakdown.map(n => {
                      const total = navBreakdown.reduce((s, r) => s + r.value, 0)
                      const pct = total > 0 ? Math.round((n.value / total) * 100) : 0
                      const label = navActionLabel[n.action] ?? n.action
                      return (
                        <div key={n.action}>
                          <div className="flex justify-between mb-0.5">
                            <span className="text-[10px] text-ink-dark" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{label}</span>
                            <span className="text-[10px] text-ink/50" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{fmtNum(n.value)} · {pct}%</span>
                          </div>
                          <div className="h-1.5 bg-mushroom/20 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-blueberry/30" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
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

function InstagramConnectForm({ onConnected }: { onConnected: () => void }) {
  const [token, setToken] = useState('')
  const [userId, setUserId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!token.trim() || !userId.trim()) return
    setSaving(true); setError(null)
    const res = await fetch('/api/instagram/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: token.trim(), ig_user_id: userId.trim() }),
    })
    const data = await res.json() as { ok?: boolean; error?: string }
    if (!res.ok || data.error) { setError(data.error ?? 'Connection failed'); setSaving(false); return }
    onConnected()
  }

  return (
    <form onSubmit={submit} className="space-y-3 mt-3">
      <div>
        <label className="block text-xs text-ink/50 mb-1" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
          Long-lived Access Token
        </label>
        <input
          value={token}
          onChange={e => setToken(e.target.value)}
          placeholder="EAAxxxxxxxxxxxxxxxx…"
          className="w-full px-3 py-2 text-xs border border-mushroom/60 rounded-lg bg-oatmilk/30 text-ink-dark outline-none focus:ring-2 focus:ring-ink/15 placeholder:text-ink/30 font-mono"
          style={{ fontFamily: 'monospace' }}
        />
      </div>
      <div>
        <label className="block text-xs text-ink/50 mb-1" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
          Instagram Business Account ID
        </label>
        <input
          value={userId}
          onChange={e => setUserId(e.target.value)}
          placeholder="17841400000000000"
          className="w-full px-3 py-2 text-xs border border-mushroom/60 rounded-lg bg-oatmilk/30 text-ink-dark outline-none focus:ring-2 focus:ring-ink/15 placeholder:text-ink/30 font-mono"
          style={{ fontFamily: 'monospace' }}
        />
      </div>
      {error && <p className="text-xs text-terracotta" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{error}</p>}
      <div className="flex gap-2 items-center pt-1">
        <button
          type="submit"
          disabled={saving || !token.trim() || !userId.trim()}
          className="text-xs px-3 py-1.5 rounded-lg bg-ink-dark text-cream hover:bg-ink transition-colors cursor-pointer disabled:opacity-40"
          style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
        >
          {saving ? 'Connecting…' : 'Connect'}
        </button>
        <a
          href="https://developers.facebook.com/docs/instagram-basic-display-api/guides/long-lived-access-tokens"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-ink/40 hover:text-ink transition-colors underline cursor-pointer"
          style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
        >
          How to get a token ↗
        </a>
      </div>
    </form>
  )
}

function InstagramCard() {
  const [status, setStatus] = useState<{ connected: boolean; username?: string; reason?: string } | null>(null)
  const [analytics, setAnalytics] = useState<IgAnalytics | null>(null)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [activeMediaTab, setActiveMediaTab] = useState<'posts' | 'stories'>('posts')
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/instagram/status')
      .then(r => r.json())
      .then(setStatus)
  }, [])

  function loadAnalytics() {
    setLoading(true); setError(null)
    fetch('/api/instagram/analytics')
      .then(r => r.json())
      .then((d: IgAnalytics & { error?: string }) => {
        if (d.error) { setError(d.error); setLoading(false); return }
        setAnalytics(d); setLoading(false)
      })
      .catch(() => { setError('Failed to load analytics'); setLoading(false) })
  }

  useEffect(() => {
    if (!status?.connected) return
    loadAnalytics()
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSync() {
    setSyncing(true)
    try { loadAnalytics() } finally { setSyncing(false) }
  }

  async function disconnect() {
    await fetch('/api/instagram/status', { method: 'DELETE' })
    setStatus({ connected: false }); setAnalytics(null)
  }

  const posts = analytics?.media.filter(m => m.media_type !== 'STORY') ?? []
  const stories = analytics?.stories ?? []

  return (
    <div className="rounded-xl border border-mushroom/50 bg-white flex overflow-hidden col-span-2">
      <div className="w-1 shrink-0 bg-candy" />
      <div className="flex-1 p-5 min-w-0">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/instagram.svg" alt="Instagram" className="w-5 h-5 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            <span className="text-base font-semibold text-ink-dark" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
              Instagram
            </span>
            {analytics?.profile.username && (
              <span className="text-xs text-ink/40" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                @{analytics.profile.username}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {status?.connected ? (
              <>
                <button
                  onClick={handleSync}
                  disabled={syncing || loading}
                  className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border border-mushroom/50 text-ink/50 hover:text-ink hover:border-mushroom transition-colors disabled:opacity-40 cursor-pointer"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                >
                  <RefreshCw className={cn('w-2.5 h-2.5', (syncing || loading) && 'animate-spin')} />
                  {syncing || loading ? 'Syncing…' : 'Sync'}
                </button>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-thyme/10 text-thyme border border-thyme/30" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                  Connected
                </span>
                <button
                  onClick={disconnect}
                  className="text-[10px] text-ink/30 hover:text-ink/60 transition-colors cursor-pointer"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={() => setConnecting(v => !v)}
                className="text-xs px-3 py-1.5 rounded-lg bg-ink-dark text-cream hover:bg-ink transition-colors cursor-pointer"
                style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
              >
                {connecting ? 'Cancel' : 'Connect'}
              </button>
            )}
          </div>
        </div>

        {/* Connect form */}
        {!status?.connected && connecting && (
          <InstagramConnectForm onConnected={() => { setConnecting(false); setStatus({ connected: true }); setLoading(true) }} />
        )}

        {!status?.connected && !connecting && (
          <div>
            {status?.reason === 'token_expired' && (
              <p className="text-xs text-terracotta mb-2 font-medium" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                Your Instagram access token expired. Please reconnect to restore analytics.
              </p>
            )}
            <p className="text-sm text-ink-dark leading-relaxed" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
              Connect your Instagram Business account to view post, story, and reel analytics — reach, impressions, likes, saves, and more.
            </p>
          </div>
        )}

        {/* Loading */}
        {status?.connected && loading && (
          <p className="text-sm text-ink/40 py-4" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Loading analytics…</p>
        )}

        {/* Error */}
        {status?.connected && error && (
          <p className="text-sm text-terracotta py-2" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{error}</p>
        )}

        {/* Analytics */}
        {status?.connected && analytics && !loading && (
          <div className="space-y-5">

            {/* Account stats row */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Followers', value: fmtNum(analytics.profile.followers_count) },
                { label: '30d Reach', value: fmtNum(analytics.accountInsights.reach30d) },
                { label: '30d Views', value: fmtNum(analytics.accountInsights.impressions30d) },
                { label: '30d Profile Views', value: fmtNum(analytics.accountInsights.profileViews30d) },
                { label: 'Total Posts', value: fmtNum(analytics.profile.media_count) },
                { label: 'Stories Live', value: fmtNum(stories.length) },
                { label: 'Website Clicks', value: fmtNum(analytics.accountInsights.websiteClicks30d) },
              ].map(s => (
                <div key={s.label} className="bg-oatmilk/40 rounded-lg px-3 py-2.5 text-center border border-mushroom/30">
                  <p className="text-lg font-bold text-ink-dark leading-none" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>{s.value}</p>
                  <p className="text-[10px] text-ink/50 mt-0.5 uppercase tracking-wide" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* Demographics */}
            {(analytics.demographics.genderAge.length > 0 || analytics.demographics.topCities.length > 0) && (
              <div className="grid grid-cols-3 gap-4">

                {/* Gender + Age */}
                {analytics.demographics.genderAge.length > 0 && (
                  <div className="bg-oatmilk/30 rounded-xl border border-mushroom/30 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/40 mb-3" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Age & Gender</p>
                    <div className="space-y-1.5">
                      {(() => {
                        const total = analytics.demographics.genderAge.reduce((s, r) => s + r.value, 0)
                        return analytics.demographics.genderAge.slice(0, 8).map(r => {
                          const pct = total > 0 ? Math.round((r.value / total) * 100) : 0
                          const barColor = r.gender === 'Women' ? 'bg-candy/50' : r.gender === 'Men' ? 'bg-blueberry/40' : 'bg-mushroom/50'
                          return (
                            <div key={`${r.gender}-${r.age}`}>
                              <div className="flex justify-between items-center mb-0.5">
                                <span className="text-[10px] text-ink-dark" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{r.gender} {r.age}</span>
                                <span className="text-[10px] text-ink/50 font-medium" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{pct}%</span>
                              </div>
                              <div className="h-1.5 bg-mushroom/20 rounded-full overflow-hidden">
                                <div className={cn('h-full rounded-full', barColor)} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          )
                        })
                      })()}
                    </div>
                  </div>
                )}

                {/* Top Cities */}
                {analytics.demographics.topCities.length > 0 && (
                  <div className="bg-oatmilk/30 rounded-xl border border-mushroom/30 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/40 mb-3" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Top Cities</p>
                    <div className="space-y-1.5">
                      {(() => {
                        const max = analytics.demographics.topCities[0]?.value ?? 1
                        return analytics.demographics.topCities.slice(0, 8).map(c => {
                          const pct = Math.round((c.value / max) * 100)
                          return (
                            <div key={c.name}>
                              <div className="flex justify-between items-center mb-0.5">
                                <span className="text-[10px] text-ink-dark truncate max-w-[70%]" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{c.name}</span>
                                <span className="text-[10px] text-ink/50 font-medium" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{fmtNum(c.value)}</span>
                              </div>
                              <div className="h-1.5 bg-mushroom/20 rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-sage/50" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          )
                        })
                      })()}
                    </div>
                  </div>
                )}

                {/* Top Countries + Best Hours */}
                <div className="space-y-4">
                  {analytics.demographics.topCountries.length > 0 && (
                    <div className="bg-oatmilk/30 rounded-xl border border-mushroom/30 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/40 mb-3" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Top Countries</p>
                      <div className="space-y-1">
                        {analytics.demographics.topCountries.slice(0, 5).map(c => {
                          const total = analytics.demographics.topCountries.reduce((s, r) => s + r.value, 0)
                          const pct = total > 0 ? Math.round((c.value / total) * 100) : 0
                          return (
                            <div key={c.name} className="flex items-center justify-between gap-2">
                              <span className="text-[10px] text-ink-dark" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{c.name}</span>
                              <span className="text-[10px] text-ink/50 font-medium" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{pct}%</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {analytics.demographics.bestHours.length > 0 && (
                    <div className="bg-oatmilk/30 rounded-xl border border-mushroom/30 p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/40 mb-2" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Best Times to Post</p>
                      <div className="flex flex-wrap gap-1.5">
                        {analytics.demographics.bestHours.map(h => {
                          const label = h.hour === 0 ? '12am' : h.hour < 12 ? `${h.hour}am` : h.hour === 12 ? '12pm' : `${h.hour - 12}pm`
                          return (
                            <span key={h.hour} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-butter/60 text-ink-dark" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                              {label}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Posts / Stories tabs */}
            <div>
              <div className="flex gap-1 mb-3">
                {(['posts', 'stories'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveMediaTab(tab)}
                    className={cn(
                      'px-3 py-1 text-xs rounded-lg font-medium transition-all cursor-pointer',
                      activeMediaTab === tab ? 'bg-ink-dark text-cream' : 'text-ink/50 hover:bg-oatmilk hover:text-ink-dark'
                    )}
                    style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                  >
                    {tab === 'posts' ? `Posts & Reels (${posts.length})` : `Stories (${stories.length})`}
                  </button>
                ))}
              </div>

              {activeMediaTab === 'posts' && (
                posts.length === 0 ? (
                  <p className="text-sm text-ink/40 py-2" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>No posts found.</p>
                ) : (
                  <>
                  <div className="grid grid-cols-6 gap-2">
                    {posts.slice(0, 12).map(post => {
                      const thumb = post.thumbnail_url ?? post.media_url
                      const totalEng = (post.like_count ?? 0) + (post.comments_count ?? 0)
                      const isSelected = selectedPostId === post.id
                      return (
                        <button
                          key={post.id}
                          onClick={() => setSelectedPostId(isSelected ? null : post.id)}
                          className={cn(
                            'group relative aspect-square rounded-lg overflow-hidden bg-oatmilk border cursor-pointer transition-all',
                            isSelected ? 'border-ink-dark ring-2 ring-ink-dark' : 'border-mushroom/30'
                          )}
                          title={post.caption?.slice(0, 80) ?? post.media_type}
                        >
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb} alt="" className="w-full h-full object-cover group-hover:opacity-80 transition-opacity" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-ink/20">
                              <ImageIcon className="w-5 h-5" />
                            </div>
                          )}
                          <span className="absolute top-1 left-1 text-[8px] font-semibold uppercase px-1 py-0.5 rounded bg-black/50 text-white leading-none" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                            {post.media_type === 'VIDEO' ? 'Reel' : post.media_type === 'CAROUSEL_ALBUM' ? 'Carousel' : 'Post'}
                          </span>
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-0.5 p-1">
                            <p className="text-white text-xs font-bold" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>❤ {fmtNum(post.like_count)} · 💬 {fmtNum(post.comments_count)}</p>
                            {post.insights?.reach !== undefined && (
                              <p className="text-white/70 text-[9px]" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{fmtNum(post.insights.reach)} reach</p>
                            )}
                            {post.insights?.saved !== undefined && (
                              <p className="text-white/70 text-[9px]" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{fmtNum(post.insights.saved)} saved</p>
                            )}
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 bg-black/40 px-1 py-0.5 flex items-center justify-center">
                            <p className="text-white text-[9px] font-medium" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{fmtNum(totalEng)}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {/* Post detail sidebar */}
                  {selectedPostId && (
                    <IgPostSidebar
                      mediaId={selectedPostId}
                      followerCount={analytics.profile.followers_count}
                      onClose={() => setSelectedPostId(null)}
                    />
                  )}
                  </>
                )
              )}

              {activeMediaTab === 'stories' && (
                stories.length === 0 ? (
                  <p className="text-sm text-ink/40 py-2" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>No active stories.</p>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    {stories.map(story => (
                      <button
                        key={story.id}
                        onClick={() => setSelectedStoryId(story.id)}
                        className="group relative rounded-lg overflow-hidden bg-oatmilk border border-mushroom/30 hover:ring-2 hover:ring-candy/50 transition-all cursor-pointer text-left shrink-0"
                        style={{ width: 100, height: 160 }}
                      >
                        {story.media_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={story.media_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-ink/20">
                            <ImageIcon className="w-5 h-5" />
                          </div>
                        )}
                        {/* Live indicator */}
                        <span className="absolute top-1.5 left-1.5 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-candy text-white" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Live</span>
                        {story.insights && (
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-2 space-y-0.5">
                            <p className="text-white text-[9px]" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                              {fmtNum(story.insights.reach)} reach
                            </p>
                            {story.insights.replies !== undefined && story.insights.replies > 0 && (
                              <p className="text-white/70 text-[9px]" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                                {fmtNum(story.insights.replies)} replies
                              </p>
                            )}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )
              )}

              {/* Story detail sidebar */}
              {selectedStoryId && (
                <IgStorySidebar
                  storyId={selectedStoryId}
                  onClose={() => setSelectedStoryId(null)}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Klaviyo types ────────────────────────────────────────────────────────────

interface KlaviyoStatus {
  connected: boolean
  account_name?: string | null
  last_synced_at?: string | null
}

interface KlaviyoList {
  klaviyo_id: string
  name: string
  profile_count: number
}

interface KlaviyoCampaign {
  klaviyo_id: string
  name: string
  status: string
  subject: string | null
  from_email: string | null
  send_time: string | null
  // Per-campaign engagement metrics (populated after sync)
  recipients: number | null
  opens: number | null
  unique_opens: number | null
  clicks: number | null
  unique_clicks: number | null
  revenue: number | null
  unsubscribes: number | null
  open_rate: number | null
  click_rate: number | null
}

interface KlaviyoFlow {
  klaviyo_id: string
  name: string
  status: string
  trigger_type: string | null
  updated: string | null
}

interface FlowMessage {
  id: string
  action_id: string
  action_type: string
  action_status: string
  name: string
  subject: string | null
  preview_text: string | null
  from_label: string | null
  from_email: string | null
  body: string | null
  html: string | null
}

interface FlowDetail {
  messages: FlowMessage[]
}

interface CampaignMessage {
  id: string
  name: string
  status: string
  subject: string | null
  preview_text: string | null
  from_label: string | null
  from_email: string | null
}

interface CampaignDetail {
  id: string
  name: string
  status: string
  send_time: string | null
  messages: CampaignMessage[]
}

type DetailPane =
  | { type: 'flow'; flow: KlaviyoFlow }
  | { type: 'campaign'; campaign: KlaviyoCampaign }
  | null

interface KlaviyoData {
  lists: KlaviyoList[]
  campaigns: KlaviyoCampaign[]
  flows: KlaviyoFlow[]
  metrics: Record<string, number>
  total_subscribers: number
}

function ShopifyConnectModal({
  onClose,
}: {
  onClose: () => void
  onConnected: () => void
}) {
  const [storeUrl, setStoreUrl] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/shopify/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_url: storeUrl, client_id: clientId, client_secret: clientSecret }),
      })
      const data = await res.json() as { redirect_url?: string; error?: string }
      if (!res.ok || data.error) {
        setError(data.error ?? 'Failed to start authorization')
      } else if (data.redirect_url) {
        window.location.href = data.redirect_url
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backdropFilter: 'blur(4px)', background: 'rgba(30,27,20,0.35)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-7 space-y-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2
            className="text-xl text-ink-dark"
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700 }}
          >
            Connect Shopify
          </h2>
          <button onClick={onClose} className="text-ink/40 hover:text-ink transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-ink/60" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
          Enter your store URL and credentials from the WDP Dashboard app in the Shopify Partners Dashboard.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label
              className="block text-[10px] font-semibold uppercase tracking-widest text-ink mb-1.5"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            >
              Store URL
            </label>
            <input
              autoFocus
              value={storeUrl}
              onChange={e => setStoreUrl(e.target.value)}
              placeholder="weeknightdinnerparty.myshopify.com"
              required
              className="w-full px-3 py-2 text-sm border border-mushroom/60 rounded-lg outline-none focus:ring-2 focus:ring-ink/15 focus:border-ink/30 bg-oatmilk/30 text-ink-dark placeholder:text-ink/30"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            />
          </div>
          <div>
            <label
              className="block text-[10px] font-semibold uppercase tracking-widest text-ink mb-1.5"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            >
              Client ID
            </label>
            <input
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              placeholder="From Partners Dashboard → WDP Dashboard"
              required
              className="w-full px-3 py-2 text-sm border border-mushroom/60 rounded-lg outline-none focus:ring-2 focus:ring-ink/15 focus:border-ink/30 bg-oatmilk/30 text-ink-dark placeholder:text-ink/30"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            />
          </div>
          <div>
            <label
              className="block text-[10px] font-semibold uppercase tracking-widest text-ink mb-1.5"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            >
              Client Secret
            </label>
            <input
              type="password"
              value={clientSecret}
              onChange={e => setClientSecret(e.target.value)}
              placeholder="••••••••••••••••"
              required
              className="w-full px-3 py-2 text-sm border border-mushroom/60 rounded-lg outline-none focus:ring-2 focus:ring-ink/15 focus:border-ink/30 bg-oatmilk/30 text-ink-dark placeholder:text-ink/30"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            />
          </div>
          {error && (
            <p className="text-xs text-tomato" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
              {error}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving || !storeUrl.trim() || !clientId.trim() || !clientSecret.trim()}
              className="px-4 py-2 rounded-lg bg-ink-dark text-cream text-sm hover:bg-ink transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            >
              {saving ? 'Redirecting…' : 'Authorize with Shopify →'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-ink text-sm hover:bg-oatmilk transition-colors cursor-pointer"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ShopifyCard() {
  const [status, setStatus] = useState<ShopifyStatus | null>(null)
  const [orders, setOrders] = useState<ShopifyOrderRow[]>([])
  const [showModal, setShowModal] = useState(false)
  const [syncing, setSyncing] = useState(false)

  function loadStatus() {
    fetch('/api/shopify/connect')
      .then(r => r.json())
      .then((s: ShopifyStatus) => {
        setStatus(s)
        if (s.connected) {
          fetch('/api/shopify/orders?days=30')
            .then(r => r.json())
            .then((o: ShopifyOrderRow[]) => setOrders(o))
        }
      })
  }

  useEffect(() => {
    loadStatus()
    // Auto-refresh after OAuth callback redirect
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('shopify_connected') === '1') {
        window.history.replaceState({}, '', window.location.pathname)
        loadStatus()
      }
    }
  }, [])

  async function handleSync() {
    setSyncing(true)
    try {
      await fetch('/api/shopify/sync', { method: 'POST' })
      loadStatus()
    } finally {
      setSyncing(false)
    }
  }

  const totalRevenue = orders.reduce((sum, o) => sum + (o.total_price ?? 0), 0)
  const orderCount = orders.length

  return (
    <>
      <div className="rounded-xl border border-mushroom/50 bg-white flex overflow-hidden">
        <div className="w-1 shrink-0 bg-thyme" />
        <div className="flex-1 p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logos/shopify.svg" alt="Shopify" className="w-5 h-5 object-contain" />
              <span
                className="text-base font-semibold text-ink-dark"
                style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
              >
                Shopify
              </span>
            </div>
            {status === null ? (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-mushroom/20 text-ink border border-mushroom/40" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                Loading…
              </span>
            ) : status.connected ? (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-thyme-light text-thyme border border-thyme/30" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                Connected
              </span>
            ) : (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-mushroom/20 text-ink border border-mushroom/40" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                Not connected
              </span>
            )}
          </div>

          <p className="text-sm text-ink-dark leading-relaxed" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
            Revenue, orders, average order value, and top-selling blends.
          </p>

          {status?.connected && orderCount > 0 && (
            <div className="flex gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-ink/50 mb-0.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Revenue (30d)</p>
                <p className="text-sm font-semibold text-ink-dark tabular-nums" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                  ${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-ink/50 mb-0.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Orders (30d)</p>
                <p className="text-sm font-semibold text-ink-dark tabular-nums" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                  {orderCount}
                </p>
              </div>
            </div>
          )}

          {status?.connected && status.last_synced_at && (
            <p className="text-[10px] text-ink/40" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
              Last synced {format(parseISO(status.last_synced_at), 'MMM d, h:mm a')}
            </p>
          )}

          <div className="flex gap-2 flex-wrap">
            {!status?.connected ? (
              <button
                onClick={() => setShowModal(true)}
                className="self-start text-xs px-3 py-1.5 rounded-lg bg-ink-dark text-cream hover:bg-ink transition-colors cursor-pointer"
                style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
              >
                Connect Shopify
              </button>
            ) : (
              <>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="flex items-center gap-1.5 self-start text-xs px-3 py-1.5 rounded-lg bg-ink-dark text-cream hover:bg-ink transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                >
                  <RefreshCw className={cn('w-3 h-3', syncing && 'animate-spin')} />
                  {syncing ? 'Syncing…' : 'Sync now'}
                </button>
                <a
                  href="https://admin.shopify.com/store/eiy0fe-13"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 self-start text-xs px-3 py-1.5 rounded-lg border border-mushroom/60 text-ink hover:bg-oatmilk transition-colors"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                >
                  <ExternalLink className="w-3 h-3" /> Open Shopify
                </a>
                <button
                  onClick={() => setShowModal(true)}
                  className="self-start text-xs px-3 py-1.5 rounded-lg border border-mushroom/60 text-ink hover:bg-oatmilk transition-colors cursor-pointer"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                >
                  Reconnect
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {showModal && (
        <ShopifyConnectModal
          onClose={() => setShowModal(false)}
          onConnected={() => { loadStatus(); setShowModal(false) }}
        />
      )}
    </>
  )
}

// ─── Klaviyo connect modal ────────────────────────────────────────────────────

function KlaviyoConnectModal({ onClose, onConnected }: { onClose: () => void; onConnected: (name: string) => void }) {
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function connect() {
    if (!apiKey.trim()) return
    setLoading(true); setError(null)
    const res = await fetch('/api/klaviyo/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey.trim() }),
    })
    const data = await res.json() as { ok?: boolean; error?: string; account_name?: string }
    if (!res.ok) { setError(data.error ?? 'Connection failed'); setLoading(false); return }
    onConnected(data.account_name ?? '')
  }

  return (
    <div className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/klaviyo.svg" alt="Klaviyo" className="w-5 h-5" />
            <h2 className="text-xl text-ink-dark" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700 }}>Connect Klaviyo</h2>
          </div>
          <button onClick={onClose} className="text-ink/40 hover:text-ink cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-ink/70" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
          Find your Private API Key in Klaviyo under <strong>Account → Settings → API Keys</strong>. Create one with <em>Full Access</em> if you don&apos;t have one.
        </p>
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-widest text-ink/60 mb-1.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
            Private API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && connect()}
            placeholder="pk_••••••••••••••••••••"
            className="w-full px-3 py-2.5 text-sm border border-mushroom/60 rounded-lg outline-none focus:ring-2 focus:ring-ink/10 bg-white text-ink-dark"
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
          />
        </div>
        {error && <p className="text-xs text-terracotta" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-mushroom/60 text-ink text-sm hover:bg-oatmilk transition-colors cursor-pointer" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Cancel</button>
          <button onClick={connect} disabled={loading || !apiKey.trim()} className="flex-1 px-4 py-2 rounded-lg bg-ink-dark text-cream text-sm hover:bg-ink transition-colors disabled:opacity-40 cursor-pointer" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
            {loading ? 'Connecting…' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Klaviyo campaign modal ───────────────────────────────────────────────────

function KlaviyoCampaignModal({
  lists, onClose, onCreated,
}: {
  lists: KlaviyoList[]
  onClose: () => void
  onCreated: () => void
}) {
  const [channel, setChannel] = useState<'email' | 'sms'>('email')
  const [name, setName] = useState('')
  const [listId, setListId] = useState(lists[0]?.klaviyo_id ?? '')
  const [subject, setSubject] = useState('')
  const [fromName, setFromName] = useState('Weeknight Dinner Party')
  const [fromEmail, setFromEmail] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    if (!name.trim() || !listId) { setError('Name and audience are required'); return }
    setSaving(true); setError(null)
    const res = await fetch('/api/klaviyo/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), channel, list_id: listId, subject, from_name: fromName, from_email: fromEmail, body }),
    })
    const data = await res.json() as { ok?: boolean; error?: string }
    if (!res.ok) { setError(data.error ?? 'Failed to create'); setSaving(false); return }
    onCreated()
  }

  return (
    <div className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-8 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-xl text-ink-dark" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700 }}>New Campaign</h2>
          <button onClick={onClose} className="text-ink/40 hover:text-ink cursor-pointer"><X className="w-4 h-4" /></button>
        </div>

        {/* Channel toggle */}
        <div className="flex gap-1 p-1 bg-oatmilk rounded-lg w-fit">
          {(['email', 'sms'] as const).map(c => (
            <button key={c} onClick={() => setChannel(c)} className={cn('px-4 py-1.5 rounded-md text-sm font-semibold transition-all cursor-pointer', channel === c ? 'bg-white text-ink-dark shadow-sm' : 'text-ink hover:text-ink-dark')} style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
              {c === 'email' ? 'Email' : 'SMS'}
            </button>
          ))}
        </div>

        {/* Name */}
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-widest text-ink/60 mb-1.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Campaign Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="May Newsletter" className="w-full px-3 py-2 text-sm border border-mushroom/60 rounded-lg bg-white text-ink-dark outline-none focus:ring-2 focus:ring-ink/10" style={{ fontFamily: "'Jost', system-ui, sans-serif" }} />
        </div>

        {/* Audience */}
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-widest text-ink/60 mb-1.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Audience</label>
          <select value={listId} onChange={e => setListId(e.target.value)} className="w-full px-3 py-2 text-sm border border-mushroom/60 rounded-lg bg-white text-ink-dark outline-none focus:ring-2 focus:ring-ink/10 cursor-pointer" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
            {lists.map(l => <option key={l.klaviyo_id} value={l.klaviyo_id}>{l.name} ({l.profile_count})</option>)}
          </select>
        </div>

        {channel === 'email' ? (
          <>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-ink/60 mb-1.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Subject Line</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Your subject line…" className="w-full px-3 py-2 text-sm border border-mushroom/60 rounded-lg bg-white text-ink-dark outline-none focus:ring-2 focus:ring-ink/10" style={{ fontFamily: "'Jost', system-ui, sans-serif" }} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-ink/60 mb-1.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>From Name</label>
                <input value={fromName} onChange={e => setFromName(e.target.value)} className="w-full px-3 py-2 text-sm border border-mushroom/60 rounded-lg bg-white text-ink-dark outline-none focus:ring-2 focus:ring-ink/10" style={{ fontFamily: "'Jost', system-ui, sans-serif" }} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-ink/60 mb-1.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>From Email</label>
                <input type="email" value={fromEmail} onChange={e => setFromEmail(e.target.value)} placeholder="hello@weeknightdinnerparty.com" className="w-full px-3 py-2 text-sm border border-mushroom/60 rounded-lg bg-white text-ink-dark outline-none focus:ring-2 focus:ring-ink/10" style={{ fontFamily: "'Jost', system-ui, sans-serif" }} />
              </div>
            </div>
          </>
        ) : (
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-ink/60 mb-1.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Message Body</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={4} placeholder="Your SMS message…" className="w-full px-3 py-2 text-sm border border-mushroom/60 rounded-lg bg-white text-ink-dark outline-none focus:ring-2 focus:ring-ink/10 resize-none" style={{ fontFamily: "'Jost', system-ui, sans-serif" }} />
          </div>
        )}

        <p className="text-xs text-ink/50" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
          Campaign will be created as a draft in Klaviyo. You can design the template and schedule it from there.
        </p>

        {error && <p className="text-xs text-terracotta" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{error}</p>}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-mushroom/60 text-ink text-sm hover:bg-oatmilk transition-colors cursor-pointer" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Cancel</button>
          <button onClick={create} disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-ink-dark text-cream text-sm hover:bg-ink transition-colors disabled:opacity-40 cursor-pointer" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
            {saving ? 'Creating…' : 'Create Draft'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Klaviyo card ─────────────────────────────────────────────────────────────

const CAMPAIGN_STATUS_STYLES: Record<string, string> = {
  sent:     'bg-thyme-light text-thyme border border-thyme/30',
  sending:  'bg-blueberry-light text-blueberry border border-blueberry/30',
  draft:    'bg-oatmilk text-ink/60 border border-mushroom/40',
  queued:   'bg-butter-light text-ink-dark border border-butter/40',
  cancelled:'bg-mushroom/20 text-ink/50 border border-mushroom/40',
}

function KlaviyoDetailSidebar({
  pane,
  onClose,
}: {
  pane: NonNullable<DetailPane>
  onClose: () => void
}) {
  const [detail, setDetail] = useState<FlowDetail | CampaignDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDetail(null); setLoading(true); setError(null)
    const id = pane.type === 'flow' ? pane.flow.klaviyo_id : pane.campaign.klaviyo_id
    const url = pane.type === 'flow' ? `/api/klaviyo/flows/${id}` : `/api/klaviyo/campaigns/${id}`
    fetch(url)
      .then(r => r.json())
      .then(d => { setDetail(d); setLoading(false) })
      .catch(() => { setError('Failed to load'); setLoading(false) })
  }, [pane])

  const title = pane.type === 'flow' ? pane.flow.name : pane.campaign.name
  const status = pane.type === 'flow' ? pane.flow.status : pane.campaign.status
  const isLive = status === 'live' || status === 'sent' || status === 'sending'
  const messages: (FlowMessage | CampaignMessage)[] =
    detail && 'messages' in detail ? detail.messages : []

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-[1px]"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white shadow-2xl flex flex-col bottom-sheet-wrap md:top-0 md:left-auto md:w-[420px]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-mushroom/40 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-ink/50" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                {pane.type === 'flow' ? 'Automation' : 'Campaign'}
              </span>
              <span className={cn('text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full',
                isLive ? 'bg-thyme-light text-thyme border border-thyme/30' : 'bg-oatmilk text-ink/60 border border-mushroom/40'
              )} style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                {status}
              </span>
            </div>
            <h2 className="text-lg text-ink-dark leading-snug" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700 }}>
              {title}
            </h2>
            {pane.type === 'flow' && pane.flow.trigger_type && (
              <p className="text-xs text-ink/50 mt-0.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                Trigger: {pane.flow.trigger_type}
              </p>
            )}
            {pane.type === 'campaign' && (pane.campaign as KlaviyoCampaign).send_time && (
              <p className="text-xs text-ink/50 mt-0.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                Sent {format(parseISO((pane.campaign as KlaviyoCampaign).send_time!), 'MMM d, yyyy')}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-ink/40 hover:text-ink transition-colors cursor-pointer shrink-0 mt-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages list */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
          {loading && (
            <p className="text-sm text-ink/40" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Loading…</p>
          )}
          {error && (
            <p className="text-sm text-terracotta" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{error}</p>
          )}
          {!loading && !error && messages.length === 0 && (
            <p className="text-sm text-ink/40" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>No messages found.</p>
          )}
          {messages.map((msg, i) => {
            const isSms = 'body' in msg && !!(msg as FlowMessage).body && !msg.subject
            const actionStatus = 'action_status' in msg ? (msg as FlowMessage).action_status : (msg as CampaignMessage).status
            const fromLabel = 'from_label' in msg ? (msg as FlowMessage).from_label : (msg as CampaignMessage).from_label
            return (
              <div key={msg.id} className="rounded-xl border border-mushroom/50 bg-oatmilk/30 overflow-hidden">
                {/* Message header */}
                <div className="px-4 py-3 border-b border-mushroom/30 flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-ink-dark flex items-center justify-center shrink-0">
                    {isSms ? <MessageSquare className="w-3 h-3 text-cream" /> : <Mail className="w-3 h-3 text-cream" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-ink-dark truncate" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                      {pane.type === 'flow' ? `Step ${i + 1}` : 'Message'}{msg.name && msg.name !== msg.subject ? ` — ${msg.name}` : ''}
                    </p>
                  </div>
                  {actionStatus && (
                    <span className={cn('text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0',
                      actionStatus === 'live' || actionStatus === 'sent' ? 'bg-thyme-light text-thyme border border-thyme/30' : 'bg-oatmilk text-ink/60 border border-mushroom/40'
                    )} style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                      {actionStatus}
                    </span>
                  )}
                </div>
                {/* Message content */}
                <div className="px-4 py-3 space-y-2">
                  {msg.subject && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/40 mb-0.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Subject</p>
                      <p className="text-sm text-ink-dark font-medium" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{msg.subject}</p>
                    </div>
                  )}
                  {msg.preview_text && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/40 mb-0.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Preview Text</p>
                      <p className="text-xs text-ink/70 italic" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{msg.preview_text}</p>
                    </div>
                  )}
                  {'body' in msg && (msg as FlowMessage).body && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/40 mb-0.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Message</p>
                      <p className="text-xs text-ink/80" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{(msg as FlowMessage).body}</p>
                    </div>
                  )}
                  {msg.from_email && (
                    <p className="text-[10px] text-ink/50" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                      From: {fromLabel ? `${fromLabel} <${msg.from_email}>` : msg.from_email}
                    </p>
                  )}
                </div>
                {/* Email HTML preview */}
                {'html' in msg && (msg as FlowMessage).html && (
                  <div className="border-t border-mushroom/30 pt-3 px-4 pb-4">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/40 mb-2" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Email Preview</p>
                    <div className="rounded-lg overflow-hidden border border-mushroom/40 bg-white" style={{ height: 320 }}>
                      <iframe
                        srcDoc={(msg as FlowMessage).html!}
                        sandbox="allow-same-origin"
                        style={{ width: '200%', height: '640px', transform: 'scale(0.5)', transformOrigin: 'top left', border: 'none', pointerEvents: 'none' }}
                        title="Email preview"
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

function KlaviyoCard() {
  const [status, setStatus] = useState<KlaviyoStatus | null>(null)
  const [data, setData] = useState<KlaviyoData | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [showCampaignModal, setShowCampaignModal] = useState(false)
  const [detailPane, setDetailPane] = useState<DetailPane>(null)

  function loadStatus() {
    fetch('/api/klaviyo/connect').then(r => r.json()).then((s: KlaviyoStatus) => {
      setStatus(s)
      if (s.connected) {
        fetch('/api/klaviyo/data').then(r => r.json()).then((d: KlaviyoData) => setData(d))
      }
    })
  }

  useEffect(() => { loadStatus() }, [])

  async function handleSync() {
    setSyncing(true)
    try {
      await fetch('/api/klaviyo/sync', { method: 'POST' })
      loadStatus()
    } finally { setSyncing(false) }
  }

  const sent30 = data?.metrics['Received Email'] ?? 0
  const opens30 = data?.metrics['Opened Email'] ?? 0
  const clicks30 = data?.metrics['Clicked Email'] ?? 0
  const openRate = sent30 > 0 ? ((opens30 / sent30) * 100).toFixed(1) : null
  const clickRate = sent30 > 0 ? ((clicks30 / sent30) * 100).toFixed(1) : null
  const flowSent30 = data?.metrics['Received Flow Email'] ?? 0
  const flowOpens30 = data?.metrics['Opened Flow Email'] ?? 0
  const flowClicks30 = data?.metrics['Clicked Flow Email'] ?? 0
  const flowOpenRate = flowSent30 > 0 ? ((flowOpens30 / flowSent30) * 100).toFixed(1) : null
  const flowClickRate = flowSent30 > 0 ? ((flowClicks30 / flowSent30) * 100).toFixed(1) : null

  const sentCampaigns = data?.campaigns.filter(c => c.status === 'sent') ?? []
  const activeFlows = (data?.flows ?? []).filter(f => f.status === 'live')

  return (
    <>
      <div className="rounded-xl border border-mushroom/50 bg-white flex overflow-hidden">
        <div className="w-1 shrink-0 bg-sage" />
        <div className="flex-1 p-5 flex flex-col gap-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logos/klaviyo.svg" alt="Klaviyo" className="w-5 h-5 object-contain" />
              <span className="text-base font-semibold text-ink-dark" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Klaviyo</span>
            </div>
            <div className="flex items-center gap-2">
              {status?.connected && (
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border border-mushroom/50 text-ink/50 hover:text-ink hover:border-mushroom transition-colors disabled:opacity-40 cursor-pointer"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                >
                  <RefreshCw className={cn('w-2.5 h-2.5', syncing && 'animate-spin')} />
                  {syncing ? 'Syncing…' : 'Sync'}
                </button>
              )}
              {status === null ? (
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-mushroom/20 text-ink border border-mushroom/40" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Loading…</span>
              ) : status.connected ? (
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-thyme-light text-thyme border border-thyme/30" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Connected</span>
              ) : (
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-mushroom/20 text-ink border border-mushroom/40" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Not connected</span>
              )}
            </div>
          </div>

          {/* Description */}
          {!status?.connected && (
            <p className="text-sm text-ink-dark leading-relaxed" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
              Email subscribers, open rate, click rate, and campaign performance.
            </p>
          )}

          {/* Metrics row */}
          {status?.connected && data && (
            <div className="flex gap-4 flex-wrap">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-ink/60 mb-0.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Subscribers</p>
                <p className="text-sm font-semibold text-ink-dark tabular-nums" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{data.total_subscribers.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-ink/60 mb-0.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Open Rate (30d)</p>
                <p className="text-sm font-semibold text-thyme tabular-nums" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{openRate ? `${openRate}%` : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-ink/60 mb-0.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Click Rate (30d)</p>
                <p className="text-sm font-semibold text-ink-dark tabular-nums" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{clickRate ? `${clickRate}%` : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-ink/60 mb-0.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Sent (30d)</p>
                <p className="text-sm font-semibold text-ink-dark tabular-nums" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{sent30 > 0 ? sent30.toLocaleString() : '—'}</p>
              </div>
            </div>
          )}

          {/* Flow / automation metrics */}
          {status?.connected && data && flowSent30 > 0 && (
            <div className="flex gap-4 flex-wrap pt-2 border-t border-mushroom/30">
              <p className="w-full text-[10px] uppercase tracking-widest text-ink/50 mb-0" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Automation flows (30d)</p>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-ink/60 mb-0.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Sent</p>
                <p className="text-sm font-semibold text-ink-dark tabular-nums" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{flowSent30.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-ink/60 mb-0.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Open Rate</p>
                <p className="text-sm font-semibold text-thyme tabular-nums" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{flowOpenRate ? `${flowOpenRate}%` : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-ink/60 mb-0.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Click Rate</p>
                <p className="text-sm font-semibold text-ink-dark tabular-nums" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{flowClickRate ? `${flowClickRate}%` : '—'}</p>
              </div>
            </div>
          )}

          {/* Automations & campaigns — collapsible */}
          {status?.connected && (activeFlows.length > 0 || sentCampaigns.length > 0) && (
            <div>
              <button
                onClick={() => setExpanded(e => !e)}
                className="text-[10px] font-semibold uppercase tracking-widest text-ink/60 flex items-center gap-1 cursor-pointer hover:text-ink transition-colors"
                style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
              >
                Automations & Campaigns ({activeFlows.length + sentCampaigns.length})
                <span className="text-[10px]">{expanded ? '▲' : '▼'}</span>
              </button>
              {expanded && (
                <div className="mt-2 space-y-1.5">
                  {activeFlows.map(f => (
                    <div key={f.klaviyo_id} onClick={() => setDetailPane({ type: 'flow', flow: f })} className="flex items-start justify-between gap-3 text-xs bg-oatmilk/60 rounded-lg px-3 py-2 cursor-pointer hover:bg-oatmilk/80">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-ink-dark truncate" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>{f.name}</p>
                        {f.trigger_type && (
                          <p className="text-ink/60 mt-0.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Trigger: {f.trigger_type}</p>
                        )}
                      </div>
                      <span className={cn('text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0', f.status === 'live' ? 'bg-thyme-light text-thyme border border-thyme/30' : 'bg-oatmilk text-ink/60 border border-mushroom/40')} style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                        {f.status === 'live' ? 'Live' : f.status}
                      </span>
                    </div>
                  ))}
                  {sentCampaigns.slice(0, 8).map(c => (
                    <div key={c.klaviyo_id} onClick={() => setDetailPane({ type: 'campaign', campaign: c })} className="text-xs bg-oatmilk/60 rounded-lg px-3 py-2.5 cursor-pointer hover:bg-oatmilk/80">
                      <div className="flex items-start justify-between gap-3 mb-1.5">
                        <p className="font-semibold text-ink-dark truncate flex-1" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                          {c.subject ?? c.name}
                        </p>
                        <span className="text-[10px] text-ink/40 shrink-0" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                          {c.send_time ? format(parseISO(c.send_time), 'MMM d') : ''}
                        </span>
                      </div>
                      {/* Metrics row — shown if we have data */}
                      {(c.recipients ?? 0) > 0 && (
                        <div className="flex gap-3 flex-wrap">
                          {c.recipients != null && (
                            <span className="text-[10px] text-ink/50" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                              {fmtNum(c.recipients)} sent
                            </span>
                          )}
                          {c.open_rate != null && c.open_rate > 0 && (
                            <span className="text-[10px] font-semibold text-sage-700" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                              {Math.round(c.open_rate * 100)}% open
                            </span>
                          )}
                          {c.click_rate != null && c.click_rate > 0 && (
                            <span className="text-[10px] font-semibold text-ink/70" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                              {Math.round(c.click_rate * 100)}% click
                            </span>
                          )}
                          {c.revenue != null && c.revenue > 0 && (
                            <span className="text-[10px] font-semibold text-thyme" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                              {fmtCurrency(c.revenue)} rev
                            </span>
                          )}
                          {c.unsubscribes != null && c.unsubscribes > 0 && (
                            <span className="text-[10px] text-terracotta/70" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                              {c.unsubscribes} unsub
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sync time */}
          {status?.connected && status.last_synced_at && (
            <p className="text-[10px] text-ink/50" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
              Last synced {format(parseISO(status.last_synced_at), 'MMM d, h:mm a')}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            {!status?.connected ? (
              <button onClick={() => setShowModal(true)} className="self-start text-xs px-3 py-1.5 rounded-lg bg-ink-dark text-cream hover:bg-ink transition-colors cursor-pointer" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                Connect Klaviyo
              </button>
            ) : (
              <>
                <button onClick={handleSync} disabled={syncing} className="flex items-center gap-1.5 self-start text-xs px-3 py-1.5 rounded-lg bg-ink-dark text-cream hover:bg-ink transition-colors disabled:opacity-50 cursor-pointer" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                  <RefreshCw className={cn('w-3 h-3', syncing && 'animate-spin')} />
                  {syncing ? 'Syncing…' : 'Sync now'}
                </button>
                <a href="https://www.klaviyo.com/dashboard" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 self-start text-xs px-3 py-1.5 rounded-lg border border-mushroom/60 text-ink hover:bg-oatmilk transition-colors" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                  <ExternalLink className="w-3 h-3" /> Open Klaviyo
                </a>
                <button onClick={() => setShowCampaignModal(true)} className="self-start text-xs px-3 py-1.5 rounded-lg border border-mushroom/60 text-ink hover:bg-oatmilk transition-colors cursor-pointer" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                  + New Campaign
                </button>
                <button onClick={() => setShowModal(true)} className="self-start text-xs px-3 py-1.5 rounded-lg border border-mushroom/60 text-ink hover:bg-oatmilk transition-colors cursor-pointer" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                  Reconnect
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {showModal && (
        <KlaviyoConnectModal
          onClose={() => setShowModal(false)}
          onConnected={name => { setStatus({ connected: true, account_name: name }); loadStatus(); setShowModal(false) }}
        />
      )}
      {showCampaignModal && data && (
        <KlaviyoCampaignModal
          lists={data.lists}
          onClose={() => setShowCampaignModal(false)}
          onCreated={() => { setShowCampaignModal(false); loadStatus() }}
        />
      )}
      {detailPane && (
        <KlaviyoDetailSidebar pane={detailPane} onClose={() => setDetailPane(null)} />
      )}
    </>
  )
}

const CONTENT_ACCENTS = ['#9BAE9A', '#C27A54', '#78B7C5', '#F0D77A', '#C14B3A', '#F8AFA8', '#A0C66D', '#F5A623']

// ─── Brand Tab ────────────────────────────────────────────────────────────────

const BRAND_DEFAULTS: Record<string, string> = {
  'brand:mission': 'Weeknight Dinner Party brings the confidence of a great cook into your kitchen — one spice blend at a time.',
  'brand:voice': 'Confident, warm, and quietly clever. We make weeknight cooking feel elevated without making you feel like you have to try too hard. Witty product names, real-life scenarios, zero food snobbery.',
  'brand:target_customer': 'Home cooks who love to host but live busy lives. They want food that tastes impressive without complex techniques or hour-long prep. 25–45, health-conscious but indulgent, likely follows food accounts but doesn\'t consider themselves a "foodie."',
  'brand:positioning': 'The spice blend brand for people who cook with their personality, not their ego. Weeknight-worthy flavors with dinner-party results.',
  'brand:messages': '• Dinner party worthy, weeknight easy.\n• Your weeknight kitchen deserves a dinner party.\n• Spice blends that know their way around a kitchen.\n• Great cooking shouldn\'t require a culinary degree.\n• $1 from every jar feeds someone who needs it.',
  'brand:channels': 'DTC (Shopify direct), Wholesale (Faire + local delivery within 30 miles, no minimums), Amazon, Retail (select stores)',
  'brand:giving': '$1 from every jar sold is donated to hunger-relief causes. Built into the price — not a campaign, a commitment.',
  'brand:product_names': 'House Seasoning\nMake No Mis-Steak\nLet\'s Taco-Bout It\nChim Chim Churri\nJust Dill With It\nTop of the Morning\nHerbs of a Feather\nFor Every O-Cajun\nWing It On\nSweeten the Deal',
  'brand:retail_price': '$13.00',
  'brand:wholesale_price': '$10.00',
  'brand:jar_format': '8 oz glass',
}

const BRAND_ACCENT_COLORS = [
  '#C17A5E', // terracotta
  '#7A9E7E', // sage
  '#6B7C5C', // thyme
  '#E8C84A', // butter
  '#78B7C5', // blueberry
  '#D4688C', // candy
]

interface BrandPillar {
  key: string
  emoji: string
  title: string
  subtitle: string
  description: string
  percent: string
  color: string
}

const DEFAULT_BRAND_PILLARS: BrandPillar[] = [
  { key: 'elevation',   emoji: '✨', title: 'Accessible Elevation',    subtitle: 'Great flavor without the intimidation',    description: 'We make weeknight cooking feel elevated — not by making it harder, but by making it bolder.',             percent: '35%', color: '#C17A5E' },
  { key: 'real_life',   emoji: '🍳', title: 'Real Life, Real Food',     subtitle: 'For actual weeknights, not just occasions', description: 'We show up at 6:47pm when the kitchen is chaos and dinner still has to happen.',                         percent: '25%', color: '#7A9E7E' },
  { key: 'connection',  emoji: '🤝', title: 'Connection Through Food',  subtitle: 'Cooking as a way to bring people together',  description: 'Food is a love language. Our blends are the starting point for meals that become memories.',               percent: '25%', color: '#E8C84A' },
  { key: 'giving',      emoji: '💛', title: 'Give As You Go',           subtitle: 'Built-in impact, no extra steps',           description: '$1 per jar to hunger relief. Every purchase already includes the giving — no campaign required.',    percent: '15%', color: '#78B7C5' },
]

// Module-level style constants used by BrandTab / EditableField
const BT_FONT    = "'Jost', system-ui, sans-serif"
const BT_SERIF   = "'Cormorant Garamond', Georgia, serif"
const BT_INK     = '#2C2C2C'
const BT_INKL    = 'rgba(44,44,44,0.55)'
const BT_CREAM   = '#FAF8F4'
const BT_OATMILK = '#F2EDE5'
const BT_MUSH    = '#D8D2C6'
const BT_BORDER  = `1px solid ${BT_MUSH}`

interface EditableFieldProps {
  fieldKey: string
  label: string
  multiline?: boolean
  editing: string | null
  savedKey: string | null
  fields: Record<string, string>
  draft: string
  setEditing: (k: string | null) => void
  setDraft: (v: string) => void
  save: (key: string, val: string) => Promise<void>
  saving: boolean
}

function EditableField({ fieldKey, label, multiline = false, editing, savedKey, fields, draft, setEditing, setDraft, save, saving }: EditableFieldProps) {
  const isEditing = editing === fieldKey
  const isSaved   = savedKey === fieldKey
  const value     = fields[fieldKey] ?? ''
  const didPosition = useRef(false)
  if (!isEditing) didPosition.current = false

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontFamily: BT_FONT, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: BT_INKL }}>{label}</div>
        {!isEditing && (
          <button onClick={() => { setEditing(fieldKey); setDraft(value) }} style={{ fontFamily: BT_FONT, fontSize: 11, fontWeight: 600, color: BT_INKL, background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 8px', borderRadius: 4, textDecoration: 'underline' }}>
            Edit
          </button>
        )}
        {isSaved && <span style={{ fontFamily: BT_FONT, fontSize: 11, color: '#3A7A3A', fontWeight: 600 }}>✓ Saved</span>}
      </div>
      {isEditing ? (
        <div>
          {multiline
            ? <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={4} style={{ fontFamily: BT_FONT, fontSize: 14, color: BT_INK, background: '#fff', border: BT_BORDER, borderRadius: 7, padding: '9px 12px', width: '100%', outline: 'none', boxSizing: 'border-box' as const, resize: 'vertical', lineHeight: 1.6 }} ref={el => { if (el && !didPosition.current) { didPosition.current = true; el.focus(); el.setSelectionRange(el.value.length, el.value.length) } }} />
            : <input type="text" value={draft} onChange={e => setDraft(e.target.value)} style={{ fontFamily: BT_FONT, fontSize: 14, color: BT_INK, background: '#fff', border: BT_BORDER, borderRadius: 7, padding: '9px 12px', width: '100%', outline: 'none', boxSizing: 'border-box' as const }} ref={el => { if (el && !didPosition.current) { didPosition.current = true; el.focus(); el.setSelectionRange(el.value.length, el.value.length) } }} onKeyDown={e => { if (e.key === 'Enter') save(fieldKey, draft); if (e.key === 'Escape') setEditing(null) }} />
          }
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => save(fieldKey, draft)} disabled={saving} style={{ fontFamily: BT_FONT, fontWeight: 600, fontSize: 12.5, background: BT_INK, color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 6, cursor: 'pointer' }}>Save</button>
            <button onClick={() => setEditing(null)} style={{ fontFamily: BT_FONT, fontWeight: 600, fontSize: 12.5, color: BT_INKL, background: BT_CREAM, border: BT_BORDER, padding: '7px 14px', borderRadius: 6, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => { setEditing(fieldKey); setDraft(value) }}
          style={{ fontFamily: BT_FONT, fontSize: 14, color: BT_INK, lineHeight: 1.65, padding: '10px 14px', borderRadius: 8, background: BT_OATMILK, cursor: 'text', border: '1px solid transparent', whiteSpace: 'pre-wrap' as const }}
          title="Click to edit"
        >
          {value || <span style={{ color: BT_INKL, fontStyle: 'italic' }}>Click to add…</span>}
        </div>
      )}
    </div>
  )
}

function BrandTab() {
  const FONT   = BT_FONT
  const SERIF  = BT_SERIF
  const INK    = BT_INK
  const INK_LIGHT = BT_INKL
  const CREAM  = BT_CREAM
  const OATMILK = BT_OATMILK
  const MUSHROOM = BT_MUSH
  const BORDER = BT_BORDER

  const [fields, setFields] = useState<Record<string, string>>(BRAND_DEFAULTS)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [pillars, setPillars] = useState<PillarConfig[]>(DEFAULT_PILLARS)
  const [rhythm, setRhythm] = useState<RhythmDay[]>(DEFAULT_RHYTHM)
  const [pillarSaved, setPillarSaved] = useState(false)
  const [rhythmSaved, setRhythmSaved] = useState(false)

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then((data: Record<string, string>) => {
      const merged: Record<string, string> = { ...BRAND_DEFAULTS }
      for (const key of Object.keys(BRAND_DEFAULTS)) {
        if (data[key]) merged[key] = data[key]
      }
      setFields(merged)
    }).catch(() => {})
    fetch('/api/marketing/strategy').then(r => r.json()).then((data: Record<string, string>) => {
      if (data.pillars_config) {
        try {
          const parsed = JSON.parse(data.pillars_config) as PillarConfig[]
          setPillars(parsed.map(p => ({ ...p, ...(PILLAR_VISUAL[p.key] ?? PILLAR_VISUAL.community) })))
        } catch { /* use default */ }
      }
      if (data.weekly_rhythm_config) {
        try { setRhythm(JSON.parse(data.weekly_rhythm_config)) } catch { /* use default */ }
      }
    }).catch(() => {})
  }, [])

  async function handlePillarSave(updated: PillarConfig) {
    const next = pillars.map(p => p.key === updated.key ? updated : p)
    setPillars(next)
    await saveStrategyKey('pillars_config', JSON.stringify(next))
    setPillarSaved(true)
    setTimeout(() => setPillarSaved(false), 2000)
  }

  async function handleRhythmSave(updated: RhythmDay) {
    const next = rhythm.map(r => r.day === updated.day ? updated : r)
    setRhythm(next)
    await saveStrategyKey('weekly_rhythm_config', JSON.stringify(next))
    setRhythmSaved(true)
    setTimeout(() => setRhythmSaved(false), 2000)
  }

  async function save(key: string, value: string) {
    setSaving(true)
    try {
      await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: value }) })
      setFields(prev => ({ ...prev, [key]: value }))
      setSavedKey(key)
      setTimeout(() => setSavedKey(null), 2000)
    } finally { setSaving(false) }
    setEditing(null)
  }

  // Shared props passed to every EditableField in this tab
  const efProps = { editing, savedKey, fields, draft, setEditing, setDraft, save, saving }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Brand identity header */}
      <div style={{ background: '#fff', border: `1px solid ${MUSHROOM}`, borderRadius: 12, padding: '28px 28px 24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #C17A5E, #E8C84A, #7A9E7E, #78B7C5)' }} />
        <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: INK_LIGHT, marginBottom: 4 }}>Brand Identity</div>
        <div style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 600, color: INK, marginBottom: 20 }}>Weeknight Dinner Party</div>
        <EditableField {...efProps} fieldKey="brand:mission" label="Mission Statement" />
        <EditableField {...efProps} fieldKey="brand:positioning" label="Brand Positioning" />
      </div>

      {/* Two-column: Voice + Customer */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: '#fff', border: `1px solid ${MUSHROOM}`, borderRadius: 12, padding: '20px 22px' }}>
          <EditableField {...efProps} fieldKey="brand:voice" label="Voice & Tone" multiline />
          <EditableField {...efProps} fieldKey="brand:messages" label="Key Messages" multiline />
        </div>
        <div style={{ background: '#fff', border: `1px solid ${MUSHROOM}`, borderRadius: 12, padding: '20px 22px' }}>
          <EditableField {...efProps} fieldKey="brand:target_customer" label="Target Customer" multiline />
          <EditableField {...efProps} fieldKey="brand:channels" label="Sales Channels" multiline />
          <EditableField {...efProps} fieldKey="brand:giving" label="Mission / Giving" multiline />
        </div>
      </div>

      {/* Content Pillars — editable */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: INK_LIGHT }}>Content Pillars</div>
          {pillarSaved && <span style={{ fontFamily: FONT, fontSize: 11, color: '#3A7A3A', fontWeight: 600 }}>✓ Saved</span>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {pillars.map(p => (
            <PillarCard key={p.key} pillar={p} onSave={handlePillarSave} />
          ))}
        </div>
      </div>

      {/* Weekly Rhythm — editable */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: INK_LIGHT }}>Weekly Rhythm</div>
          {rhythmSaved && <span style={{ fontFamily: FONT, fontSize: 11, color: '#3A7A3A', fontWeight: 600 }}>✓ Saved</span>}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {rhythm.map(item => (
            <RhythmDayCell key={item.day} item={item} onSave={handleRhythmSave} />
          ))}
        </div>
      </div>

      {/* Product Line */}
      {(() => {
        const parsedNames = (fields['brand:product_names'] ?? '').split('\n').map(s => s.trim()).filter(Boolean)
        const retailRaw = fields['brand:retail_price'] ?? '$13.00'
        const wholesaleRaw = fields['brand:wholesale_price'] ?? '$10.00'

        // Click-to-edit helper for the price/format cells
        function PriceCell({ fk, label }: { fk: string; label: string }) {
          const isEdit = editing === fk
          return (
            <div>
              <div style={{ fontFamily: FONT, fontSize: 11, color: INK_LIGHT, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
              {isEdit ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    autoFocus
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') save(fk, draft); if (e.key === 'Escape') setEditing(null) }}
                    style={{ fontFamily: SERIF, fontSize: 20, color: INK, border: `1px solid ${MUSHROOM}`, borderRadius: 6, padding: '4px 8px', width: 90, outline: 'none' }}
                  />
                  <button onClick={() => save(fk, draft)} style={{ fontFamily: FONT, fontSize: 11, background: INK, color: '#fff', border: 'none', borderRadius: 5, padding: '4px 10px', cursor: 'pointer' }}>Save</button>
                  <button onClick={() => setEditing(null)} style={{ fontFamily: FONT, fontSize: 11, background: 'transparent', color: INK_LIGHT, border: 'none', cursor: 'pointer' }}>✕</button>
                </div>
              ) : (
                <div
                  onClick={() => { setEditing(fk); setDraft(fields[fk] ?? '') }}
                  title="Click to edit"
                  style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: INK, cursor: 'text', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  {fields[fk]}
                  <span style={{ fontFamily: FONT, fontSize: 10, color: INK_LIGHT, opacity: 0.5 }}>✎</span>
                </div>
              )}
            </div>
          )
        }

        return (
          <div style={{ background: '#fff', border: `1px solid ${MUSHROOM}`, borderRadius: 12, padding: '20px 24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: INK_LIGHT }}>
                Product Line — {parsedNames.length} Blend{parsedNames.length !== 1 ? 's' : ''}
              </div>
              {editing !== 'brand:product_names'
                ? <button onClick={() => { setEditing('brand:product_names'); setDraft(fields['brand:product_names'] ?? '') }} style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: INK_LIGHT, background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Edit Blends</button>
                : savedKey === 'brand:product_names' && <span style={{ fontFamily: FONT, fontSize: 11, color: '#3A7A3A', fontWeight: 600 }}>✓ Saved</span>
              }
            </div>

            {/* Pill display OR textarea editor */}
            {editing === 'brand:product_names' ? (
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontFamily: FONT, fontSize: 11, color: INK_LIGHT, marginBottom: 6 }}>One blend name per line:</p>
                <textarea
                  autoFocus
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  rows={Math.max(parsedNames.length + 1, 5)}
                  style={{ fontFamily: FONT, fontSize: 13, color: INK, background: '#fff', border: `1px solid ${MUSHROOM}`, borderRadius: 7, padding: '9px 12px', width: '100%', outline: 'none', boxSizing: 'border-box' as const, resize: 'vertical', lineHeight: 1.8 }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={() => save('brand:product_names', draft)} disabled={saving} style={{ fontFamily: FONT, fontWeight: 600, fontSize: 12.5, background: INK, color: '#fff', border: 'none', padding: '7px 14px', borderRadius: 6, cursor: 'pointer' }}>Save</button>
                  <button onClick={() => setEditing(null)} style={{ fontFamily: FONT, fontSize: 12.5, background: 'transparent', color: INK_LIGHT, border: `1px solid ${MUSHROOM}`, padding: '7px 12px', borderRadius: 6, cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {parsedNames.map((name, i) => (
                  <div key={name} style={{ padding: '6px 14px', borderRadius: 20, fontFamily: FONT, fontSize: 13, fontWeight: 600, color: '#fff', background: BRAND_ACCENT_COLORS[i % BRAND_ACCENT_COLORS.length] }}>
                    {name}
                  </div>
                ))}
              </div>
            )}

            {/* Pricing row — click-to-edit each cell */}
            <div style={{ display: 'flex', gap: 32, borderTop: `1px solid ${MUSHROOM}`, paddingTop: 14, flexWrap: 'wrap' as const }}>
              <PriceCell fk="brand:retail_price" label="Retail Price" />
              <PriceCell fk="brand:wholesale_price" label="Wholesale Price" />
              <PriceCell fk="brand:jar_format" label="Jar Format" />
            </div>
          </div>
        )
      })()}

    </div>
  )
}

// ─── Content Tab ──────────────────────────────────────────────────────────────

function ContentTab() {
  const [media, setMedia] = useState<IgMediaItem[]>([])
  const [stories, setStories] = useState<IgStory[]>([])
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/instagram/analytics')
      .then(r => { if (!r.ok) throw new Error('not ok'); return r.json() })
      .then((data: IgAnalytics) => {
        setMedia(data.media ?? [])
        setStories(data.stories ?? [])
        setLoading(false)
      })
      .catch(() => { setError(true); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center', color: 'rgba(116,116,116,0.7)', fontFamily: "'Jost', system-ui, sans-serif", fontSize: 14 }}>
        Loading posts…
      </div>
    )
  }

  if (error || media.length === 0) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', background: '#F9F7F4', borderRadius: 12, border: '1px dashed #D8D2C6' }}>
        <p style={{ fontFamily: "'Jost', system-ui, sans-serif", fontSize: 15, fontWeight: 600, color: '#2C2C2C', marginBottom: 6 }}>Instagram not connected</p>
        <p style={{ fontFamily: "'Jost', system-ui, sans-serif", fontSize: 13, color: 'rgba(116,116,116,0.8)' }}>Connect your Instagram account to see post performance here.</p>
      </div>
    )
  }

  const maxReach = Math.max(...media.map(p => p.insights?.reach ?? 0), 2)

  function getInsight(post: IgMediaItem, engRate: number, allMedia: IgMediaItem[]): string {
    const type = post.media_type?.toUpperCase()
    const saves = post.insights?.saved ?? 0
    const reach = post.insights?.reach ?? 1
    const plays = post.insights?.plays ?? 0
    const saveRate = (saves / reach) * 100
    const caption = post.caption ?? ''
    const hasRecipeKeyword = /recipe|cook|make|dinner|dish|blend|spice/i.test(caption)
    const hasQuestion = caption.includes('?')

    // Compare this post against median engagement across all posts
    const allRates = allMedia.map(p => {
      const r = p.insights?.reach ?? 1
      return ((p.like_count ?? 0) + (p.comments_count ?? 0)) / r * 100
    }).sort((a, b) => a - b)
    const median = allRates[Math.floor(allRates.length / 2)] ?? 2

    if (type === 'VIDEO' || type === 'REELS') {
      if (plays > reach * 1.5) return `Replayed ${Math.round(plays / reach * 10) / 10}× per viewer — strong hook. Repurpose this format for your next product launch.`
      if (engRate > median * 1.5) return `Top-performing reel — ${engRate.toFixed(1)}% engagement is ${Math.round(engRate / (median || 1))}× your average. Repost or create a Part 2.`
      if (engRate < median * 0.5) return `Below-average engagement for a reel. Try a faster hook in the first 2 seconds or add text overlay with a question.`
      return `Solid reel performance. Reels with a recipe reveal or "what I made tonight" hook tend to outperform talking-head formats.`
    }
    if (type === 'CAROUSEL_ALBUM') {
      if (saveRate > 3) return `${saveRate.toFixed(1)}% save rate — this carousel is being bookmarked. Recipe carousels with step-by-step format drive the highest saves.`
      if (engRate > median) return `Above-average carousel. Consider adding a CTA slide at the end (e.g. "Save this for tonight") to push saves higher.`
      return `Carousel engagement is moderate. Try leading with the finished dish and ending with a swipe prompt to boost slide completion rate.`
    }
    if (saveRate > 2) return `High save rate (${saveRate.toFixed(1)}%) — people are saving this for later. Lean into recipe and "how to use" content for saves.`
    if (hasRecipeKeyword && engRate > median) return `Recipe content is working — this is ${Math.round(engRate / (median || 1))}× your median engagement. More of this.`
    if (hasQuestion && engRate > median) return `Question-format caption drove strong engagement. Keep using questions to pull people into comments.`
    if (engRate > 5) return `Top post this period at ${engRate.toFixed(1)}% engagement. Identify the format, time of day, and caption style — replicate it.`
    if (engRate < 1) return `Low engagement. Check your posting time (Tue–Thu evenings work best for food content) and add a stronger CTA in the caption.`
    return `Consistent performer. Keep posting — the algorithm rewards accounts that post 4–5× per week with growing organic reach.`
  }

  return (
    <div>
      {/* Stories strip */}
      {stories.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <p style={{ fontFamily: "'Jost', system-ui, sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(116,116,116,0.7)', margin: 0 }}>
              Active Stories ({stories.length})
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {stories.map(story => {
              const dateStr = story.timestamp ? format(parseISO(story.timestamp), 'MMM d') : '—'
              return (
                <button
                  key={story.id}
                  onClick={() => setSelectedStoryId(story.id)}
                  style={{ position: 'relative', width: 100, height: 160, borderRadius: 10, overflow: 'hidden', background: '#F2EDE5', border: '1px solid rgba(216,210,198,0.6)', cursor: 'pointer', padding: 0, flexShrink: 0 }}
                >
                  {/* Placeholder always underneath */}
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#EDE8E0' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(116,116,116,0.35)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                    </svg>
                  </div>
                  {story.media_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={story.media_url}
                      alt=""
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  )}
                  <span style={{ position: 'absolute', top: 6, left: 6, fontFamily: "'Jost', system-ui, sans-serif", fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', background: '#F8AFA8', color: '#fff', borderRadius: 99, padding: '2px 6px' }}>
                    Live
                  </span>
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 100%)', padding: '20px 6px 6px' }}>
                    <p style={{ fontFamily: "'Jost', system-ui, sans-serif", fontSize: 9, color: '#fff', margin: '0 0 1px' }}>{dateStr}</p>
                    {story.insights?.reach !== undefined && (
                      <p style={{ fontFamily: "'Jost', system-ui, sans-serif", fontSize: 9, color: 'rgba(255,255,255,0.75)', margin: 0 }}>
                        {fmtNum(story.insights.reach)} reach
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
          {selectedStoryId && (
            <IgStorySidebar storyId={selectedStoryId} onClose={() => setSelectedStoryId(null)} />
          )}
        </div>
      )}

      {/* Summary header */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontFamily: "'Jost', system-ui, sans-serif", fontSize: 12, color: 'rgba(116,116,116,0.7)', margin: 0 }}>
          Showing your last {media.length} posts · sorted by most recent
        </p>
      </div>

      {/* 3-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {media.map((post, i) => {
          const rawReach = post.insights?.reach ?? 0
          const reach = rawReach > 0 ? rawReach : 1
          const likes = post.like_count ?? 0
          const comments = post.comments_count ?? 0
          const saves = post.insights?.saved ?? 0
          const engRate = rawReach > 1 ? ((likes + comments) / rawReach) * 100 : null
          const isOnBrand = (engRate ?? 0) >= 3 || (rawReach <= 1 && likes > 3)
          const accent = CONTENT_ACCENTS[i % CONTENT_ACCENTS.length]
          const reachPct = rawReach > 1 ? Math.round((rawReach / maxReach) * 100) : 0
          const dateStr = post.timestamp ? format(parseISO(post.timestamp), 'MMM d') : '—'
          const caption = post.caption ? (post.caption.length > 80 ? post.caption.slice(0, 80) + '…' : post.caption) : 'No caption'
          const insight = getInsight(post, engRate ?? 0, media)
          // Carousel albums return media_url via the /children fetch in the API route
          const thumbSrc = post.thumbnail_url ?? (['IMAGE', 'CAROUSEL_ALBUM'].includes(post.media_type?.toUpperCase() ?? '') ? post.media_url : undefined)
          const isVideo = post.media_type?.toUpperCase() === 'VIDEO' || post.media_type?.toUpperCase() === 'REELS'

          return (
            <div
              key={post.id}
              style={{
                background: '#FFFFFF', borderRadius: 10,
                border: '1px solid #E8E4DD', overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                display: 'flex', flexDirection: 'column',
              }}
            >
              {/* Thumbnail */}
              {thumbSrc ? (
                <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: '#F0EDE8', flexShrink: 0 }}>
                  <img
                    src={thumbSrc}
                    alt={caption}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    loading="lazy"
                  />
                  {isVideo && (
                    <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.55)', borderRadius: 4, padding: '2px 6px', fontFamily: "'Jost', system-ui, sans-serif", fontSize: 10, fontWeight: 700, color: '#fff', letterSpacing: '0.06em' }}>
                      REEL
                    </div>
                  )}
                  <div style={{ position: 'absolute', top: 8, right: 8 }}>
                    <span style={{
                      fontFamily: "'Jost', system-ui, sans-serif", fontSize: 10, fontWeight: 700,
                      padding: '2px 7px', borderRadius: 20,
                      background: isOnBrand ? 'rgba(58,122,58,0.9)' : 'rgba(184,75,42,0.9)',
                      color: '#fff',
                    }}>
                      {isOnBrand ? 'On-brand' : 'Needs work'}
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ width: '100%', paddingBottom: '56.25%', background: accent + '22', position: 'relative', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontFamily: "'Jost', system-ui, sans-serif", fontSize: 11, color: 'rgba(116,116,116,0.5)' }}>
                      {post.media_type ?? 'POST'}
                    </span>
                  </div>
                  <div style={{ position: 'absolute', top: 8, right: 8 }}>
                    <span style={{
                      fontFamily: "'Jost', system-ui, sans-serif", fontSize: 10, fontWeight: 700,
                      padding: '2px 7px', borderRadius: 20,
                      background: isOnBrand ? '#E8F3E8' : '#FDF0EC',
                      color: isOnBrand ? '#3A7A3A' : '#B84B2A',
                    }}>
                      {isOnBrand ? 'On-brand' : 'Needs work'}
                    </span>
                  </div>
                </div>
              )}

              {/* Accent stripe */}
              <div style={{ height: 3, background: accent, flexShrink: 0 }} />

              {/* Content */}
              <div style={{ flex: 1, padding: '12px 14px 14px' }}>
                {/* Date + type */}
                <p style={{ fontFamily: "'Jost', system-ui, sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'rgba(116,116,116,0.6)', marginBottom: 4 }}>
                  {dateStr} · {post.media_type ?? 'POST'}
                </p>

                {/* Caption */}
                <p style={{ fontFamily: "'Jost', system-ui, sans-serif", fontSize: 12.5, color: '#2C2C2C', lineHeight: 1.45, marginBottom: 10 }}>
                  {caption}
                </p>

                {/* Stats grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 8 }}>
                  {[
                    { label: 'Reach', value: rawReach > 1 ? fmtNum(rawReach) : '—' },
                    { label: 'Eng %', value: engRate !== null ? `${engRate.toFixed(1)}%` : '—' },
                    { label: 'Likes', value: fmtNum(likes) },
                    { label: 'Saves', value: fmtNum(saves) },
                  ].map(s => (
                    <div key={s.label} style={{ textAlign: 'center' as const, background: '#F8F6F2', borderRadius: 6, padding: '5px 4px' }}>
                      <p style={{ fontFamily: "'Jost', system-ui, sans-serif", fontSize: 9, color: 'rgba(116,116,116,0.7)', margin: '0 0 2px', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>{s.label}</p>
                      <p style={{ fontFamily: "'Jost', system-ui, sans-serif", fontSize: 13, fontWeight: 700, color: '#2C2C2C', margin: 0 }}>{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Reach bar */}
                <div style={{ background: '#F0EDE8', borderRadius: 4, height: 4, marginBottom: 8 }}>
                  <div style={{ width: `${reachPct}%`, height: '100%', background: accent, borderRadius: 4 }} />
                </div>

                {/* Insight */}
                <p style={{ fontFamily: "'Jost', system-ui, sans-serif", fontSize: 11.5, color: '#5A6B5A', lineHeight: 1.5, margin: 0, borderLeft: `3px solid ${accent}`, paddingLeft: 8 }}>
                  {insight}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface ChannelMetric { label: string; value: string; sub?: string }

interface KlaviyoOverviewData {
  lists?: { klaviyo_id: string; name: string; profile_count: number }[]
  campaigns?: { klaviyo_id: string; name: string; status: string; subject?: string; send_time?: string }[]
  flows?: { klaviyo_id: string; name: string; status: string; trigger_type?: string; updated?: string }[]
  metrics?: Record<string, number>
  total_subscribers?: number
}

function OverviewTab({ syncTrigger, onSyncDone }: { syncTrigger?: number; onSyncDone?: () => void }) {
  const FONT = "'Jost', system-ui, sans-serif"
  const SERIF = "'Cormorant Garamond', Georgia, serif"
  const INK = '#2C2C2C'
  const INK_LIGHT = 'rgba(44,44,44,0.55)'
  const OATMILK = '#F2EDE5'
  const MUSHROOM = '#D8D2C6'
  const BORDER = `1px solid ${MUSHROOM}`

  const [upcomingEvents, setUpcomingEvents] = useState<MarketingEvent[]>([])
  const [igMetrics, setIgMetrics] = useState<ChannelMetric[] | null>(null)
  const [metaMetrics, setMetaMetrics] = useState<ChannelMetric[] | null>(null)
  const [igConnected, setIgConnected] = useState<boolean | null>(null)
  const [metaConnected, setMetaConnected] = useState<boolean | null>(null)
  const [messagingConnected, setMessagingConnected] = useState<boolean | null>(null)
  const [klaviyoData, setKlaviyoData] = useState<KlaviyoOverviewData | null>(null)
  const [igSyncing, setIgSyncing] = useState(false)
  const [metaSyncing, setMetaSyncing] = useState(false)
  const [klaviyoSyncing, setKlaviyoSyncing] = useState(false)
  const [gaConnected, setGaConnected] = useState<boolean | null>(null)
  const [gaMetrics, setGaMetrics] = useState<ChannelMetric[] | null>(null)
  const [gaSyncing, setGaSyncing] = useState(false)
  type ChannelDrawer = 'instagram' | 'meta_ads' | 'messaging' | 'google_analytics' | 'shopify_campaigns' | null
  const [channelDrawer, setChannelDrawer] = useState<ChannelDrawer>(null)
  const [shopifyCampaigns, setShopifyCampaigns] = useState<ShopifyCampaignActivity[] | null>(null)
  const [shopifyCampaignsSyncing, setShopifyCampaignsSyncing] = useState(false)
  const [shopifyCampaignsScopeError, setShopifyCampaignsScopeError] = useState(false)


  function loadShopifyCampaigns() {
    setShopifyCampaignsSyncing(true)
    fetch('/api/shopify/campaigns').then(r => r.json()).then((d: { activities?: ShopifyCampaignActivity[]; error?: string }) => {
      if (d.error === 'scope_missing') { setShopifyCampaignsScopeError(true) }
      else { setShopifyCampaigns(d.activities ?? []); setShopifyCampaignsScopeError(false) }
    }).catch(() => {}).finally(() => setShopifyCampaignsSyncing(false))
  }

  function loadGaData() {
    setGaSyncing(true)
    setGaMetrics(null)
    fetch('/api/google-analytics/data?days=30').then(r => r.json()).then((d: GAData & { error?: string }) => {
      if (!d.error && d.summary) {
        setGaMetrics([
          { label: 'Sessions',    value: fmtNum(d.summary.sessions) },
          { label: 'New Users',   value: fmtNum(d.summary.newUsers) },
          { label: 'Bounce Rate', value: d.summary.bounceRate.toFixed(1) + '%' },
          { label: 'Top Channel', value: d.sources && d.sources[0] ? d.sources[0].channel : '\u2014' },
        ])
      }
    }).catch(() => {}).finally(() => setGaSyncing(false))
  }

  // Drill-down state hoisted to OverviewTab so nested MessagingSection doesn't lose it on re-renders
  type KFlow     = NonNullable<KlaviyoOverviewData['flows']>[0]
  type KCampaign = NonNullable<KlaviyoOverviewData['campaigns']>[0]
  interface FlowMsg {
    id: string; action_id: string; action_type: string; action_status: string
    name: string; subject: string | null; preview_text: string | null
    from_label: string | null; from_email: string | null
    body: string | null; html: string | null; created: string | null; updated: string | null
  }
  interface CampaignMsg {
    id: string; name: string; status: string
    subject: string | null; preview_text: string | null
    from_label: string | null; from_email: string | null
  }
  interface EngStats { received: number; opened: number; clicked: number }

  const [selectedFlow,     setSelectedFlow]     = useState<KFlow | null>(null)
  const [flowMsgs,         setFlowMsgs]         = useState<FlowMsg[] | null>(null)
  const [flowStats,        setFlowStats]        = useState<EngStats | null>(null)
  const [flowLoading,      setFlowLoading]      = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState<KCampaign | null>(null)
  const [campaignMsgs,     setCampaignMsgs]     = useState<CampaignMsg[] | null>(null)
  const [campaignStats,    setCampaignStats]    = useState<EngStats | null>(null)
  const [campaignLoading,  setCampaignLoading]  = useState(false)

  useEffect(() => {
    if (!selectedFlow) { setFlowMsgs(null); setFlowStats(null); return }
    setFlowLoading(true)
    fetch(`/api/klaviyo/flows/${selectedFlow.klaviyo_id}`)
      .then(r => r.json())
      .then((d: { messages: FlowMsg[]; stats: EngStats }) => {
        setFlowMsgs(d.messages ?? [])
        setFlowStats(d.stats ?? null)
      })
      .catch(() => { setFlowMsgs([]); setFlowStats(null) })
      .finally(() => setFlowLoading(false))
  }, [selectedFlow])

  useEffect(() => {
    if (!selectedCampaign) { setCampaignMsgs(null); setCampaignStats(null); return }
    setCampaignLoading(true)
    fetch(`/api/klaviyo/campaigns/${selectedCampaign.klaviyo_id}`)
      .then(r => r.json())
      .then((d: { messages: CampaignMsg[]; stats: EngStats }) => {
        setCampaignMsgs(d.messages ?? [])
        setCampaignStats(d.stats ?? null)
      })
      .catch(() => { setCampaignMsgs([]); setCampaignStats(null) })
      .finally(() => setCampaignLoading(false))
  }, [selectedCampaign])

  function loadIgData() {
    setIgSyncing(true)
    setIgMetrics(null)
    fetch('/api/instagram/analytics').then(r => r.json()).then((d: IgAnalytics) => {
      const posts = (d.media ?? []).filter(p => (p.insights?.reach ?? 0) > 1)
      const avgEng = posts.length > 0
        ? posts.reduce((sum, p) => sum + ((p.like_count ?? 0) + (p.comments_count ?? 0)) / p.insights!.reach! * 100, 0) / posts.length
        : null
      setIgMetrics([
        { label: 'Followers', value: fmtNum(d.profile?.followers_count) },
        { label: 'Avg Engagement', value: avgEng !== null ? `${avgEng.toFixed(1)}%` : '—' },
        { label: '30-day Reach', value: fmtNum(d.accountInsights?.reach30d) },
        { label: 'Posts Tracked', value: String(d.media?.length ?? 0) },
      ])
    }).catch(() => {}).finally(() => setIgSyncing(false))
  }

  function loadKlaviyoData() {
    setKlaviyoSyncing(true)
    setKlaviyoData(null)
    fetch('/api/klaviyo/sync', { method: 'POST' })
      .then(() => fetch('/api/klaviyo/data'))
      .then(r => r.json())
      .then((d: KlaviyoOverviewData) => setKlaviyoData(d))
      .catch(() => {})
      .finally(() => setKlaviyoSyncing(false))
  }

  function loadMetaData() {
    setMetaSyncing(true)
    setMetaMetrics(null)
    fetch('/api/meta-ads/analytics?days=30').then(r => r.json()).then((d: { summary?: { spend: number; impressions: number; clicks: number; roas?: number } }) => {
      const sum = d.summary
      setMetaMetrics([
        { label: '30-day Spend', value: sum ? `$${fmtNum(sum.spend)}` : '—' },
        { label: 'Impressions', value: fmtNum(sum?.impressions) },
        { label: 'Clicks', value: fmtNum(sum?.clicks) },
        { label: 'ROAS', value: sum?.roas ? `${sum.roas.toFixed(2)}x` : '—' },
      ])
    }).catch(() => {}).finally(() => setMetaSyncing(false))
  }

  useEffect(() => {
    fetch('/api/marketing/events').then(r => r.json()).then((events: MarketingEvent[]) => {
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const weekOut = addDays(today, 7)
      setUpcomingEvents(events.filter(e => { const d = parseISO(e.date); return d >= today && d <= weekOut }))
    }).catch(() => {})

    fetch('/api/instagram/status').then(r => r.json()).then((s: { connected: boolean }) => {
      setIgConnected(s.connected)
      if (s.connected) loadIgData()
    }).catch(() => setIgConnected(false))

    fetch('/api/klaviyo/connect').then(r => r.json()).then((s: { connected: boolean }) => {
      setMessagingConnected(s.connected)
      if (s.connected) {
        fetch('/api/klaviyo/data').then(r => r.json()).then((d: KlaviyoOverviewData) => {
          setKlaviyoData(d)
        }).catch(() => {})
      }
    }).catch(() => setMessagingConnected(false))

    fetch('/api/meta-ads/status').then(r => r.json()).then((s: { connected: boolean }) => {
      setMetaConnected(s.connected)
      if (s.connected) loadMetaData()
    }).catch(() => setMetaConnected(false))

    fetch('/api/google-analytics/status').then(r => r.json()).then((s: { connected: boolean }) => {
      setGaConnected(s.connected)
      if (s.connected) loadGaData()
    }).catch(() => setGaConnected(false))

    // Shopify Campaign Autopilot — load regardless (Shopify always connected)
    loadShopifyCampaigns()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync All — fires when parent increments syncTrigger
  useEffect(() => {
    if (!syncTrigger) return
    const syncs: Promise<void>[] = []
    if (igConnected) syncs.push(new Promise<void>(res => { loadIgData(); setTimeout(res, 3000) }))
    if (messagingConnected) syncs.push(new Promise<void>(res => { loadKlaviyoData(); setTimeout(res, 5000) }))
    if (metaConnected) syncs.push(new Promise<void>(res => { loadMetaData(); setTimeout(res, 3000) }))
    if (gaConnected) syncs.push(new Promise<void>(res => { loadGaData(); setTimeout(res, 3000) }))
    syncs.push(new Promise<void>(res => { loadShopifyCampaigns(); setTimeout(res, 3000) }))
    if (syncs.length === 0) { onSyncDone?.(); return }
    Promise.all(syncs).then(() => onSyncDone?.())
  }, [syncTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  function ChannelCard({ name, color, connected, metrics, onSync, syncing, onClick }: { name: string; color: string; connected: boolean | null; metrics: ChannelMetric[] | null; onSync?: () => void; syncing?: boolean; onClick?: () => void }) {
    const [hovered, setHovered] = useState(false)
    const isLoading = connected === null
    const isClickable = !!onClick && connected === true

    return (
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={isClickable ? onClick : undefined}
        style={{
          background: '#fff',
          border: hovered && isClickable ? `1px solid rgba(194,122,84,0.6)` : BORDER,
          borderRadius: 10,
          overflow: 'hidden',
          cursor: isClickable ? 'pointer' : 'default',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          boxShadow: hovered && isClickable ? '0 3px 14px rgba(44,44,44,0.08)' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: connected ? BORDER : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
            <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: INK }}>{name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {connected && onSync && (
              <button
                onClick={e => { e.stopPropagation(); onSync() }}
                disabled={syncing}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: syncing ? INK_LIGHT : INK_LIGHT, background: OATMILK, border: BORDER, padding: '3px 8px', borderRadius: 5, cursor: syncing ? 'default' : 'pointer', opacity: syncing ? 0.6 : 1 }}
              >
                <RefreshCw style={{ width: 10, height: 10, animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
                {syncing ? 'Syncing…' : 'Sync'}
              </button>
            )}
            {isLoading ? (
              <div style={{ width: 70, height: 20, borderRadius: 10, background: OATMILK }} />
            ) : connected ? (
              <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: '#3A7A3A', background: '#E8F3E8', padding: '3px 10px', borderRadius: 20 }}>Connected</span>
            ) : (
              <a href="/settings" style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: INK_LIGHT, textDecoration: 'none', background: OATMILK, border: BORDER, padding: '4px 10px', borderRadius: 6 }}>Connect in Settings →</a>
            )}
          </div>
        </div>
        {connected && metrics && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            {metrics.map((m, i) => (
              <div key={m.label} style={{
                padding: '12px 16px',
                borderRight: i % 2 === 0 ? BORDER : 'none',
                borderBottom: i < metrics.length - 2 ? BORDER : 'none',
              }}>
                <div style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase' as const, color: INK_LIGHT, marginBottom: 4 }}>{m.label}</div>
                <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: INK }}>{m.value}</div>
                {m.sub && <div style={{ fontFamily: FONT, fontSize: 11, color: INK_LIGHT }}>{m.sub}</div>}
              </div>
            ))}
          </div>
        )}
        {connected && !metrics && <div style={{ padding: '14px 18px', fontFamily: FONT, fontSize: 13, color: INK_LIGHT }}>Loading…</div>}
        {/* Drill-in hint */}
        {isClickable && metrics && (
          <div style={{
            padding: '8px 18px',
            borderTop: BORDER,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 4,
            opacity: hovered ? 1 : 0.45,
            transition: 'opacity 0.15s ease',
          }}>
            <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', color: '#C27A54' }}>Full analytics</span>
            <span style={{ fontSize: 10, color: '#C27A54' }}>→</span>
          </div>
        )}
      </div>
    )
  }

  // ── Messaging section (full, Klaviyo-backed) ────────────────────────────────
  function MessagingSection() {
    const received = klaviyoData?.metrics?.['Received Email'] ?? 0
    const opened   = klaviyoData?.metrics?.['Opened Email']   ?? 0
    const clicked  = klaviyoData?.metrics?.['Clicked Email']  ?? 0
    const openRate  = received > 0 ? (opened / received * 100).toFixed(1) : '—'
    const clickRate = received > 0 ? (clicked / received * 100).toFixed(1) : '—'
    const flowReceived = klaviyoData?.metrics?.['Received Flow Email'] ?? 0
    const flowOpened   = klaviyoData?.metrics?.['Opened Flow Email']   ?? 0
    const flowClicked  = klaviyoData?.metrics?.['Clicked Flow Email']  ?? 0
    const flowOpenRate  = flowReceived > 0 ? (flowOpened / flowReceived * 100).toFixed(1) : '—'
    const flowClickRate = flowReceived > 0 ? (flowClicked / flowReceived * 100).toFixed(1) : '—'
    const subs = klaviyoData?.total_subscribers ?? 0

    // Only show flows the user has actually configured (not Klaviyo's auto-generated drafts)
    const allFlows = klaviyoData?.flows ?? []
    const flows = allFlows.filter(f => f.status !== 'draft' || (f.trigger_type && f.trigger_type !== 'Unconfigured'))
    const liveFlows = flows.filter(f => f.status === 'live' || f.status === 'manual')

    const campaigns = klaviyoData?.campaigns ?? []
    const recentCampaigns = campaigns.slice(0, 5)

    const FLOW_STATUS_COLOR: Record<string, { bg: string; text: string }> = {
      live:     { bg: '#E8F3E8', text: '#3A7A3A' },
      manual:   { bg: '#EEF5FF', text: '#3A5FA0' },
      draft:    { bg: '#F5F5F0', text: '#747474' },
      archived: { bg: '#F5F0EC', text: '#A05030' },
    }
    const CAMPAIGN_STATUS_COLOR: Record<string, { bg: string; text: string }> = {
      Sent:      { bg: '#E8F3E8', text: '#3A7A3A' },
      Draft:     { bg: '#F5F5F0', text: '#747474' },
      Scheduled: { bg: '#EEF5FF', text: '#3A5FA0' },
      Cancelled: { bg: '#FDF0EC', text: '#B84B2A' },
    }
    const ACTION_LABEL: Record<string, string> = {
      'SEND_EMAIL': 'Email', 'SEND_SMS': 'SMS', 'EMAIL': 'Email', 'SMS': 'SMS',
    }

    // Shared engagement stats bar
    function EngRow({ stats, loading }: { stats: EngStats | null; loading: boolean }) {
      if (loading) return <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT, padding: '10px 0' }}>Loading stats…</p>
      if (!stats) return null
      const openPct  = stats.received > 0 ? (stats.opened  / stats.received * 100).toFixed(1) : null
      const clickPct = stats.received > 0 ? (stats.clicked / stats.received * 100).toFixed(1) : null
      const items = [
        { label: 'Sent',       value: fmtNum(stats.received) },
        { label: 'Open Rate',  value: openPct  ? `${openPct}%`  : stats.received > 0 ? '0.0%' : '—' },
        { label: 'Click Rate', value: clickPct ? `${clickPct}%` : stats.received > 0 ? '0.0%' : '—' },
      ]
      return (
        <div style={{ display: 'flex', gap: 0, borderTop: BORDER }}>
          {items.map((item, i) => (
            <div key={item.label} style={{ flex: 1, padding: '10px 14px', borderRight: i < items.length - 1 ? BORDER : 'none', background: '#FAFAF7' }}>
              <div style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: INK_LIGHT, marginBottom: 3 }}>{item.label}</div>
              <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: INK }}>{item.value}</div>
            </div>
          ))}
        </div>
      )
    }

    // Shared message step list
    function MsgSteps({ msgs }: { msgs: FlowMsg[] | CampaignMsg[] }) {
      if (msgs.length === 0) return <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT }}>No message content found.</p>
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(msgs as FlowMsg[]).map((msg, i) => {
            const typeLabel = ACTION_LABEL[(msg as FlowMsg).action_type ?? ''] ?? 'Email'
            const isSMS = typeLabel === 'SMS'
            return (
              <div key={msg.id} style={{ background: '#fff', border: BORDER, borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', background: OATMILK, borderBottom: (msg.subject || (msg as FlowMsg).preview_text || (msg as FlowMsg).body) ? BORDER : 'none' }}>
                  <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, color: '#fff', background: isSMS ? '#78B7C5' : '#C27A54', padding: '2px 8px', borderRadius: 10 }}>
                    {isSMS ? 'SMS' : 'EMAIL'}
                  </span>
                  <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: INK_LIGHT }}>Step {i + 1}</span>
                  {msg.name && msg.name !== msg.subject && <span style={{ fontFamily: FONT, fontSize: 11, color: INK_LIGHT }}>— {msg.name}</span>}
                  {msg.from_label && <span style={{ fontFamily: FONT, fontSize: 10, color: INK_LIGHT, marginLeft: 'auto' }}>From: {msg.from_label}</span>}
                </div>
                {(msg.subject || (msg as FlowMsg).preview_text || (msg as FlowMsg).body) && (
                  <div style={{ padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {msg.subject && (
                      <div>
                        <span style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: INK_LIGHT }}>Subject</span>
                        <p style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: INK, margin: '2px 0 0' }}>{msg.subject}</p>
                      </div>
                    )}
                    {(msg as FlowMsg).preview_text && (
                      <div>
                        <span style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: INK_LIGHT }}>Preview</span>
                        <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT, margin: '2px 0 0', fontStyle: 'italic' }}>{(msg as FlowMsg).preview_text}</p>
                      </div>
                    )}
                    {isSMS && (msg as FlowMsg).body && (
                      <div>
                        <span style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: INK_LIGHT }}>Message</span>
                        <div style={{ marginTop: 6, background: '#E8F4F8', borderRadius: '4px 14px 14px 14px', padding: '10px 13px', maxWidth: 320, border: '1px solid #B8DDE8' }}>
                          <p style={{ fontFamily: FONT, fontSize: 12, color: '#1a1a2e', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{(msg as FlowMsg).body}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {/* Email HTML preview rendered in a sandboxed iframe */}
                {!isSMS && (msg as FlowMsg).html && (
                  <div style={{ borderTop: BORDER }}>
                    <div style={{ padding: '7px 13px', background: '#F5EAE4', borderBottom: BORDER, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#C27A54' }}>Email Preview</span>
                      <span style={{ fontFamily: FONT, fontSize: 9, color: '#C27A54', opacity: 0.7 }}>as seen by customers</span>
                    </div>
                    <iframe
                      srcDoc={(msg as FlowMsg).html!}
                      sandbox="allow-same-origin"
                      style={{ width: '100%', height: 420, border: 'none', display: 'block', background: '#fff' }}
                      title={`Email preview: ${msg.subject ?? msg.name}`}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )
    }

    if (!messagingConnected) {
      return (
        <div style={{ background: '#fff', border: BORDER, borderRadius: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#C27A54' }} />
              <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: INK }}>Messaging</span>
              <span style={{ fontFamily: FONT, fontSize: 11, color: INK_LIGHT }}>Email · SMS · Automated Flows</span>
            </div>
            {messagingConnected === null
              ? <div style={{ width: 70, height: 20, borderRadius: 10, background: OATMILK }} />
              : <a href="/settings" style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: INK_LIGHT, textDecoration: 'none', background: OATMILK, border: BORDER, padding: '4px 10px', borderRadius: 6 }}>Connect in Settings →</a>
            }
          </div>
        </div>
      )
    }

    return (
      <div style={{ background: '#fff', border: BORDER, borderRadius: 10, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: BORDER }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#C27A54' }} />
            <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: 14, color: INK }}>Messaging</span>
            <span style={{ fontFamily: FONT, fontSize: 11, color: INK_LIGHT }}>Email · SMS · Automated Flows</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={loadKlaviyoData}
              disabled={klaviyoSyncing}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: INK_LIGHT, background: OATMILK, border: BORDER, padding: '3px 8px', borderRadius: 5, cursor: klaviyoSyncing ? 'default' : 'pointer', opacity: klaviyoSyncing ? 0.6 : 1 }}
            >
              <RefreshCw style={{ width: 10, height: 10, animation: klaviyoSyncing ? 'spin 1s linear infinite' : 'none' }} />
              {klaviyoSyncing ? 'Syncing…' : 'Sync'}
            </button>
            <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: '#3A7A3A', background: '#E8F3E8', padding: '3px 10px', borderRadius: 20 }}>Connected</span>
          </div>
        </div>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, borderBottom: BORDER }}>
          {[
            { label: 'Subscribers', value: fmtNum(subs), sub: 'email list' },
            { label: '30d Open Rate', value: openRate === '—' ? '—' : `${openRate}%`, sub: 'campaign emails' },
            { label: '30d Click Rate', value: clickRate === '—' ? '—' : `${clickRate}%`, sub: 'campaign emails' },
            { label: 'Active Flows', value: String(liveFlows.length), sub: `${flows.length} total` },
          ].map((m, i) => (
            <div key={m.label} style={{ padding: '14px 18px', borderRight: i < 3 ? BORDER : 'none' }}>
              <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: INK_LIGHT, marginBottom: 4 }}>{m.label}</div>
              <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: INK }}>{m.value}</div>
              <div style={{ fontFamily: FONT, fontSize: 11, color: INK_LIGHT }}>{m.sub}</div>
            </div>
          ))}
        </div>

        {/* Automation / flow metrics row */}
        {flowReceived > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, borderBottom: BORDER, background: '#FAFAF7' }}>
            {[
              { label: 'Flow Emails Sent (30d)', value: fmtNum(flowReceived), sub: 'automation sends' },
              { label: 'Flow Open Rate', value: flowOpenRate === '—' ? '—' : `${flowOpenRate}%`, sub: 'unique opens' },
              { label: 'Flow Click Rate', value: flowClickRate === '—' ? '—' : `${flowClickRate}%`, sub: 'unique clicks' },
            ].map((m, i) => (
              <div key={m.label} style={{ padding: '12px 18px', borderRight: i < 2 ? BORDER : 'none' }}>
                <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: INK_LIGHT, marginBottom: 3 }}>{m.label}</div>
                <div style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 600, color: INK }}>{m.value}</div>
                <div style={{ fontFamily: FONT, fontSize: 11, color: INK_LIGHT }}>{m.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* Automations + Campaigns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
          {/* Automations */}
          <div style={{ padding: '16px 18px', borderRight: BORDER }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: INK_LIGHT }}>Automations</span>
              <a
                href="https://www.klaviyo.com/flows"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, color: INK_LIGHT, textDecoration: 'none', background: OATMILK, border: BORDER, padding: '3px 8px', borderRadius: 5 }}
              >
                Open Klaviyo ↗
              </a>
            </div>
            {flows.length === 0 ? (
              <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT }}>No active flows.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {flows.map(f => {
                  const sc = FLOW_STATUS_COLOR[f.status] ?? FLOW_STATUS_COLOR.draft
                  const isSelected = selectedFlow?.klaviyo_id === f.klaviyo_id
                  return (
                    <div
                      key={f.klaviyo_id}
                      onClick={() => { setSelectedCampaign(null); setSelectedFlow(prev => prev?.klaviyo_id === f.klaviyo_id ? null : f) }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                        padding: '7px 10px', borderRadius: 7,
                        background: isSelected ? '#F5EAE4' : OATMILK,
                        border: isSelected ? '1px solid #C27A54' : '1px solid transparent',
                        cursor: 'pointer', transition: 'all 0.1s',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: isSelected ? '#C27A54' : INK, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</p>
                        {f.trigger_type && f.trigger_type !== 'Unconfigured' && <p style={{ fontFamily: FONT, fontSize: 10, color: INK_LIGHT, margin: 0 }}>{f.trigger_type}</p>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 10, background: sc.bg, color: sc.text, textTransform: 'uppercase' as const }}>{f.status}</span>
                        <span style={{ fontFamily: FONT, fontSize: 10, color: isSelected ? '#C27A54' : INK_LIGHT }}>{isSelected ? '▲' : '▼'}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Recent campaigns */}
          <div style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: INK_LIGHT }}>Recent Campaigns</span>
              <a
                href="https://www.klaviyo.com/campaigns"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, color: INK_LIGHT, textDecoration: 'none', background: OATMILK, border: BORDER, padding: '3px 8px', borderRadius: 5 }}
              >
                Open Klaviyo ↗
              </a>
            </div>
            {recentCampaigns.length === 0 ? (
              <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT }}>No campaigns yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {recentCampaigns.map(c => {
                  const sc = CAMPAIGN_STATUS_COLOR[c.status] ?? CAMPAIGN_STATUS_COLOR.Draft
                  const dateStr = c.send_time ? format(parseISO(c.send_time), 'MMM d, yyyy') : null
                  const isSelected = selectedCampaign?.klaviyo_id === c.klaviyo_id
                  return (
                    <div
                      key={c.klaviyo_id}
                      onClick={() => { setSelectedFlow(null); setSelectedCampaign(prev => prev?.klaviyo_id === c.klaviyo_id ? null : c) }}
                      style={{
                        padding: '7px 10px', borderRadius: 7,
                        background: isSelected ? '#F5EAE4' : OATMILK,
                        border: isSelected ? '1px solid #C27A54' : '1px solid transparent',
                        cursor: 'pointer', transition: 'all 0.1s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <p style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: isSelected ? '#C27A54' : INK, margin: 0, flex: 1, lineHeight: 1.3 }}>{c.subject ?? c.name}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                          <span style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 10, background: sc.bg, color: sc.text, textTransform: 'uppercase' as const }}>{c.status}</span>
                          <span style={{ fontFamily: FONT, fontSize: 10, color: isSelected ? '#C27A54' : INK_LIGHT }}>{isSelected ? '▲' : '▼'}</span>
                        </div>
                      </div>
                      {dateStr && <p style={{ fontFamily: FONT, fontSize: 10, color: INK_LIGHT, margin: '3px 0 0' }}>{dateStr}</p>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Detail panel — flow or campaign */}
        {(selectedFlow || selectedCampaign) && (() => {
          const isFlow = !!selectedFlow
          const item = isFlow ? selectedFlow! : selectedCampaign!
          const loading = isFlow ? flowLoading : campaignLoading
          const msgs = isFlow ? (flowMsgs ?? []) : (campaignMsgs ?? [])
          const stats = isFlow ? flowStats : campaignStats
          const klaviyoUrl = isFlow
            ? `https://www.klaviyo.com/flow/${item.klaviyo_id}/edit`
            : `https://www.klaviyo.com/campaign/${item.klaviyo_id}/edit`
          const trigger = isFlow ? (selectedFlow as KFlow).trigger_type : null
          const sendTime = !isFlow && (selectedCampaign as KCampaign).send_time
            ? format(parseISO((selectedCampaign as KCampaign).send_time!), 'MMM d, yyyy')
            : null

          return (
            <div style={{ borderTop: BORDER, background: '#FAFAF7' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: BORDER }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 600, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 380 }}>{item.name}</span>
                  {trigger && trigger !== 'Unconfigured' && <span style={{ fontFamily: FONT, fontSize: 10, color: INK_LIGHT, flexShrink: 0 }}>Trigger: {trigger}</span>}
                  {sendTime && <span style={{ fontFamily: FONT, fontSize: 10, color: INK_LIGHT, flexShrink: 0 }}>Sent {sendTime}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <a
                    href={klaviyoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: '#fff', background: '#C27A54', padding: '5px 12px', borderRadius: 6, textDecoration: 'none' }}
                  >
                    View in Klaviyo ↗
                  </a>
                  <button
                    onClick={() => { isFlow ? setSelectedFlow(null) : setSelectedCampaign(null) }}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: INK_LIGHT, fontSize: 18, lineHeight: 1, padding: '0 4px' }}
                  >×</button>
                </div>
              </div>

              {/* Engagement stats row */}
              <EngRow stats={stats} loading={loading} />

              {/* Message steps */}
              <div style={{ padding: '16px 18px' }}>
                {loading ? (
                  <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT }}>Loading content…</p>
                ) : (
                  <>
                    <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: INK_LIGHT, marginBottom: 10 }}>
                      {msgs.length} Message Step{msgs.length !== 1 ? 's' : ''}
                    </div>
                    <MsgSteps msgs={msgs} />
                  </>
                )}
              </div>
            </div>
          )
        })()}
      </div>
    )
  }

  // Build disconnected channel list for exception rail
  const disconnectedChannels: { label: string; key: ChannelDrawer }[] = [
    igConnected === false        ? { label: 'Instagram',        key: 'instagram'        } : null,
    metaConnected === false      ? { label: 'Meta Ads',         key: 'meta_ads'         } : null,
    messagingConnected === false  ? { label: 'Email/Klaviyo',    key: 'messaging'        } : null,
    gaConnected === false         ? { label: 'Google Analytics', key: 'google_analytics' } : null,
  ].filter(Boolean) as { label: string; key: ChannelDrawer }[]

  return (
    <div className="space-y-6">
      {/* Disconnected channels exception rail */}
      {disconnectedChannels.length > 0 && (
        <StatusRail
          severity="info"
          message={`${disconnectedChannels.length} channel${disconnectedChannels.length > 1 ? 's' : ''} not connected`}
          items={disconnectedChannels.map(c => ({
            label: c.label,
            onClick: () => setChannelDrawer(c.key),
          }))}
        />
      )}

      {/* Channel performance grid */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-ink mb-4" style={{ fontFamily: FONT, letterSpacing: '0.12em' }}>
          Channel Performance
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <ChannelCard name="Instagram" color="#E1306C" connected={igConnected} metrics={igMetrics} onSync={loadIgData} syncing={igSyncing} onClick={() => setChannelDrawer('instagram')} />
          <ChannelCard name="Meta Ads" color="#1877F2" connected={metaConnected} metrics={metaMetrics} onSync={loadMetaData} syncing={metaSyncing} onClick={() => setChannelDrawer('meta_ads')} />
          <ChannelCard
            name="Messaging"
            color="#C27A54"
            connected={messagingConnected}
            metrics={klaviyoData ? [
              { label: 'Subscribers',    value: fmtNum(klaviyoData.total_subscribers) },
              { label: 'Open Rate (30d)', value: (klaviyoData.metrics?.['Received Email'] ?? 0) > 0 ? ((klaviyoData.metrics!['Opened Email'] ?? 0) / (klaviyoData.metrics!['Received Email'] ?? 1) * 100).toFixed(1) + '%' : '\u2014' },
              { label: 'Click Rate (30d)', value: (klaviyoData.metrics?.['Received Email'] ?? 0) > 0 ? ((klaviyoData.metrics!['Clicked Email'] ?? 0) / (klaviyoData.metrics!['Received Email'] ?? 1) * 100).toFixed(1) + '%' : '\u2014' },
              { label: 'Active Flows',   value: String((klaviyoData.flows ?? []).filter((f: { status: string }) => f.status === 'live').length) },
            ] : null}
            onSync={loadKlaviyoData}
            syncing={klaviyoSyncing}
            onClick={() => setChannelDrawer('messaging')}
          />
          <ChannelCard name="Google Analytics" color="#E37400" connected={gaConnected} metrics={gaMetrics} onSync={loadGaData} syncing={gaSyncing} onClick={() => setChannelDrawer('google_analytics')} />
          <ChannelCard
            name="Shopify Campaigns"
            color="#96BF48"
            connected={shopifyCampaignsScopeError ? false : shopifyCampaigns !== null}
            metrics={shopifyCampaigns && shopifyCampaigns.length > 0 ? [
              { label: 'Campaigns',   value: String(shopifyCampaigns.length) },
              { label: 'Total Spend', value: fmtCurrency(shopifyCampaigns.reduce((s, c) => s + c.spent, 0)) },
              { label: 'Clicks',      value: fmtNum(shopifyCampaigns.reduce((s, c) => s + c.clicks, 0)) },
              { label: 'Impressions', value: fmtNum(shopifyCampaigns.reduce((s, c) => s + c.impressions, 0)) },
            ] : null}
            onSync={loadShopifyCampaigns}
            syncing={shopifyCampaignsSyncing}
            onClick={() => setChannelDrawer('shopify_campaigns')}
          />
        </div>
      </div>

      {/* Channel analytics drawers */}
      <DetailDrawer
        open={channelDrawer === 'instagram'}
        onClose={() => setChannelDrawer(null)}
        title="Instagram"
        subtitle="Post, story, and reel performance"
        width={680}
      >
        <InstagramCard />
      </DetailDrawer>

      <DetailDrawer
        open={channelDrawer === 'meta_ads'}
        onClose={() => setChannelDrawer(null)}
        title="Meta Ads"
        subtitle="Ad spend, ROAS, and campaign performance"
        width={680}
      >
        <MetaAdsCard />
      </DetailDrawer>

      <DetailDrawer
        open={channelDrawer === 'messaging'}
        onClose={() => setChannelDrawer(null)}
        title="Email & Messaging"
        subtitle="Klaviyo flows, campaigns, and engagement"
        width={700}
      >
        <KlaviyoDrawer />
      </DetailDrawer>

      <DetailDrawer
        open={channelDrawer === 'google_analytics'}
        onClose={() => setChannelDrawer(null)}
        title="Google Analytics"
        subtitle="Sessions, sources, and site performance"
        width={680}
      >
        <GADrawer />
      </DetailDrawer>

      <DetailDrawer
        open={channelDrawer === 'shopify_campaigns'}
        onClose={() => setChannelDrawer(null)}
        title="Shopify Campaigns"
        subtitle="Campaign Autopilot — spend, clicks, and impressions"
        width={680}
      >
        <ShopifyCampaignsCard
          campaigns={shopifyCampaigns}
          scopeError={shopifyCampaignsScopeError}
          syncing={shopifyCampaignsSyncing}
          onSync={loadShopifyCampaigns}
        />
      </DetailDrawer>

      {/* Upcoming content */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-ink mb-4" style={{ fontFamily: FONT, letterSpacing: '0.12em' }}>
          Upcoming Content — Next 7 Days
        </h2>
        {upcomingEvents.length === 0 ? (
          <div className="rounded-xl border border-mushroom/60 bg-white p-8 flex flex-col items-center justify-center gap-2">
            <p className="text-sm text-ink/50" style={{ fontFamily: FONT }}>No content scheduled for the next 7 days.</p>
            <p className="text-xs text-ink/30" style={{ fontFamily: FONT }}>Head to the Strategy tab to generate content ideas.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {upcomingEvents.map(event => (
              <div key={event.id} className="bg-white rounded-xl border border-mushroom/60 px-4 py-3 flex items-center gap-3">
                <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', PLATFORM_COLORS[event.platform] ?? 'bg-mushroom text-ink')} style={{ fontFamily: FONT }}>
                  {PLATFORM_LABELS[event.platform] ?? event.platform}
                </span>
                <span className="text-sm text-ink-dark flex-1" style={{ fontFamily: FONT, fontWeight: 500 }}>{event.title}</span>
                <span className="text-xs text-ink/60 shrink-0" style={{ fontFamily: FONT }}>{format(parseISO(event.date), 'EEE, MMM d')}</span>
                <span className={cn('text-[10px] px-2 py-0.5 rounded-full border shrink-0', EVENT_STATUS_COLORS[event.status] ?? 'bg-oatmilk text-ink')} style={{ fontFamily: FONT }}>
                  {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Strategy Tab ─────────────────────────────────────────────────────────────

// ─── Pillar / Rhythm types & defaults ────────────────────────────────────────

interface PillarConfig {
  key: string
  title: string
  subtitle: string
  description: string
  percent: string
  // visual config — fixed per key
  headerBg: string
  headerText: string
  border: string
  dot: string
}

interface RhythmDay {
  day: string
  focus: string
  color: string
}

const PILLAR_VISUAL: Record<string, Pick<PillarConfig, 'headerBg' | 'headerText' | 'border' | 'dot'>> = {
  tonights_dinner: { headerBg: 'bg-terracotta', headerText: 'text-white', border: 'border-terracotta/30', dot: 'bg-terracotta' },
  behind_the_jar:  { headerBg: 'bg-sage',       headerText: 'text-white', border: 'border-sage/30',       dot: 'bg-sage' },
  weeknight_life:  { headerBg: 'bg-butter',      headerText: 'text-ink-dark', border: 'border-butter/30', dot: 'bg-butter' },
  community:       { headerBg: 'bg-blueberry',   headerText: 'text-white', border: 'border-blueberry/30', dot: 'bg-blueberry' },
}

const DEFAULT_PILLARS: PillarConfig[] = [
  { key: 'tonights_dinner', title: "Tonight's Dinner", subtitle: '"Here\'s what I\'m making."', description: 'Recipe-first content. Hero reels, recipe cards, the plate.', percent: '35%', ...PILLAR_VISUAL.tonights_dinner },
  { key: 'behind_the_jar',  title: 'Behind the Jar',   subtitle: '"What\'s in here, and why."', description: 'Product storytelling. Ingredient spotlights, pairings, the why.', percent: '25%', ...PILLAR_VISUAL.behind_the_jar },
  { key: 'weeknight_life',  title: 'Weeknight Life',   subtitle: '"The kitchen at 6:47 PM."',  description: 'Tuesday Tired, pantry chaos, cook-with-me.', percent: '25%', ...PILLAR_VISUAL.weeknight_life },
  { key: 'community',       title: 'Community',         subtitle: '"What you made."',           description: 'Customer reposts, remixes, round-ups, Q&A.', percent: '15%', ...PILLAR_VISUAL.community },
]

const DEFAULT_RHYTHM: RhythmDay[] = [
  { day: 'Mon', focus: 'Weeknight Life',   color: 'bg-butter/60 text-ink-dark' },
  { day: 'Tue', focus: "Tonight's Dinner", color: 'bg-terracotta/20 text-terracotta' },
  { day: 'Wed', focus: 'Stories',           color: 'bg-mushroom/40 text-ink' },
  { day: 'Thu', focus: 'Behind the Jar',   color: 'bg-sage/20 text-sage' },
  { day: 'Fri', focus: 'Community',         color: 'bg-blueberry/15 text-blueberry' },
  { day: 'Sat', focus: 'The Plate',         color: 'bg-terracotta/20 text-terracotta' },
  { day: 'Sun', focus: 'Reader Q&A',        color: 'bg-blueberry/15 text-blueberry' },
]

const RHYTHM_COLOR_OPTIONS = [
  { label: 'Terracotta', value: 'bg-terracotta/20 text-terracotta' },
  { label: 'Sage',       value: 'bg-sage/20 text-sage' },
  { label: 'Butter',     value: 'bg-butter/60 text-ink-dark' },
  { label: 'Blueberry',  value: 'bg-blueberry/15 text-blueberry' },
  { label: 'Neutral',    value: 'bg-mushroom/40 text-ink' },
]

async function saveStrategyKey(section: string, content: string) {
  await fetch('/api/marketing/strategy', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ section, content }),
  })
}

// ─── Pillar card with inline editing ─────────────────────────────────────────

function PillarCard({
  pillar,
  onSave,
}: {
  pillar: PillarConfig
  onSave: (updated: PillarConfig) => void
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ title: pillar.title, subtitle: pillar.subtitle, description: pillar.description, percent: pillar.percent })
  const visual = PILLAR_VISUAL[pillar.key] ?? PILLAR_VISUAL.community

  function save() {
    onSave({ ...pillar, ...form, ...visual })
    setEditing(false)
  }

  function cancel() {
    setForm({ title: pillar.title, subtitle: pillar.subtitle, description: pillar.description, percent: pillar.percent })
    setEditing(false)
  }

  return (
    <div className={cn('rounded-xl border overflow-hidden', visual.border)}>
      {/* Header */}
      <div className={cn('px-5 py-3 flex items-center justify-between gap-2', visual.headerBg)}>
        {editing ? (
          <input
            autoFocus
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="flex-1 text-base font-bold bg-white/20 rounded px-2 py-0.5 outline-none placeholder:opacity-50 text-inherit"
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700, color: 'inherit' }}
            placeholder="Pillar name"
          />
        ) : (
          <span
            className={cn('text-base font-bold flex-1', visual.headerText)}
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700 }}
          >
            {pillar.title}
          </span>
        )}
        <div className="flex items-center gap-2 shrink-0">
          {editing ? (
            <input
              value={form.percent}
              onChange={e => setForm(f => ({ ...f, percent: e.target.value }))}
              className="w-14 text-xs font-semibold bg-white/20 rounded px-2 py-0.5 outline-none text-center text-inherit"
              style={{ fontFamily: "'Jost', system-ui, sans-serif", color: 'inherit' }}
              placeholder="35%"
            />
          ) : (
            <span className={cn('text-xs font-semibold opacity-80', visual.headerText)} style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
              {pillar.percent}
            </span>
          )}
          <button
            onClick={() => editing ? save() : setEditing(true)}
            className={cn('p-1 rounded transition-colors cursor-pointer', visual.headerText, 'opacity-60 hover:opacity-100')}
          >
            {editing ? <Check className="w-3.5 h-3.5" /> : <Edit2 className="w-3.5 h-3.5" />}
          </button>
          {editing && (
            <button onClick={cancel} className={cn('p-1 rounded transition-colors cursor-pointer', visual.headerText, 'opacity-60 hover:opacity-100')}>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="bg-white px-5 py-4 space-y-2">
        {editing ? (
          <>
            <input
              value={form.subtitle}
              onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))}
              className="w-full text-sm italic bg-oatmilk/40 border border-mushroom/50 rounded px-2 py-1 outline-none text-ink-dark placeholder:text-ink/30"
              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
              placeholder="Tagline e.g. &quot;Here's what I'm making.&quot;"
            />
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full text-xs bg-oatmilk/40 border border-mushroom/50 rounded px-2 py-1 outline-none resize-none text-ink/70 placeholder:text-ink/30 leading-relaxed"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
              placeholder="Describe what this pillar covers…"
            />
          </>
        ) : (
          <>
            <p className="text-sm text-ink-dark italic" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
              {pillar.subtitle}
            </p>
            <p className="text-xs text-ink/60 leading-relaxed" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
              {pillar.description}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Weekly rhythm day cell with inline editing ───────────────────────────────

function RhythmDayCell({
  item,
  onSave,
}: {
  item: RhythmDay
  onSave: (updated: RhythmDay) => void
}) {
  const [editing, setEditing] = useState(false)
  const [focus, setFocus] = useState(item.focus)
  const [color, setColor] = useState(item.color)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  function save() {
    onSave({ ...item, focus, color })
    setEditing(false)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') { setFocus(item.focus); setColor(item.color); setEditing(false) }
  }

  return (
    <div
      className={cn(
        'bg-white rounded-xl border border-mushroom/60 flex flex-col items-center py-3 px-1.5 gap-1.5 transition-shadow',
        editing && 'ring-2 ring-ink/20 shadow-sm'
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-widest text-ink/40" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
        {item.day}
      </span>

      {editing ? (
        <div className="w-full space-y-1" onClick={e => e.stopPropagation()}>
          <input
            ref={inputRef}
            value={focus}
            onChange={e => setFocus(e.target.value)}
            onKeyDown={handleKey}
            className="w-full text-[10px] text-center bg-oatmilk/60 border border-mushroom/60 rounded px-1 py-0.5 outline-none"
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            placeholder="Focus…"
          />
          <select
            value={color}
            onChange={e => setColor(e.target.value)}
            className="w-full text-[9px] bg-oatmilk/60 border border-mushroom/60 rounded px-1 py-0.5 outline-none cursor-pointer"
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
          >
            {RHYTHM_COLOR_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <div className="flex gap-1 justify-center pt-0.5">
            <button
              onClick={save}
              className="text-[9px] px-2 py-0.5 rounded bg-ink-dark text-cream cursor-pointer hover:bg-ink transition-colors"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            >
              Save
            </button>
            <button
              onClick={() => { setFocus(item.focus); setColor(item.color); setEditing(false) }}
              className="text-[9px] px-1.5 py-0.5 rounded text-ink hover:bg-oatmilk cursor-pointer transition-colors"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className={cn('text-[10px] text-center font-medium px-1.5 py-0.5 rounded-full leading-tight w-full cursor-pointer hover:opacity-80 transition-opacity group relative', color)}
          style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
          title="Click to edit"
        >
          {item.focus}
          <span className="absolute -top-0.5 -right-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Edit2 className="w-2.5 h-2.5 text-ink/40" />
          </span>
        </button>
      )}
    </div>
  )
}

function StrategySection({
  sectionKey,
  label,
  initialContent,
}: {
  sectionKey: string
  label: string
  initialContent: string
}) {
  const [content, setContent] = useState(initialContent)
  const [savedFlash, setSavedFlash] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setContent(initialContent)
  }, [initialContent])

  function handleChange(val: string) {
    setContent(val)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      await fetch('/api/marketing/strategy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: sectionKey, content: val }),
      })
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
    }, 800)
  }

  return (
    <div className="bg-white rounded-xl border border-mushroom/60 pl-5 pr-5 pt-5 pb-5 border-l-4 border-l-mushroom">
      <div className="flex items-center justify-between mb-3">
        <label
          className="text-lg text-ink-dark"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700 }}
        >
          {label}
        </label>
        <span
          className={cn(
            'text-xs transition-opacity duration-300',
            savedFlash ? 'opacity-100 text-thyme' : 'opacity-0'
          )}
          style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
        >
          Saved
        </span>
      </div>
      <textarea
        value={content}
        onChange={e => handleChange(e.target.value)}
        placeholder={`Describe your ${label.toLowerCase()}…`}
        rows={5}
        className="w-full px-3 py-2.5 text-sm bg-oatmilk/40 border border-mushroom/50 rounded-lg outline-none focus:ring-2 focus:ring-ink/15 focus:border-ink/30 text-ink-dark placeholder:text-ink/30 resize-none transition-all leading-relaxed"
        style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
      />
    </div>
  )
}

function StrategyTab() {
  const [strategy, setStrategy] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)
  const [pillars, setPillars] = useState<PillarConfig[]>(DEFAULT_PILLARS)
  const [rhythm, setRhythm] = useState<RhythmDay[]>(DEFAULT_RHYTHM)
  const [pillarSaved, setPillarSaved] = useState(false)
  const [rhythmSaved, setRhythmSaved] = useState(false)

  useEffect(() => {
    fetch('/api/marketing/strategy')
      .then(r => r.json())
      .then((data: Record<string, string>) => {
        setStrategy(data)
        if (data.pillars_config) {
          try {
            const parsed = JSON.parse(data.pillars_config) as PillarConfig[]
            // Re-apply fixed visuals in case they've drifted
            setPillars(parsed.map(p => ({ ...p, ...(PILLAR_VISUAL[p.key] ?? PILLAR_VISUAL.community) })))
          } catch { /* use default */ }
        }
        if (data.weekly_rhythm_config) {
          try { setRhythm(JSON.parse(data.weekly_rhythm_config)) } catch { /* use default */ }
        }
        setLoaded(true)
      })
  }, [])

  async function handlePillarSave(updated: PillarConfig) {
    const next = pillars.map(p => p.key === updated.key ? updated : p)
    setPillars(next)
    await saveStrategyKey('pillars_config', JSON.stringify(next))
    setPillarSaved(true)
    setTimeout(() => setPillarSaved(false), 2000)
  }

  async function handleRhythmSave(updated: RhythmDay) {
    const next = rhythm.map(r => r.day === updated.day ? updated : r)
    setRhythm(next)
    await saveStrategyKey('weekly_rhythm_config', JSON.stringify(next))
    setRhythmSaved(true)
    setTimeout(() => setRhythmSaved(false), 2000)
  }

  if (!loaded) {
    return (
      <div className="py-12 flex justify-center">
        <p className="text-sm text-ink/50" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Loading…</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">

      {/* ── Content Pillars ──────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p
            className="text-[10px] font-semibold uppercase tracking-widest text-ink/50"
            style={{ fontFamily: "'Jost', system-ui, sans-serif", letterSpacing: '0.14em' }}
          >
            Content Pillars
          </p>
          <span
            className={cn('text-xs transition-opacity duration-300', pillarSaved ? 'opacity-100 text-thyme' : 'opacity-0')}
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
          >
            Saved
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {pillars.map(p => (
            <PillarCard key={p.key} pillar={p} onSave={handlePillarSave} />
          ))}
        </div>
      </div>

      {/* ── Weekly Rhythm ────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p
            className="text-[10px] font-semibold uppercase tracking-widest text-ink/50"
            style={{ fontFamily: "'Jost', system-ui, sans-serif", letterSpacing: '0.14em' }}
          >
            Weekly Rhythm
          </p>
          <span
            className={cn('text-xs transition-opacity duration-300', rhythmSaved ? 'opacity-100 text-thyme' : 'opacity-0')}
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
          >
            Saved
          </span>
        </div>
        <div className="grid grid-cols-7 gap-2">
          {rhythm.map(item => (
            <RhythmDayCell key={item.day} item={item} onSave={handleRhythmSave} />
          ))}
        </div>
      </div>

      {/* ── Editable Strategy Sections ───────────────────────────────────── */}
      <div className="space-y-4">
        <p
          className="text-[10px] font-semibold uppercase tracking-widest text-ink/50"
          style={{ fontFamily: "'Jost', system-ui, sans-serif", letterSpacing: '0.14em' }}
        >
          Strategy Notes
        </p>
        {STRATEGY_SECTIONS.map(s => (
          <StrategySection
            key={s.key}
            sectionKey={s.key}
            label={s.label}
            initialContent={strategy[s.key] ?? ''}
          />
        ))}
      </div>

    </div>
  )
}

// ─── Goals Tab ────────────────────────────────────────────────────────────────

const CATEGORIES = ['revenue', 'growth', 'engagement', 'awareness', 'retention']
const CATEGORY_LABELS: Record<string, string> = {
  revenue: 'Revenue', growth: 'Growth', engagement: 'Engagement',
  awareness: 'Awareness', retention: 'Retention',
}

function GoalRow({
  goal,
  onUpdate,
  onDelete,
}: {
  goal: MarketingGoal
  onUpdate: (g: MarketingGoal) => void
  onDelete: (id: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ ...goal })

  const progress = goal.target_value && goal.target_value > 0
    ? Math.min(100, Math.round((goal.current_value / goal.target_value) * 100))
    : 0

  const progressBg: Record<string, string> = {
    revenue: 'bg-thyme', growth: 'bg-sage', engagement: 'bg-candy',
    awareness: 'bg-blueberry', retention: 'bg-terracotta',
  }

  async function save() {
    const res = await fetch(`/api/marketing/goals/${goal.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    onUpdate(await res.json())
    setEditing(false)
  }

  async function del() {
    await fetch(`/api/marketing/goals/${goal.id}`, { method: 'DELETE' })
    onDelete(goal.id)
  }

  if (editing) {
    return (
      <div className="bg-white rounded-xl border border-mushroom p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-[10px] uppercase tracking-widest text-ink mb-1" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Title</label>
            <input
              autoFocus
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full px-3 py-1.5 text-sm border border-mushroom/60 rounded-lg outline-none focus:ring-2 focus:ring-ink/15 bg-oatmilk/30 text-ink-dark"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-ink mb-1" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Category</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full px-3 py-1.5 text-sm border border-mushroom/60 rounded-lg outline-none bg-oatmilk/30 text-ink-dark cursor-pointer"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-ink mb-1" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Unit</label>
            <input
              value={form.unit}
              onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
              placeholder="e.g. subscribers, $, %"
              className="w-full px-3 py-1.5 text-sm border border-mushroom/60 rounded-lg outline-none focus:ring-2 focus:ring-ink/15 bg-oatmilk/30 text-ink-dark placeholder:text-ink/30"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-ink mb-1" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Current</label>
            <input
              type="number"
              value={form.current_value}
              onChange={e => setForm(f => ({ ...f, current_value: parseFloat(e.target.value) || 0 }))}
              className="w-full px-3 py-1.5 text-sm border border-mushroom/60 rounded-lg outline-none focus:ring-2 focus:ring-ink/15 bg-oatmilk/30 text-ink-dark"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-ink mb-1" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Target</label>
            <input
              type="number"
              value={form.target_value ?? ''}
              onChange={e => setForm(f => ({ ...f, target_value: parseFloat(e.target.value) || undefined }))}
              className="w-full px-3 py-1.5 text-sm border border-mushroom/60 rounded-lg outline-none focus:ring-2 focus:ring-ink/15 bg-oatmilk/30 text-ink-dark"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-ink mb-1" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Due Date</label>
            <input
              type="date"
              value={form.due_date ?? ''}
              onChange={e => setForm(f => ({ ...f, due_date: e.target.value || undefined }))}
              className="w-full px-3 py-1.5 text-sm border border-mushroom/60 rounded-lg outline-none focus:ring-2 focus:ring-ink/15 bg-oatmilk/30 text-ink-dark cursor-pointer"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={!form.title.trim()}
            className="text-xs px-3 py-1.5 rounded-lg bg-ink-dark text-cream hover:bg-ink transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
          >
            Save
          </button>
          <button
            onClick={() => { setEditing(false); setForm({ ...goal }) }}
            className="text-xs px-3 py-1.5 rounded-lg text-ink hover:text-ink-dark hover:bg-oatmilk transition-colors cursor-pointer"
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="group bg-white rounded-xl border border-mushroom/60 hover:border-mushroom hover:shadow-sm transition-all px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span
              className="text-sm font-semibold text-ink-dark"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            >
              {goal.title}
            </span>
            <span
              className={cn(
                'text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border',
                CATEGORY_COLORS[goal.category] ?? 'bg-oatmilk text-ink border-mushroom/60'
              )}
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            >
              {CATEGORY_LABELS[goal.category] ?? goal.category}
            </span>
          </div>
          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1.5 bg-mushroom/30 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', progressBg[goal.category] ?? 'bg-sage')}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span
              className="text-xs text-ink/60 shrink-0 tabular-nums"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            >
              {goal.current_value.toLocaleString()}{goal.unit ? ` ${goal.unit}` : ''} / {goal.target_value?.toLocaleString() ?? '—'}{goal.unit ? ` ${goal.unit}` : ''}
            </span>
            <span
              className="text-xs font-semibold text-ink-dark shrink-0 tabular-nums w-10 text-right"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            >
              {goal.target_value ? `${progress}%` : ''}
            </span>
          </div>
          {goal.due_date && (
            <p
              className="text-xs text-ink/50 mt-1.5"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            >
              Due {format(parseISO(goal.due_date), 'MMM d, yyyy')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 rounded-lg text-ink/50 hover:text-ink hover:bg-oatmilk transition-colors cursor-pointer"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={del}
            className="p-1.5 rounded-lg text-ink/50 hover:text-tomato hover:bg-oatmilk transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

function AddGoalForm({ onAdded }: { onAdded: (g: MarketingGoal) => void }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    title: '', category: 'growth', target_value: '', current_value: '0', unit: '', due_date: '',
  })
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    const res = await fetch('/api/marketing/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        category: form.category,
        target_value: form.target_value ? parseFloat(form.target_value) : null,
        current_value: parseFloat(form.current_value) || 0,
        unit: form.unit,
        due_date: form.due_date || null,
      }),
    })
    onAdded(await res.json())
    setForm({ title: '', category: 'growth', target_value: '', current_value: '0', unit: '', due_date: '' })
    setOpen(false)
    setSaving(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-3 w-full text-sm text-ink hover:text-ink-dark hover:bg-oatmilk rounded-xl border border-dashed border-mushroom transition-all cursor-pointer"
        style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
      >
        <Plus className="w-4 h-4" /> Add Goal
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-xl border border-mushroom p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-ink" style={{ fontFamily: "'Jost', system-ui, sans-serif", letterSpacing: '0.12em' }}>New Goal</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <input
            autoFocus
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
            placeholder="Goal title"
            className="w-full px-3 py-1.5 text-sm border border-mushroom/60 rounded-lg outline-none focus:ring-2 focus:ring-ink/15 bg-oatmilk/30 text-ink-dark placeholder:text-ink/30"
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
          />
        </div>
        <div>
          <select
            value={form.category}
            onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            className="w-full px-3 py-1.5 text-sm border border-mushroom/60 rounded-lg outline-none bg-oatmilk/30 text-ink-dark cursor-pointer"
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </div>
        <div>
          <input
            value={form.unit}
            onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
            placeholder="Unit (subscribers, $, %)"
            className="w-full px-3 py-1.5 text-sm border border-mushroom/60 rounded-lg outline-none focus:ring-2 focus:ring-ink/15 bg-oatmilk/30 text-ink-dark placeholder:text-ink/30"
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
          />
        </div>
        <div>
          <input
            type="number"
            value={form.current_value}
            onChange={e => setForm(f => ({ ...f, current_value: e.target.value }))}
            placeholder="Current"
            className="w-full px-3 py-1.5 text-sm border border-mushroom/60 rounded-lg outline-none focus:ring-2 focus:ring-ink/15 bg-oatmilk/30 text-ink-dark placeholder:text-ink/30"
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
          />
        </div>
        <div>
          <input
            type="number"
            value={form.target_value}
            onChange={e => setForm(f => ({ ...f, target_value: e.target.value }))}
            placeholder="Target"
            className="w-full px-3 py-1.5 text-sm border border-mushroom/60 rounded-lg outline-none focus:ring-2 focus:ring-ink/15 bg-oatmilk/30 text-ink-dark placeholder:text-ink/30"
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
          />
        </div>
        <div>
          <input
            type="date"
            value={form.due_date}
            onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
            className="w-full px-3 py-1.5 text-sm border border-mushroom/60 rounded-lg outline-none focus:ring-2 focus:ring-ink/15 bg-oatmilk/30 text-ink-dark cursor-pointer"
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || !form.title.trim()}
          className="text-xs px-3 py-1.5 rounded-lg bg-ink-dark text-cream hover:bg-ink transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
        >
          {saving ? 'Adding…' : 'Add Goal'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs px-3 py-1.5 rounded-lg text-ink hover:text-ink-dark hover:bg-oatmilk transition-colors cursor-pointer"
          style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function GoalsTab() {
  const [goals, setGoals] = useState<MarketingGoal[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/marketing/goals')
      .then(r => r.json())
      .then(data => { setGoals(data); setLoaded(true) })
  }, [])

  if (!loaded) {
    return (
      <div className="py-12 flex justify-center">
        <p className="text-sm text-ink/50" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Loading…</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <AddGoalForm onAdded={g => setGoals(prev => [g, ...prev])} />
      {goals.length === 0 ? (
        <div className="py-12 flex flex-col items-center gap-2">
          <p className="text-sm text-ink/50" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>No marketing goals yet.</p>
          <p className="text-xs text-ink/30" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Add your first goal above.</p>
        </div>
      ) : (
        goals.map(g => (
          <GoalRow
            key={g.id}
            goal={g}
            onUpdate={updated => setGoals(prev => prev.map(x => x.id === updated.id ? updated : x))}
            onDelete={id => setGoals(prev => prev.filter(x => x.id !== id))}
          />
        ))
      )}
    </div>
  )
}

// ─── Content Strategy Tab ─────────────────────────────────────────────────────

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const PLATFORMS = [
  'instagram', 'tiktok', 'facebook', 'email', 'meta_ads', 'google_ads', 'blog', 'wholesale',
]
const EVENT_TYPES = ['post', 'story', 'reel', 'campaign', 'newsletter', 'ad', 'blog_post', 'other']
const EVENT_TYPE_LABELS: Record<string, string> = {
  post: 'Post', story: 'Story', reel: 'Reel', campaign: 'Campaign',
  newsletter: 'Newsletter', ad: 'Ad', blog_post: 'Blog Post', other: 'Other',
}
const EVENT_STATUSES = ['planned', 'scheduled', 'published', 'cancelled']
const EVENT_STATUS_LABELS: Record<string, string> = {
  planned: 'Planned', scheduled: 'Scheduled', published: 'Published', cancelled: 'Cancelled',
}

interface EventFormState {
  title: string
  platform: string
  type: string
  status: string
  notes: string
}

const DEFAULT_EVENT_FORM: EventFormState = {
  title: '', platform: 'instagram', type: 'post', status: 'planned', notes: '',
}

const PILLAR_DOT_COLORS: Record<string, string> = {
  tonights_dinner: 'bg-terracotta',
  behind_the_jar:  'bg-sage',
  weeknight_life:  'bg-butter',
  community:       'bg-blueberry',
}

function EventChip({
  event,
  onClick,
  onDragStart,
  onDragEnd,
  isDragging,
  isSelected,
}: {
  event: MarketingEvent
  onClick: () => void
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
  isDragging?: boolean
  isSelected?: boolean
}) {
  const dotColor = event.pillar ? PILLAR_DOT_COLORS[event.pillar] : null
  return (
    <button
      draggable
      onDragStart={e => {
        e.dataTransfer.setData('text/plain', String(event.id))
        e.dataTransfer.effectAllowed = 'move'
        onDragStart?.(e)
      }}
      onDragEnd={onDragEnd}
      onClick={e => { e.stopPropagation(); onClick() }}
      className={cn(
        'w-full text-left text-[10px] font-medium px-1.5 py-0.5 rounded truncate leading-tight cursor-grab active:cursor-grabbing transition-opacity flex items-center gap-1',
        event.status === 'published'
          ? 'bg-thyme/15 text-thyme border border-thyme/30'
          : PLATFORM_COLORS[event.platform] ?? 'bg-mushroom text-ink',
        isDragging ? 'opacity-30' : 'hover:opacity-80',
        isSelected && 'ring-2 ring-ink-dark ring-offset-1',
      )}
      style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
      title={event.title}
    >
      {event.status === 'published'
        ? <Check className="w-2.5 h-2.5 shrink-0" strokeWidth={2.5} />
        : dotColor && <span className={cn('w-1.5 h-1.5 rounded-full shrink-0 opacity-90', dotColor)} />
      }
      <span className={cn('truncate', event.status === 'published' && 'line-through opacity-60')}>{event.title}</span>
    </button>
  )
}

function AttachmentsPanel({ eventId }: { eventId: number }) {
  const [attachments, setAttachments] = useState<EventAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState<EventAttachment | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/marketing/events/${eventId}/attachments`)
      .then(r => r.json())
      .then(setAttachments)
  }, [eventId])

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/marketing/events/${eventId}/attachments`, { method: 'POST', body: fd })
      const att = await res.json() as EventAttachment
      setAttachments(prev => [...prev, att])
    }
    setUploading(false)
  }

  async function remove(att: EventAttachment) {
    await fetch(`/api/marketing/events/${eventId}/attachments/${att.id}`, { method: 'DELETE' })
    setAttachments(prev => prev.filter(a => a.id !== att.id))
  }

  function isImage(att: EventAttachment) {
    return att.mime_type?.startsWith('image/') ?? /\.(png|jpe?g|gif|webp|svg)$/i.test(att.original_name)
  }

  function fileUrl(att: EventAttachment) {
    return `/uploads/event-attachments/${att.filename}`
  }

  function formatSize(bytes: number | null) {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/40" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
          Attachments {attachments.length > 0 && `(${attachments.length})`}
        </p>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-oatmilk border border-mushroom/60 text-ink hover:bg-mushroom/20 transition-colors cursor-pointer disabled:opacity-40"
          style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
        >
          <Plus className="w-3 h-3" />
          {uploading ? 'Uploading…' : 'Add'}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.pptx,.mp4,.mov"
          className="hidden"
          onChange={e => upload(e.target.files)}
        />
      </div>

      {attachments.length === 0 ? (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full border border-dashed border-mushroom/60 rounded-lg py-3 flex flex-col items-center gap-1 text-ink/30 hover:text-ink/50 hover:border-mushroom transition-colors cursor-pointer"
        >
          <Paperclip className="w-4 h-4" />
          <span className="text-[10px]" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Drop files or click to upload</span>
        </button>
      ) : (
        <div className="space-y-1">
          {/* Image thumbnails grid */}
          {attachments.filter(isImage).length > 0 && (
            <div className="grid grid-cols-3 gap-1 mb-1">
              {attachments.filter(isImage).map(att => (
                <div key={att.id} className="group relative aspect-square rounded-md overflow-hidden bg-oatmilk border border-mushroom/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fileUrl(att)}
                    alt={att.original_name}
                    className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => setLightbox(att)}
                  />
                  <button
                    onClick={() => remove(att)}
                    className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 bg-black/60 rounded-full flex items-center justify-center text-white cursor-pointer"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* Non-image files list */}
          {attachments.filter(a => !isImage(a)).map(att => (
            <div key={att.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-oatmilk/50 border border-mushroom/30 group">
              <FileText className="w-3.5 h-3.5 text-ink/40 shrink-0" />
              <span className="text-[10px] text-ink-dark flex-1 truncate" style={{ fontFamily: "'Jost', system-ui, sans-serif" }} title={att.original_name}>
                {att.original_name}
              </span>
              {att.size && (
                <span className="text-[9px] text-ink/30 shrink-0" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                  {formatSize(att.size)}
                </span>
              )}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <a
                  href={fileUrl(att)}
                  download={att.original_name}
                  className="text-ink/40 hover:text-ink transition-colors cursor-pointer"
                  onClick={e => e.stopPropagation()}
                >
                  <Download className="w-3 h-3" />
                </a>
                <button onClick={() => remove(att)} className="text-ink/40 hover:text-terracotta transition-colors cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={fileUrl(lightbox)}
              alt={lightbox.original_name}
              className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-black/50 rounded-b-xl px-4 py-2 flex items-center justify-between">
              <span className="text-white text-xs truncate" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                {lightbox.original_name}
              </span>
              <div className="flex gap-2 shrink-0">
                <a
                  href={fileUrl(lightbox)}
                  download={lightbox.original_name}
                  className="text-white/70 hover:text-white transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                </a>
                <button onClick={() => setLightbox(null)} className="text-white/70 hover:text-white transition-colors cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EventSidebar({
  event,
  onClose,
  onUpdate,
  onDelete,
}: {
  event: MarketingEvent
  onClose: () => void
  onUpdate: (e: MarketingEvent) => void
  onDelete: (id: number) => void
}) {
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({
    title: event.title,
    date: event.date,
    platform: event.platform,
    type: event.type,
    status: event.status,
    notes: event.notes ?? '',
    pillar: event.pillar ?? '',
  })

  // Keep form in sync if a different event is selected
  useEffect(() => {
    setForm({
      title: event.title,
      date: event.date,
      platform: event.platform,
      type: event.type,
      status: event.status,
      notes: event.notes ?? '',
      pillar: event.pillar ?? '',
    })
    setSaved(false)
  }, [event.id])  // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!form.title.trim()) return
    setSaving(true)
    const res = await fetch(`/api/marketing/events/${event.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, notes: form.notes || null, pillar: form.pillar || null }),
    })
    const updated = await res.json() as MarketingEvent
    onUpdate(updated)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function del() {
    setDeleting(true)
    await fetch(`/api/marketing/events/${event.id}`, { method: 'DELETE' })
    onDelete(event.id)
  }

  const PILLAR_OPTIONS = [
    { value: '', label: 'None' },
    { value: 'tonights_dinner', label: "Tonight's Dinner" },
    { value: 'behind_the_jar', label: 'Behind the Jar' },
    { value: 'weeknight_life', label: 'Weeknight Life' },
    { value: 'community', label: 'Community' },
  ]

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-ink/10 backdrop-blur-[1px]" onClick={onClose} />

      {/* Panel — stopPropagation prevents clicks here from bubbling to CalendarTab's closeAll handler */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white shadow-2xl flex flex-col bottom-sheet-wrap md:top-0 md:left-auto md:w-[400px]" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-5 border-b border-mushroom/40 flex items-start justify-between gap-3 shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/40 mb-1" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
              Calendar Event
            </p>
            <h2 className="text-xl text-ink-dark leading-snug" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700 }}>
              {event.title}
            </h2>
            <p className="text-xs text-ink/50 mt-0.5" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
              {format(parseISO(event.date), 'EEEE, MMMM d yyyy')}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-ink/40 hover:text-ink hover:bg-oatmilk transition-colors cursor-pointer shrink-0 mt-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mark as posted banner */}
        {form.status !== 'published' ? (
          <div className="px-6 py-3 border-b border-mushroom/30 shrink-0">
            <button
              onClick={async () => {
                setSaving(true)
                const res = await fetch(`/api/marketing/events/${event.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ...form, status: 'published', notes: form.notes || null, pillar: form.pillar || null }),
                })
                const updated = await res.json() as MarketingEvent
                setForm(f => ({ ...f, status: 'published' }))
                onUpdate(updated)
                setSaving(false)
              }}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-thyme text-white text-sm font-semibold hover:bg-thyme/90 transition-colors cursor-pointer disabled:opacity-50"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            >
              <Check className="w-4 h-4" strokeWidth={2.5} />
              Mark as posted
            </button>
          </div>
        ) : (
          <div className="px-6 py-3 border-b border-mushroom/30 shrink-0 flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-thyme/10 border border-thyme/30">
              <Check className="w-4 h-4 text-thyme shrink-0" strokeWidth={2.5} />
              <span className="text-sm font-semibold text-thyme" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Posted</span>
            </div>
            <button
              onClick={async () => {
                setSaving(true)
                const res = await fetch(`/api/marketing/events/${event.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ...form, status: 'planned', notes: form.notes || null, pillar: form.pillar || null }),
                })
                const updated = await res.json() as MarketingEvent
                setForm(f => ({ ...f, status: 'planned' }))
                onUpdate(updated)
                setSaving(false)
              }}
              disabled={saving}
              className="text-xs text-ink/50 hover:text-ink transition-colors cursor-pointer px-2 py-1 rounded-lg hover:bg-oatmilk"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            >
              Undo
            </button>
          </div>
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── Edit fields ── */}
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-ink/40" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
              Details
            </p>

            {/* Title */}
            <div>
              <label className="block text-xs text-ink/50 mb-1" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Title</label>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-mushroom/60 rounded-lg bg-oatmilk/30 text-ink-dark outline-none focus:ring-2 focus:ring-ink/15 placeholder:text-ink/30"
                style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                placeholder="Event title"
              />
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs text-ink/50 mb-1" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Date</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-mushroom/60 rounded-lg bg-oatmilk/30 text-ink-dark outline-none focus:ring-2 focus:ring-ink/15 cursor-pointer"
                style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
              />
            </div>

            {/* Platform + Type side by side */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-ink/50 mb-1" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Platform</label>
                <select
                  value={form.platform}
                  onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-mushroom/60 rounded-lg bg-oatmilk/30 text-ink-dark outline-none focus:ring-2 focus:ring-ink/15 cursor-pointer"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                >
                  {PLATFORMS.map(p => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-ink/50 mb-1" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Type</label>
                <select
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-mushroom/60 rounded-lg bg-oatmilk/30 text-ink-dark outline-none focus:ring-2 focus:ring-ink/15 cursor-pointer"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                >
                  {EVENT_TYPES.map(t => <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>)}
                </select>
              </div>
            </div>

            {/* Status + Pillar side by side */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-ink/50 mb-1" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Status</label>
                <select
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-mushroom/60 rounded-lg bg-oatmilk/30 text-ink-dark outline-none focus:ring-2 focus:ring-ink/15 cursor-pointer"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                >
                  {EVENT_STATUSES.map(s => <option key={s} value={s}>{EVENT_STATUS_LABELS[s]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-ink/50 mb-1" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Pillar</label>
                <select
                  value={form.pillar}
                  onChange={e => setForm(f => ({ ...f, pillar: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-mushroom/60 rounded-lg bg-oatmilk/30 text-ink-dark outline-none focus:ring-2 focus:ring-ink/15 cursor-pointer"
                  style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
                >
                  {PILLAR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs text-ink/50 mb-1" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>Notes</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Add notes, copy, or context…"
                rows={4}
                className="w-full px-3 py-2 text-sm border border-mushroom/60 rounded-lg bg-oatmilk/30 text-ink-dark outline-none focus:ring-2 focus:ring-ink/15 resize-none placeholder:text-ink/30 leading-relaxed"
                style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
              />
            </div>
          </div>

          {/* ── Attachments ── */}
          <div className="border-t border-mushroom/30 pt-5">
            <AttachmentsPanel eventId={event.id} />
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-mushroom/40 flex items-center justify-between gap-3 shrink-0 bg-white">
          <button
            onClick={del}
            disabled={deleting}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg text-ink/50 hover:text-terracotta hover:bg-oatmilk transition-colors cursor-pointer disabled:opacity-40"
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
          <div className="flex items-center gap-2">
            <span
              className={cn('text-xs transition-opacity duration-300', saved ? 'opacity-100 text-thyme' : 'opacity-0')}
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            >
              Saved
            </span>
            <button
              onClick={save}
              disabled={saving || !form.title.trim()}
              className="text-sm px-4 py-2 rounded-lg bg-ink-dark text-cream hover:bg-ink transition-colors cursor-pointer disabled:opacity-40 font-medium"
              style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function AddEventPopover({
  date,
  onClose,
  onAdded,
}: {
  date: Date
  onClose: () => void
  onAdded: (e: MarketingEvent) => void
}) {
  const [form, setForm] = useState<EventFormState>({ ...DEFAULT_EVENT_FORM })
  const [saving, setSaving] = useState(false)

  async function submit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    const res = await fetch('/api/marketing/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, date: format(date, 'yyyy-MM-dd'), notes: form.notes || null }),
    })
    onAdded(await res.json())
    setSaving(false)
    onClose()
  }

  return (
    <div
      className="absolute z-30 top-full mt-1 left-0 w-60 bg-white rounded-xl border border-mushroom shadow-lg p-4 space-y-2"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ink-dark" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
          {format(date, 'EEE, MMM d')}
        </p>
        <button onClick={onClose} className="text-ink/40 hover:text-ink cursor-pointer"><X className="w-3.5 h-3.5" /></button>
      </div>
      <form onSubmit={submit} className="space-y-2">
        <input
          autoFocus
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Escape') onClose() }}
          placeholder="Event title"
          className="w-full px-2 py-1 text-xs border border-mushroom/60 rounded-lg bg-oatmilk/30 text-ink-dark outline-none placeholder:text-ink/30"
          style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
        />
        <select
          value={form.platform}
          onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
          className="w-full px-2 py-1 text-xs border border-mushroom/60 rounded-lg bg-oatmilk/30 text-ink-dark outline-none cursor-pointer"
          style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
        >
          {PLATFORMS.map(p => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
        </select>
        <select
          value={form.type}
          onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
          className="w-full px-2 py-1 text-xs border border-mushroom/60 rounded-lg bg-oatmilk/30 text-ink-dark outline-none cursor-pointer"
          style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
        >
          {EVENT_TYPES.map(t => <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>)}
        </select>
        <select
          value={form.status}
          onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
          className="w-full px-2 py-1 text-xs border border-mushroom/60 rounded-lg bg-oatmilk/30 text-ink-dark outline-none cursor-pointer"
          style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
        >
          {EVENT_STATUSES.map(s => <option key={s} value={s}>{EVENT_STATUS_LABELS[s]}</option>)}
        </select>
        <textarea
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          placeholder="Notes (optional)"
          rows={2}
          className="w-full px-2 py-1 text-xs border border-mushroom/60 rounded-lg bg-oatmilk/30 text-ink-dark outline-none resize-none placeholder:text-ink/30"
          style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
        />
        <div className="flex gap-1.5">
          <button
            type="submit"
            disabled={saving || !form.title.trim()}
            className="text-xs px-2.5 py-1 rounded-lg bg-ink-dark text-cream hover:bg-ink transition-colors cursor-pointer disabled:opacity-40"
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
          >
            {saving ? 'Adding…' : 'Add'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-2 py-1 rounded-lg text-ink hover:bg-oatmilk transition-colors cursor-pointer"
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

interface ContentIdea {
  id: string
  format: 'Reel' | 'Carousel' | 'Post' | 'Story'
  title: string
  hook: string
  caption_concept?: string
  why: string
}

const IDEA_FORMAT_COLORS: Record<string, string> = {
  Reel:     'bg-candy/10 text-candy border-candy/30',
  Carousel: 'bg-blueberry/10 text-blueberry border-blueberry/30',
  Post:     'bg-sage/10 text-sage border-sage/30',
  Story:    'bg-citrus/20 text-ink-dark border-citrus/40',
}

// ─── Growth Strategy Panel ────────────────────────────────────────────────────

function GrowthStrategyPanel() {
  const FONT = "'Jost', system-ui, sans-serif"
  const SERIF = "'Cormorant Garamond', Georgia, serif"

  const [strategy, setStrategy]       = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [generating, setGenerating]   = useState(false)
  const [error, setError]             = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/marketing/growth-strategy')
      .then(r => r.json())
      .then((d: { strategy?: string | null; generated_at?: string }) => {
        if (d.strategy) { setStrategy(d.strategy); setGeneratedAt(d.generated_at ?? null) }
      })
      .catch(() => {})
  }, [])

  async function generate() {
    setGenerating(true); setError(null)
    try {
      const res = await fetch('/api/marketing/growth-strategy', { method: 'POST' })
      const d = await res.json() as { strategy?: string; generated_at?: string; error?: string }
      if (d.error) { setError(d.error); return }
      if (d.strategy) { setStrategy(d.strategy); setGeneratedAt(d.generated_at ?? null) }
    } catch { setError('Failed to generate strategy') }
    finally { setGenerating(false) }
  }

  // Parse markdown into sections for structured display
  function renderMarkdown(text: string) {
    const lines = text.split('\n')
    const elements: React.ReactNode[] = []
    let key = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.startsWith('## ')) {
        elements.push(
          <h3 key={key++} style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: '#2C2C2C', margin: '20px 0 8px', letterSpacing: '0.01em' }}>
            {line.replace('## ', '')}
          </h3>
        )
      } else if (line.startsWith('- ')) {
        elements.push(
          <div key={key++} style={{ display: 'flex', gap: 8, marginBottom: 5, paddingLeft: 4 }}>
            <span style={{ color: 'rgba(44,44,44,0.3)', flexShrink: 0, lineHeight: '1.6', fontFamily: FONT, fontSize: 13 }}>·</span>
            <span style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(44,44,44,0.8)', lineHeight: '1.6' }}
              dangerouslySetInnerHTML={{ __html: line.replace('- ', '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
          </div>
        )
      } else if (line.match(/^\d+\./)) {
        elements.push(
          <div key={key++} style={{ display: 'flex', gap: 8, marginBottom: 5, paddingLeft: 4 }}>
            <span style={{ color: 'rgba(44,44,44,0.35)', flexShrink: 0, fontFamily: FONT, fontSize: 11, fontWeight: 700, lineHeight: '1.7' }}>
              {line.match(/^(\d+)\./)?.[1]}.
            </span>
            <span style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(44,44,44,0.8)', lineHeight: '1.6' }}
              dangerouslySetInnerHTML={{ __html: line.replace(/^\d+\.\s*/, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
          </div>
        )
      } else if (line.trim()) {
        elements.push(
          <p key={key++} style={{ fontFamily: FONT, fontSize: 13, color: 'rgba(44,44,44,0.75)', lineHeight: '1.65', margin: '4px 0' }}
            dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
        )
      }
    }
    return elements
  }

  const relTime = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <div style={{ marginBottom: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: '#2C2C2C', margin: '0 0 4px' }}>Growth Strategist</h2>
          <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(44,44,44,0.45)', margin: 0 }}>
            Synthesizes revenue, Meta Ads, Pinterest, Google Analytics, and email data into a cohesive brand awareness strategy.
            {generatedAt && <span style={{ marginLeft: 8 }}>Last generated {relTime(generatedAt)}.</span>}
          </p>
        </div>
        <button
          onClick={generate}
          disabled={generating}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
            fontFamily: FONT, fontSize: 12, fontWeight: 600,
            background: generating ? 'rgba(44,44,44,0.06)' : '#2C2C2C',
            color: generating ? 'rgba(44,44,44,0.4)' : '#FBF7F3',
            border: 'none', borderRadius: 8, padding: '8px 14px', cursor: generating ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {generating ? (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
                style={{ animation: 'spin 1s linear infinite' }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Analyzing…
            </>
          ) : (
            <>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              {strategy ? 'Regenerate' : 'Generate Strategy'}
            </>
          )}
        </button>
      </div>

      {/* Data sources strip */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Shopify Revenue', dot: '#3A8A5A' },
          { label: 'Meta Ads', dot: '#1877F2' },
          { label: 'Pinterest Ads', dot: '#E60023' },
          { label: 'Google Analytics', dot: '#F4B400' },
          { label: 'Klaviyo Email', dot: '#9BAE9A' },
          { label: 'Instagram', dot: '#C27A54' },
        ].map(s => (
          <div key={s.label} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
            color: 'rgba(44,44,44,0.55)', background: 'rgba(44,44,44,0.04)',
            border: '1px solid rgba(216,210,198,0.6)', borderRadius: 20, padding: '3px 9px',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, display: 'inline-block', flexShrink: 0 }} />
            {s.label}
          </div>
        ))}
      </div>

      {error && (
        <div style={{ background: '#FFF0EE', border: '1px solid rgba(201,64,64,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <p style={{ fontFamily: FONT, fontSize: 13, color: '#C94040', margin: 0 }}>{error}</p>
        </div>
      )}

      {/* Generating skeleton */}
      {generating && !strategy && (
        <div style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 12, padding: '24px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[180, 120, 200, 140, 160].map((w, i) => (
              <div key={i} style={{ height: 12, borderRadius: 4, background: `rgba(216,210,198,${0.3 + (i % 2) * 0.1})`, width: `${w}px`, maxWidth: '100%', animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
          <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(44,44,44,0.35)', margin: '16px 0 0', fontStyle: 'italic' }}>
            Pulling revenue, ad spend, traffic, and email data — this takes ~15 seconds…
          </p>
        </div>
      )}

      {/* Strategy output */}
      {strategy && (
        <div style={{ background: '#fff', border: '1px solid rgba(216,210,198,0.6)', borderRadius: 12, padding: '20px 24px' }}>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
          {renderMarkdown(strategy)}
        </div>
      )}

      {/* Empty state */}
      {!strategy && !generating && (
        <div style={{ background: 'rgba(44,44,44,0.02)', border: '1px dashed rgba(216,210,198,0.8)', borderRadius: 12, padding: '36px 24px', textAlign: 'center' }}>
          <p style={{ fontFamily: SERIF, fontSize: 18, color: 'rgba(44,44,44,0.4)', margin: '0 0 6px' }}>No strategy generated yet</p>
          <p style={{ fontFamily: FONT, fontSize: 12, color: 'rgba(44,44,44,0.3)', margin: 0 }}>
            Click Generate Strategy to pull all your financial and ad data into a cohesive growth plan.
          </p>
        </div>
      )}

      {/* Divider */}
      {strategy && <div style={{ margin: '28px 0', borderTop: '1px solid rgba(216,210,198,0.4)' }} />}
    </div>
  )
}

function ContentStrategyTab() {
  const FONT = "'Jost', system-ui, sans-serif"

  const [competitors, setCompetitors] = useState('')
  const [focusNotes, setFocusNotes] = useState('')
  const [ideas, setIdeas] = useState<ContentIdea[]>([])
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastGenerated, setLastGenerated] = useState<string | null>(null)
  interface IdeaRating { thumb: 'up' | 'down' | null; feedback: string; keep: boolean; done: boolean }
  const [ratings, setRatings] = useState<Record<string, IdeaRating>>({})
  const [expandedFeedback, setExpandedFeedback] = useState<string | null>(null)
  const [showAddCard, setShowAddCard] = useState(false)
  const [newCard, setNewCard] = useState({ format: 'Reel' as ContentIdea['format'], title: '', hook: '', caption_concept: '', why: '' })
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [pendingIdea, setPendingIdea] = useState<ContentIdea | null>(null)
  const [pendingTitle, setPendingTitle] = useState('')
  const [pendingDesc, setPendingDesc] = useState('')
  const [creatingTask, setCreatingTask] = useState(false)
  const [marketingProjectId, setMarketingProjectId] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/marketing/content-ideas')
      .then(r => r.json())
      .then((data: { competitors?: string; focus_notes?: string; ideas?: ContentIdea[]; last_generated?: string | null; ratings?: Record<string, IdeaRating> }) => {
        if (data.competitors) setCompetitors(data.competitors)
        if (data.focus_notes) setFocusNotes(data.focus_notes)
        if (data.ideas?.length) setIdeas(data.ideas)
        if (data.last_generated) setLastGenerated(data.last_generated)
        if (data.ratings) setRatings(data.ratings)
      })
      .catch(() => {})
    fetch('/api/projects')
      .then(r => r.json())
      .then((projects: { id: number; name: string }[]) => {
        const p = projects.find(p => p.name === 'Marketing Tasks')
        if (p) setMarketingProjectId(p.id)
      })
      .catch(() => {})
  }, [])

  function saveInputs(c: string, f: string) {
    fetch('/api/marketing/content-ideas', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ competitors: c, focus_notes: f }),
    }).catch(() => {})
  }

  function saveRating(id: string, updated: IdeaRating) {
    const next = { ...ratings, [id]: updated }
    setRatings(next)
    fetch('/api/marketing/content-ideas', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ratings: next }),
    }).catch(() => {})
  }

  function addCustomCard() {
    if (!newCard.title.trim()) return
    const card: ContentIdea = {
      id: `custom-${Date.now()}`,
      format: newCard.format,
      title: newCard.title.trim(),
      hook: newCard.hook.trim(),
      caption_concept: newCard.caption_concept.trim() || undefined,
      why: newCard.why.trim() || 'Custom idea',
    }
    const next = [...ideas, card]
    setIdeas(next)
    fetch('/api/marketing/content-ideas', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ideas: next }),
    }).catch(() => {})
    setNewCard({ format: 'Reel', title: '', hook: '', caption_concept: '', why: '' })
    setShowAddCard(false)
  }

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      // Preserve cards that are marked keep=true and done=false
      const keptIdeas = ideas.filter(i => ratings[i.id]?.keep && !ratings[i.id]?.done)

      const res = await fetch('/api/marketing/content-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ competitors, focus_notes: focusNotes, ratings }),
      })
      const data = await res.json() as { ideas?: ContentIdea[]; last_generated?: string; error?: string }
      if (data.error) { setError(data.error); return }

      // Merge kept ideas at front, append new ones that don't duplicate kept IDs
      const newIdeas = data.ideas ?? []
      const keptIds = new Set(keptIdeas.map(i => i.id))
      const merged = [...keptIdeas, ...newIdeas.filter(i => !keptIds.has(i.id))]
      setIdeas(merged)
      if (data.last_generated) setLastGenerated(data.last_generated)
      // Clear ratings for replaced cards so old thumbs/comments don't bleed onto new ones
      const nextRatings = Object.fromEntries(Object.entries(ratings).filter(([id]) => keptIds.has(id)))
      setRatings(nextRatings)
      fetch('/api/marketing/content-ideas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ratings: nextRatings }) }).catch(() => {})
    } catch {
      setError('Failed to generate ideas — check your API key.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div>
      <GrowthStrategyPanel />

      <div className="flex gap-7">

      {/* Left panel */}
      <div className="w-72 shrink-0 space-y-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-dark mb-2" style={{ fontFamily: FONT }}>
            Competitors & Inspiration
          </p>
          <p className="text-xs text-ink mb-2 leading-relaxed" style={{ fontFamily: FONT }}>
            Instagram accounts, brands, or creators in the food/spice space. Describe what content styles are working for them.
          </p>
          <textarea
            value={competitors}
            onChange={e => setCompetitors(e.target.value)}
            onBlur={() => saveInputs(competitors, focusNotes)}
            placeholder={`e.g. @primalpalate, @spiceologyco — short reels showing one-pan meals with visible spice use perform well. Carousels with "3 ways to use X" get saved a lot.`}
            rows={7}
            className="w-full text-xs px-3 py-2.5 rounded-lg border border-mushroom/60 bg-oatmilk/30 text-ink-dark resize-none outline-none focus:ring-2 focus:ring-ink/15 placeholder:text-ink/40 leading-relaxed"
            style={{ fontFamily: FONT }}
          />
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-dark mb-2" style={{ fontFamily: FONT }}>
            Current Focus
          </p>
          <p className="text-xs text-ink mb-2 leading-relaxed" style={{ fontFamily: FONT }}>
            Campaigns, seasons, launches, or topics to build ideas around right now.
          </p>
          <textarea
            value={focusNotes}
            onChange={e => setFocusNotes(e.target.value)}
            onBlur={() => saveInputs(competitors, focusNotes)}
            placeholder="e.g. Summer grilling season, new Za'atar blend launch, back to school weeknights..."
            rows={4}
            className="w-full text-xs px-3 py-2.5 rounded-lg border border-mushroom/60 bg-oatmilk/30 text-ink-dark resize-none outline-none focus:ring-2 focus:ring-ink/15 placeholder:text-ink/40 leading-relaxed"
            style={{ fontFamily: FONT }}
          />
        </div>

        <button
          onClick={generate}
          disabled={generating}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-ink-dark text-cream text-sm font-semibold hover:bg-ink transition-colors cursor-pointer disabled:opacity-50"
          style={{ fontFamily: FONT }}
        >
          <Sparkles className="w-4 h-4" />
          {generating ? 'Generating…' : ideas.length > 0 ? 'Refresh Ideas' : 'Generate Ideas'}
        </button>

        {error && (
          <p className="text-xs text-terracotta leading-relaxed" style={{ fontFamily: FONT }}>{error}</p>
        )}

        {lastGenerated && !error && (
          <p className="text-[10px] text-ink/30 text-center" style={{ fontFamily: FONT }}>
            Last generated {format(new Date(lastGenerated), 'MMM d, h:mm a')}
          </p>
        )}

        <p className="text-[10px] text-ink/35 text-center" style={{ fontFamily: FONT }}>
          Usage tracked in{' '}
          <a href="/settings" className="underline hover:text-ink/60 transition-colors">Settings → Agents</a>
        </p>
      </div>

      {/* Ideas area */}
      <div className="flex-1 min-w-0">
        {ideas.length > 0 && !generating && (
          <div className="flex justify-end mb-3">
            <button
              onClick={() => setShowAddCard(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-ink-dark border border-mushroom/50 rounded-lg px-3 py-1.5 hover:bg-oatmilk/60 transition-colors cursor-pointer"
              style={{ fontFamily: FONT }}
            >
              + Add Idea
            </button>
          </div>
        )}

        {/* Add Idea sidebar */}
        {showAddCard && (
          <>
            <div
              className="fixed inset-0 z-40"
              style={{ backgroundColor: 'rgba(44,44,44,0.2)' }}
              onClick={() => { setShowAddCard(false); setNewCard({ format: 'Reel', title: '', hook: '', caption_concept: '', why: '' }) }}
            />
            <div className="fixed top-0 right-0 h-full z-50 w-96 flex flex-col shadow-2xl bg-cream border-l border-mushroom" onClick={e => e.stopPropagation()}>
              {/* Accent strip */}
              <div style={{ height: 4, background: '#5A7A5C', flexShrink: 0 }} />

              {/* Header */}
              <div style={{ padding: '10px 20px', borderBottom: '1px solid rgba(216,210,198,0.6)', flexShrink: 0, fontFamily: FONT }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: '#9BA69A', margin: 0 }}>
                    Content Strategy
                  </p>
                  <button
                    onClick={() => { setShowAddCard(false); setNewCard({ format: 'Reel', title: '', hook: '', caption_concept: '', why: '' }) }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 5, color: '#9BA69A', display: 'flex', borderRadius: 6 }}
                    className="hover:text-ink-dark transition-colors"
                  >
                    <X style={{ width: 15, height: 15 }} />
                  </button>
                </div>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto" style={{ padding: '18px 20px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* Title — large serif */}
                <input
                  value={newCard.title}
                  onChange={e => setNewCard(c => ({ ...c, title: e.target.value }))}
                  placeholder="Idea title…"
                  style={{
                    width: '100%', fontFamily: "'Cormorant Garamond', Georgia, serif",
                    fontSize: 24, fontWeight: 600, color: '#2C2C2C',
                    background: 'transparent', border: 'none', outline: 'none',
                    borderBottom: '1px solid rgba(216,210,198,0.6)', paddingBottom: 8,
                    lineHeight: 1.2, boxSizing: 'border-box',
                  }}
                />

                {/* Format chips */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(['Reel', 'Carousel', 'Post', 'Story'] as ContentIdea['format'][]).map(f => (
                    <button
                      key={f}
                      onClick={() => setNewCard(c => ({ ...c, format: f }))}
                      style={{
                        fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999,
                        cursor: 'pointer', fontFamily: FONT, border: 'none',
                        background: newCard.format === f ? 'rgba(90,122,92,0.18)' : 'rgba(216,210,198,0.25)',
                        outline: newCard.format === f ? '1px solid rgba(90,122,92,0.4)' : '1px solid rgba(216,210,198,0.6)',
                        color: newCard.format === f ? '#4a7c59' : '#747474',
                      }}
                    >{f}</button>
                  ))}
                </div>

                {/* Fields */}
                {[
                  { key: 'hook', label: 'Hook', placeholder: 'Opening line / scroll-stopper…', rows: 3 },
                  { key: 'caption_concept', label: 'Caption Direction', placeholder: 'Optional caption direction…', rows: 2 },
                  { key: 'why', label: 'Why it works', placeholder: 'Why this resonates with your audience…', rows: 2 },
                ].map(({ key, label, placeholder, rows }) => (
                  <div key={key}>
                    <p className="block text-[10px] font-semibold text-ink uppercase tracking-widest mb-2" style={{ fontFamily: FONT, letterSpacing: '0.12em' }}>{label}</p>
                    <textarea
                      value={newCard[key as keyof typeof newCard] as string}
                      onChange={e => setNewCard(c => ({ ...c, [key]: e.target.value }))}
                      placeholder={placeholder}
                      rows={rows}
                      className="w-full px-3 py-2.5 text-sm bg-white border border-mushroom rounded-xl outline-none focus:ring-2 focus:ring-ink/20 focus:border-ink text-ink-dark placeholder:text-ink/40 resize-none transition-all"
                      style={{ fontFamily: FONT }}
                    />
                  </div>
                ))}

                {/* Add button */}
                <button
                  onClick={addCustomCard}
                  disabled={!newCard.title.trim()}
                  style={{
                    width: '100%', fontFamily: FONT, fontSize: 13, fontWeight: 600,
                    background: '#2C2C2C', color: '#FAF8F4', padding: '10px 0',
                    borderRadius: 10, border: 'none', cursor: newCard.title.trim() ? 'pointer' : 'default',
                    opacity: newCard.title.trim() ? 1 : 0.4, marginTop: 4,
                  }}
                >
                  Add to Board
                </button>
              </div>
            </div>
          </>
        )}

        {generating ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-7 h-7 border-2 border-ink-dark/20 border-t-ink-dark rounded-full animate-spin" />
            <p className="text-sm text-ink/50" style={{ fontFamily: FONT }}>
              Analyzing your Instagram data and crafting ideas…
            </p>
          </div>
        ) : ideas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-oatmilk/70 border border-mushroom/40 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-ink/30" />
            </div>
            <p className="text-xl text-ink-dark" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700 }}>
              Your content strategy starts here
            </p>
            <p className="text-sm text-ink/50 max-w-xs leading-relaxed" style={{ fontFamily: FONT }}>
              Add competitor accounts and focus notes, then generate ideas grounded in your real Instagram engagement data.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
            {ideas.map(idea => (
              <div
                key={idea.id}
                draggable
                onDragStart={() => setDragId(idea.id)}
                onDragOver={e => { e.preventDefault(); setDragOverId(idea.id) }}
                onDrop={e => {
                  e.preventDefault()
                  if (!dragId || dragId === idea.id) return
                  const fromIdx = ideas.findIndex(i => i.id === dragId)
                  const toIdx   = ideas.findIndex(i => i.id === idea.id)
                  if (fromIdx === -1 || toIdx === -1) return
                  const next = [...ideas]
                  const [moved] = next.splice(fromIdx, 1)
                  next.splice(toIdx, 0, moved)
                  setIdeas(next)
                  fetch('/api/marketing/content-ideas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ideas: next }) }).catch(() => {})
                  setDragId(null); setDragOverId(null)
                }}
                onDragEnd={() => { setDragId(null); setDragOverId(null) }}
                className={cn(
                  'bg-white rounded-xl border p-4 flex flex-col gap-2.5 transition-colors cursor-grab active:cursor-grabbing overflow-hidden',
                  dragOverId === idea.id && dragId !== idea.id
                    ? 'border-thyme/60 ring-2 ring-thyme/25'
                    : 'border-mushroom/40 hover:border-mushroom/70'
                )}
              >
                <span
                  className={cn('self-start text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border', IDEA_FORMAT_COLORS[idea.format] ?? 'bg-oatmilk text-ink border-mushroom/40')}
                  style={{ fontFamily: FONT }}
                >
                  {idea.format}
                </span>

                <p className="font-semibold text-ink-dark leading-snug" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 20 }}>
                  {idea.title}
                </p>

                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-ink/40 mb-1" style={{ fontFamily: FONT }}>Hook</p>
                  <p className="text-sm text-ink-dark leading-relaxed italic" style={{ fontFamily: FONT }}>&ldquo;{idea.hook}&rdquo;</p>
                </div>

                {idea.caption_concept && (
                  <div>
                    <p className="text-[9px] font-semibold uppercase tracking-widest text-ink/40 mb-1" style={{ fontFamily: FONT }}>Caption Direction</p>
                    <p className="text-sm text-ink-dark leading-relaxed" style={{ fontFamily: FONT }}>{idea.caption_concept}</p>
                  </div>
                )}

                {/* Why + Rating — green bottom section */}
                <div className="-mx-4 -mb-4 px-4 pt-2.5 pb-2.5 mt-auto" style={{ backgroundColor: 'rgba(122,158,126,0.15)', borderTop: '0.5px solid rgba(90,130,90,0.35)' }}>
                  <p className="text-[11px] text-ink-dark leading-snug mb-2" style={{ fontFamily: FONT }}>↳ {idea.why}</p>
                  <div className="flex items-center gap-1">
                    {/* Thumbs up / down */}
                    <button
                      onClick={() => {
                        const cur = ratings[idea.id]
                        const newThumb = cur?.thumb === 'up' ? null : 'up'
                        const updated: IdeaRating = { thumb: newThumb, feedback: cur?.feedback ?? '', keep: cur?.keep ?? false, done: cur?.done ?? false }
                        saveRating(idea.id, updated)
                        if (newThumb && expandedFeedback !== idea.id) setExpandedFeedback(idea.id)
                        if (!newThumb && ratings[idea.id]?.thumb === 'up') setExpandedFeedback(null)
                      }}
                      className="flex items-center justify-center w-6 h-6 rounded-md transition-all cursor-pointer"
                      style={{
                        color: ratings[idea.id]?.thumb === 'up' ? '#4a7c59' : 'rgba(44,44,44,0.35)',
                        backgroundColor: ratings[idea.id]?.thumb === 'up' ? 'rgba(90,130,90,0.18)' : 'transparent',
                      }}
                      title="Thumbs up"
                    ><ThumbsUp className="w-3.5 h-3.5" strokeWidth={2} /></button>
                    <button
                      onClick={() => {
                        const cur = ratings[idea.id]
                        const newThumb = cur?.thumb === 'down' ? null : 'down'
                        const updated: IdeaRating = { thumb: newThumb, feedback: cur?.feedback ?? '', keep: cur?.keep ?? false, done: cur?.done ?? false }
                        saveRating(idea.id, updated)
                        if (newThumb && expandedFeedback !== idea.id) setExpandedFeedback(idea.id)
                        if (!newThumb && ratings[idea.id]?.thumb === 'down') setExpandedFeedback(null)
                      }}
                      className="flex items-center justify-center w-6 h-6 rounded-md transition-all cursor-pointer"
                      style={{
                        color: ratings[idea.id]?.thumb === 'down' ? '#8b4040' : 'rgba(44,44,44,0.35)',
                        backgroundColor: ratings[idea.id]?.thumb === 'down' ? 'rgba(139,64,64,0.12)' : 'transparent',
                      }}
                      title="Thumbs down"
                    ><ThumbsDown className="w-3.5 h-3.5" strokeWidth={2} /></button>
                    <div className="ml-auto flex items-center gap-2.5">
                      <label className="flex items-center gap-1 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={ratings[idea.id]?.keep ?? false}
                          onChange={e => {
                            const cur = ratings[idea.id]
                            saveRating(idea.id, { thumb: cur?.thumb ?? null, feedback: cur?.feedback ?? '', keep: e.target.checked, done: cur?.done ?? false })
                          }}
                          className="accent-thyme w-3 h-3"
                        />
                        <span className="text-[10px] text-ink-dark font-medium" style={{ fontFamily: FONT }}>Keep</span>
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={ratings[idea.id]?.done ?? false}
                          onChange={e => {
                            const cur = ratings[idea.id]
                            saveRating(idea.id, { thumb: cur?.thumb ?? null, feedback: cur?.feedback ?? '', keep: cur?.keep ?? false, done: e.target.checked })
                          }}
                          className="accent-thyme w-3 h-3"
                        />
                        <span className="text-[10px] text-ink-dark font-medium" style={{ fontFamily: FONT }}>Complete</span>
                      </label>
                      {ratings[idea.id]?.thumb !== null && ratings[idea.id]?.thumb !== undefined && (
                        <button
                          onClick={() => setExpandedFeedback(expandedFeedback === idea.id ? null : idea.id)}
                          className="text-[10px] text-ink/50 hover:text-ink/80 transition-colors cursor-pointer underline"
                          style={{ fontFamily: FONT }}
                        >
                          {expandedFeedback === idea.id ? 'hide' : 'notes'}
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Make Task button */}
                  <button
                    onClick={() => {
                      const desc = [
                        `Format: ${idea.format}`,
                        `Hook: ${idea.hook}`,
                        idea.caption_concept ? `Caption direction: ${idea.caption_concept}` : null,
                        `Why: ${idea.why}`,
                      ].filter(Boolean).join('\n')
                      setPendingIdea(idea)
                      setPendingTitle(idea.title)
                      setPendingDesc(desc)
                    }}
                    className="mt-2 w-full text-[10px] font-semibold py-1 rounded-md transition-all cursor-pointer"
                    style={{
                      fontFamily: FONT,
                      background: 'rgba(44,44,44,0.07)',
                      color: 'rgba(44,44,44,0.5)',
                      border: '1px solid rgba(44,44,44,0.12)',
                    }}
                  >
                    + Make Task
                  </button>

                  {expandedFeedback === idea.id && (
                    <textarea
                      value={ratings[idea.id]?.feedback ?? ''}
                      onChange={e => {
                        const cur = ratings[idea.id]
                        setRatings(r => ({ ...r, [idea.id]: { thumb: cur?.thumb ?? null, feedback: e.target.value, keep: cur?.keep ?? false, done: cur?.done ?? false } }))
                      }}
                      onBlur={e => {
                        const cur = ratings[idea.id]
                        saveRating(idea.id, { thumb: cur?.thumb ?? null, feedback: e.target.value, keep: cur?.keep ?? false, done: cur?.done ?? false })
                      }}
                      placeholder="What worked or didn't about this idea…"
                      rows={2}
                      className="mt-1.5 w-full text-[11px] px-2.5 py-1.5 rounded-md border border-mushroom/40 bg-white/60 text-ink-dark resize-none outline-none focus:ring-1 focus:ring-ink/15 placeholder:text-ink/30 leading-relaxed"
                      style={{ fontFamily: FONT }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Task Review Sidebar */}
      {pendingIdea && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setPendingIdea(null)}
          />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white shadow-2xl flex flex-col bottom-sheet-wrap md:top-0 md:left-auto md:w-[400px]" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-5 border-b border-mushroom/40 flex items-center justify-between">
              <p className="text-sm font-semibold text-ink-dark" style={{ fontFamily: FONT }}>Review Task</p>
              <button
                onClick={() => setPendingIdea(null)}
                className="text-ink/40 hover:text-ink transition-colors cursor-pointer"
                style={{ fontSize: 20, lineHeight: 1, background: 'none', border: 'none', padding: 0 }}
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-ink/50 mb-1.5" style={{ fontFamily: FONT }}>
                  Task Title
                </label>
                <input
                  value={pendingTitle}
                  onChange={e => setPendingTitle(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-mushroom/50 bg-oatmilk/40 text-ink-dark outline-none focus:ring-1 focus:ring-ink/20"
                  style={{ fontFamily: FONT }}
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-widest text-ink/50 mb-1.5" style={{ fontFamily: FONT }}>
                  Description
                </label>
                <textarea
                  value={pendingDesc}
                  onChange={e => setPendingDesc(e.target.value)}
                  rows={8}
                  className="w-full text-sm px-3 py-2 rounded-lg border border-mushroom/50 bg-oatmilk/40 text-ink-dark outline-none focus:ring-1 focus:ring-ink/20 resize-none leading-relaxed"
                  style={{ fontFamily: FONT }}
                />
              </div>

              <div className="pt-1">
                <p className="text-[10px] text-ink/40" style={{ fontFamily: FONT }}>
                  Format: <span className="font-medium text-ink/60">{pendingIdea.format}</span>
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-mushroom/40 flex gap-3">
              <button
                onClick={() => setPendingIdea(null)}
                className="flex-1 text-sm font-semibold py-2 rounded-lg border border-mushroom/60 text-ink hover:bg-oatmilk transition-colors cursor-pointer"
                style={{ fontFamily: FONT }}
              >
                Cancel
              </button>
              <button
                disabled={creatingTask || !pendingTitle.trim()}
                onClick={async () => {
                  if (!pendingIdea) return
                  setCreatingTask(true)
                  try {
                    await fetch('/api/tasks', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ title: pendingTitle.trim(), notes: pendingDesc, status: 'todo', priority: 'medium', project_id: marketingProjectId }),
                    })
                    const nextIdeas = ideas.filter(i => i.id !== pendingIdea.id)
                    setIdeas(nextIdeas)
                    fetch('/api/marketing/content-ideas', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ ideas: nextIdeas }),
                    }).catch(() => {})
                    setPendingIdea(null)
                  } finally {
                    setCreatingTask(false)
                  }
                }}
                className="flex-1 text-sm font-semibold py-2 rounded-lg bg-ink-dark text-cream hover:bg-ink transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                style={{ fontFamily: FONT }}
              >
                {creatingTask ? 'Creating…' : 'Create Task'}
              </button>
            </div>
          </div>
        </>
      )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MarketingPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Overview')
  const [syncTrigger, setSyncTrigger] = useState(0)
  const [syncingAll, setSyncingAll] = useState(false)

  function syncAll() {
    if (syncingAll) return
    setSyncingAll(true)
    setSyncTrigger(n => n + 1)
  }

  return (
    <div className="page-wrap min-h-full bg-cream">
      <PageHeader
        eyebrow="Operations"
        title="Marketing"
        actions={
          <button
            onClick={syncAll}
            disabled={syncingAll}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontFamily: "'Jost', system-ui, sans-serif",
              fontSize: 13, fontWeight: 700,
              padding: '10px 20px', borderRadius: 10, border: 'none', cursor: syncingAll ? 'default' : 'pointer',
              background: syncingAll ? 'rgba(44,44,44,0.08)' : '#2C2C2C',
              color: syncingAll ? 'rgba(44,44,44,0.4)' : '#FAF9F6',
            }}
          >
            <RefreshCw size={14} style={{ animation: syncingAll ? 'spin 1s linear infinite' : 'none' }} />
            {syncingAll ? 'Syncing…' : 'Sync All'}
          </button>
        }
      />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 26, borderBottom: '1px solid #D8D2C6' }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              fontFamily: "'Jost', system-ui, sans-serif",
              fontSize: 13.5, fontWeight: 600,
              padding: '10px 16px', background: 'transparent', border: 'none',
              borderBottom: activeTab === tab ? '2px solid #2C2C2C' : '2px solid transparent',
              marginBottom: -1, cursor: 'pointer',
              color: activeTab === tab ? '#2C2C2C' : 'rgba(116,116,116,0.7)',
              transition: 'all 0.15s',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'Overview' && <OverviewTab syncTrigger={syncTrigger} onSyncDone={() => setSyncingAll(false)} />}
        {activeTab === 'Content'  && <ContentTab />}
        {activeTab === 'Strategy' && <ContentStrategyTab />}
        {activeTab === 'Brand'    && <BrandTab />}
      </div>
    </div>
  )
}
