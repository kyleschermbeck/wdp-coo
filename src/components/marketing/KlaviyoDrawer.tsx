'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Zap, Mail, ExternalLink, Users, Eye, MousePointer, ShoppingBag } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Campaign {
  klaviyo_id: string
  name: string
  status: string
  subject: string | null
  from_email: string | null
  send_time: string | null
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

interface Flow {
  klaviyo_id: string
  name: string
  status: string
  trigger_type: string | null
  updated: string | null
}

interface KlaviyoData {
  total_subscribers: number
  campaigns: Campaign[]
  flows: Flow[]
  metrics: Record<string, number>
  lists: { klaviyo_id: string; name: string; profile_count: number }[]
}

interface CampaignDetail {
  id: string
  name: string
  status: string
  send_time: string | null
  messages: {
    id: string
    subject: string | null
    preview_text: string | null
    from_label: string | null
    from_email: string | null
  }[]
  stats: { received: number; opened: number; clicked: number }
}

interface Profile {
  klaviyo_id: string
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  created: string
  updated: string
  list_names: string | null
}

interface ProfileEngagement {
  opened: boolean
  clicked: boolean
  converted: boolean
}

interface FlowDetailData {
  messages: Array<{
    id: string
    action_id: string
    action_type: string
    action_status: string
    name: string
    subject: string | null
    preview_text: string | null
    from_label: string | null
    from_email: string | null
    created: string | null
    updated: string | null
  }>
  stats: { received: number; opened: number; clicked: number }
}

interface FlowEngagement {
  received: boolean
  opened: boolean
  clicked: boolean
  converted: boolean
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
  if (n == null) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(Math.round(n))
}

function relDate(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function initials(p: Profile) {
  const f = p.first_name?.[0] ?? ''
  const l = p.last_name?.[0] ?? ''
  return (f + l).toUpperCase() || p.email[0].toUpperCase()
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiGrid({ items }: { items: { label: string; value: string; sub?: string }[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
      {items.map(k => (
        <div key={k.label} style={{ background: '#fff', border: BORDER, borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK_LIGHT, marginBottom: 6 }}>{k.label}</div>
          <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, color: INK, lineHeight: 1 }}>{k.value}</div>
          {k.sub && <div style={{ fontFamily: FONT, fontSize: 11, color: INK_MID, marginTop: 4 }}>{k.sub}</div>}
        </div>
      ))}
    </div>
  )
}

function StatBar({ label, value, total, color, icon }: { label: string; value: number; total: number; color: string; icon: React.ReactNode }) {
  const p = total > 0 ? Math.min((value / total) * 100, 100) : 0
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: INK_LIGHT }}>{icon}</span>
          <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 500, color: INK_MID }}>{label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: INK }}>{fmt(value)}</span>
          {total > 0 && <span style={{ fontFamily: FONT, fontSize: 11, color: INK_LIGHT }}>{p.toFixed(1)}%</span>}
        </div>
      </div>
      <div style={{ height: 5, background: 'rgba(216,210,198,0.35)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${p}%`, background: color, borderRadius: 3, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}

// ─── Engagement tag pill ─────────────────────────────────────────────────────

function EngTag({ label, color, bg, icon }: { label: string; color: string; bg: string; icon: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      color, background: bg, borderRadius: 20, padding: '2px 7px', flexShrink: 0,
    }}>
      {icon}{label}
    </span>
  )
}

// ─── Campaign Detail View ─────────────────────────────────────────────────────

function CampaignDetail({ campaign, onBack }: { campaign: Campaign; onBack: () => void }) {
  const [detail, setDetail]           = useState<CampaignDetail | null>(null)
  const [profiles, setProfiles]       = useState<Profile[]>([])
  const [engagement, setEngagement]   = useState<Record<string, ProfileEngagement>>({})
  const [loadingDetail, setLoadingDetail]   = useState(true)
  const [loadingEngagement, setLoadingEngagement] = useState(true)
  const [profilesExpanded, setProfilesExpanded]   = useState(false)

  useEffect(() => {
    // Fetch detail + profiles in parallel, then fetch engagement separately
    setLoadingDetail(true)
    setLoadingEngagement(true)

    Promise.all([
      fetch(`/api/klaviyo/campaigns/${campaign.klaviyo_id}`).then(r => r.json()),
      fetch('/api/klaviyo/profiles').then(r => r.json()),
    ]).then(([det, profs]) => {
      setDetail(det as CampaignDetail)
      setProfiles(Array.isArray(profs) ? profs : [])
      setLoadingDetail(false)
    }).catch(() => setLoadingDetail(false))

    fetch(`/api/klaviyo/campaigns/${campaign.klaviyo_id}/engagement`)
      .then(r => r.json())
      .then((d: { engagement: Record<string, ProfileEngagement> }) => setEngagement(d.engagement ?? {}))
      .catch(() => {})
      .finally(() => setLoadingEngagement(false))
  }, [campaign.klaviyo_id])

  const statusColor: Record<string, { bg: string; text: string }> = {
    Sent:      { bg: '#E8F3E8', text: '#3A7A3A' },
    Draft:     { bg: '#F5F5F0', text: '#747474' },
    Scheduled: { bg: '#EEF5FF', text: '#3A5FA0' },
    Cancelled: { bg: '#FFF0EE', text: '#C94040' },
  }
  const sc = statusColor[campaign.status] ?? { bg: '#F5F5F0', text: '#747474' }

  // ── Stats: prefer detail API values (non-zero), fall back to campaign DB values ──
  const received = detail?.stats?.received || campaign.recipients || 0
  const opened   = detail?.stats?.opened   || campaign.unique_opens || campaign.opens || 0
  const clicked  = detail?.stats?.clicked  || campaign.unique_clicks || campaign.clicks || 0
  const unsubs   = campaign.unsubscribes ?? 0

  // Always compute rates from actual counts — never trust stored 0% when we have counts
  const openRate  = received > 0 ? opened  / received : null
  const clickRate = received > 0 ? clicked / received : null

  const msg       = detail?.messages?.[0]
  const subject   = msg?.subject ?? campaign.subject
  const preview   = msg?.preview_text
  const fromLabel = msg?.from_label
  const fromEmail = msg?.from_email ?? campaign.from_email

  const SHOW_LIMIT = 8
  const shownProfiles = profilesExpanded ? profiles : profiles.slice(0, SHOW_LIMIT)

  return (
    <div>
      {/* Back nav */}
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontSize: 12, fontWeight: 600, color: INK_MID, background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 20px', letterSpacing: '0.02em' }}>
        <ArrowLeft size={13} /> All Campaigns
      </button>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <h3 style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: INK, margin: 0, lineHeight: 1.2 }}>{campaign.name}</h3>
          <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.text, whiteSpace: 'nowrap', flexShrink: 0 }}>{campaign.status}</span>
        </div>
        {campaign.send_time && (
          <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT, margin: '6px 0 0' }}>
            Sent {relDate(campaign.send_time)} · {new Date(campaign.send_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        )}
      </div>

      {/* ── Email preview: styled like an email client ── */}
      {(subject || fromEmail) && (
        <div style={{ borderRadius: 12, overflow: 'hidden', marginBottom: 20, border: BORDER, boxShadow: '0 2px 12px rgba(44,44,44,0.06)' }}>
          {/* Email client chrome bar */}
          <div style={{ background: '#2C2C2C', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#C94040', display: 'inline-block' }} />
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#B87816', display: 'inline-block' }} />
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#3A7A3A', display: 'inline-block' }} />
            <span style={{ fontFamily: FONT, fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 8, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fromEmail ?? 'hello@weeknightdinnerparty.com'}
            </span>
          </div>
          {/* Email meta */}
          <div style={{ background: OATMILK, padding: '12px 16px', borderBottom: BORDER }}>
            {fromLabel && (
              <div style={{ fontFamily: FONT, fontSize: 11, color: INK_LIGHT, marginBottom: 4 }}>
                <strong style={{ color: INK_MID }}>{fromLabel}</strong>
                {fromEmail && <span style={{ marginLeft: 6 }}>&lt;{fromEmail}&gt;</span>}
              </div>
            )}
            {subject && (
              <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: INK, lineHeight: 1.3 }}>{subject}</div>
            )}
          </div>
          {/* Preview text body */}
          {preview && (
            <div style={{ background: '#fff', padding: '14px 16px' }}>
              <div style={{ fontFamily: FONT, fontSize: 13, color: INK_MID, lineHeight: 1.6, fontStyle: 'italic' }}>
                {preview}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>
        {[
          { label: 'Sent',       value: fmt(received) },
          { label: 'Open Rate',  value: openRate  != null ? (openRate  * 100).toFixed(1) + '%' : '—' },
          { label: 'Click Rate', value: clickRate != null ? (clickRate * 100).toFixed(1) + '%' : '—' },
        ].map(m => (
          <div key={m.label} style={{ background: '#fff', border: BORDER, borderRadius: 9, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK_LIGHT, marginBottom: 5 }}>{m.label}</div>
            <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: INK }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Engagement funnel */}
      <div style={{ background: '#fff', border: BORDER, borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
        <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK_LIGHT, marginBottom: 16 }}>Engagement</div>
        <StatBar label="Opened"  value={opened}  total={received} color="#9BAE9A" icon={<Eye size={12} />} />
        <StatBar label="Clicked" value={clicked} total={received} color="#C27A54" icon={<MousePointer size={12} />} />
        {unsubs > 0 && <StatBar label="Unsubscribed" value={unsubs} total={received} color="#C94040" icon={<Mail size={12} />} />}
      </div>

      {/* Revenue */}
      {(campaign.revenue ?? 0) > 0 && (
        <div style={{ background: '#fff', border: BORDER, borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
          <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK_LIGHT, marginBottom: 8 }}>Revenue Attributed</div>
          <div style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 700, color: '#3A8A5A' }}>
            ${campaign.revenue!.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      )}

      {/* Subscriber list — with engagement tags */}
      {profiles.length > 0 && (
        <div style={{ background: '#fff', border: BORDER, borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={13} style={{ color: INK_LIGHT }} />
              <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK_LIGHT }}>Sent to · Email List</span>
            </div>
            <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: INK_LIGHT }}>{profiles.length} subscribers</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {shownProfiles.map((p, i) => {
              const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || null
              const eng  = engagement[p.klaviyo_id]
              const isLoading = loadingEngagement

              return (
                <div key={p.klaviyo_id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 0',
                  borderBottom: i < shownProfiles.length - 1 ? '1px solid rgba(216,210,198,0.2)' : 'none',
                }}>
                  {/* Avatar */}
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                    background: OATMILK, border: BORDER,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: FONT, fontSize: 11, fontWeight: 700, color: INK_MID,
                  }}>
                    {initials(p)}
                  </div>

                  {/* Name + email */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {name && <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>}
                    <div style={{ fontFamily: FONT, fontSize: 11, color: INK_MID, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</div>
                  </div>

                  {/* Engagement tags */}
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {isLoading ? (
                      <span style={{ width: 44, height: 16, borderRadius: 8, background: 'rgba(216,210,198,0.4)', display: 'inline-block' }} />
                    ) : eng ? (
                      <>
                        {eng.opened    && <EngTag label="Opened"    color="#3A7A3A" bg="#E8F3E8" icon={<Eye size={8} />} />}
                        {eng.clicked   && <EngTag label="Clicked"   color="#3A5FA0" bg="#EEF5FF" icon={<MousePointer size={8} />} />}
                        {eng.converted && <EngTag label="Converted" color="#7A4A1A" bg="#FFF4E6" icon={<ShoppingBag size={8} />} />}
                      </>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>

          {profiles.length > SHOW_LIMIT && (
            <button onClick={() => setProfilesExpanded(e => !e)}
              style={{ marginTop: 10, fontFamily: FONT, fontSize: 12, fontWeight: 600, color: INK_MID, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              {profilesExpanded ? '↑ Show less' : `↓ Show all ${profiles.length} subscribers`}
            </button>
          )}
        </div>
      )}

      {/* Klaviyo link */}
      <a href={`https://www.klaviyo.com/campaigns/${campaign.klaviyo_id}`} target="_blank" rel="noopener noreferrer"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontSize: 12, fontWeight: 600, color: INK_MID, textDecoration: 'none' }}>
        View in Klaviyo <ExternalLink size={12} />
      </a>
    </div>
  )
}

// ─── Flow Detail View ─────────────────────────────────────────────────────────

function FlowDetail({ flow, onBack }: { flow: Flow; onBack: () => void }) {
  const [detail, setDetail]         = useState<FlowDetailData | null>(null)
  const [flowEng, setFlowEng]       = useState<Record<string, FlowEngagement>>({})
  const [profiles, setProfiles]     = useState<Profile[]>([])
  const [loadingDetail, setLoadingDetail]     = useState(true)
  const [loadingEngagement, setLoadingEngagement] = useState(true)
  const [profilesExpanded, setProfilesExpanded]   = useState(false)

  useEffect(() => {
    setLoadingDetail(true)
    setLoadingEngagement(true)

    Promise.all([
      fetch(`/api/klaviyo/flows/${flow.klaviyo_id}`).then(r => r.json()),
      fetch('/api/klaviyo/profiles').then(r => r.json()),
    ]).then(([det, profs]) => {
      setDetail(det as FlowDetailData)
      setProfiles(Array.isArray(profs) ? profs : [])
      setLoadingDetail(false)
    }).catch(() => setLoadingDetail(false))

    fetch(`/api/klaviyo/flows/${flow.klaviyo_id}/engagement`)
      .then(r => r.json())
      .then((d: { engagement: Record<string, FlowEngagement> }) => setFlowEng(d.engagement ?? {}))
      .catch(() => {})
      .finally(() => setLoadingEngagement(false))
  }, [flow.klaviyo_id])

  const flowStatusColor: Record<string, { bg: string; text: string }> = {
    live:     { bg: '#E8F3E8', text: '#3A7A3A' },
    manual:   { bg: '#EEF5FF', text: '#3A5FA0' },
    draft:    { bg: '#F5F5F0', text: '#747474' },
    archived: { bg: '#FFF0EE', text: '#A05030' },
  }
  const sc = flowStatusColor[flow.status] ?? { bg: '#F5F5F0', text: '#747474' }

  const received  = detail?.stats?.received ?? 0
  const opened    = detail?.stats?.opened   ?? 0
  const clicked   = detail?.stats?.clicked  ?? 0
  const openRate  = received > 0 ? opened  / received : null
  const clickRate = received > 0 ? clicked / received : null

  // First email message in the flow
  const firstMsg = detail?.messages?.find(m => m.action_type === 'SEND_EMAIL') ?? detail?.messages?.[0]

  // Only show profiles that have any engagement with this flow (received/opened/clicked/converted)
  const SHOW_LIMIT = 8
  const engagedProfiles = profiles.filter(p => flowEng[p.klaviyo_id])
  const shownProfiles   = profilesExpanded ? engagedProfiles : engagedProfiles.slice(0, SHOW_LIMIT)

  return (
    <div>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontSize: 12, fontWeight: 600, color: INK_MID, background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 20px', letterSpacing: '0.02em' }}>
        <ArrowLeft size={13} /> All Flows
      </button>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <h3 style={{ fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: INK, margin: 0, lineHeight: 1.2 }}>{flow.name}</h3>
          <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.text, whiteSpace: 'nowrap', flexShrink: 0, textTransform: 'capitalize' }}>{flow.status}</span>
        </div>
        <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
          {flow.trigger_type && (
            <div style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT }}>
              <strong style={{ color: INK_MID }}>Trigger:</strong> {flow.trigger_type}
            </div>
          )}
          {flow.updated && (
            <div style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT }}>
              Updated {relDate(flow.updated)}
            </div>
          )}
        </div>
      </div>

      {/* Email preview (first message in flow) */}
      {(firstMsg?.subject || firstMsg?.from_email) && (
        <div style={{ borderRadius: 12, overflow: 'hidden', marginBottom: 20, border: BORDER, boxShadow: '0 2px 12px rgba(44,44,44,0.06)' }}>
          <div style={{ background: '#2C2C2C', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#C94040', display: 'inline-block' }} />
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#B87816', display: 'inline-block' }} />
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#3A7A3A', display: 'inline-block' }} />
            <span style={{ fontFamily: FONT, fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 8, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {firstMsg?.from_email ?? 'hello@weeknightdinnerparty.com'}
            </span>
          </div>
          <div style={{ background: OATMILK, padding: '12px 16px', borderBottom: BORDER }}>
            {firstMsg?.from_label && (
              <div style={{ fontFamily: FONT, fontSize: 11, color: INK_LIGHT, marginBottom: 4 }}>
                <strong style={{ color: INK_MID }}>{firstMsg.from_label}</strong>
                {firstMsg.from_email && <span style={{ marginLeft: 6 }}>&lt;{firstMsg.from_email}&gt;</span>}
              </div>
            )}
            {firstMsg?.subject && (
              <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: INK, lineHeight: 1.3 }}>{firstMsg.subject}</div>
            )}
            {firstMsg?.name && firstMsg.name !== firstMsg.subject && (
              <div style={{ fontFamily: FONT, fontSize: 11, color: INK_LIGHT, marginTop: 2 }}>{firstMsg.name}</div>
            )}
          </div>
          {firstMsg?.preview_text && (
            <div style={{ background: '#fff', padding: '14px 16px' }}>
              <div style={{ fontFamily: FONT, fontSize: 13, color: INK_MID, lineHeight: 1.6, fontStyle: 'italic' }}>
                {firstMsg.preview_text}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats — total all-time (365 days) */}
      {!loadingDetail && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 20 }}>
          {[
            { label: 'Received',   value: fmt(received) },
            { label: 'Open Rate',  value: openRate  != null ? (openRate  * 100).toFixed(1) + '%' : '—' },
            { label: 'Click Rate', value: clickRate != null ? (clickRate * 100).toFixed(1) + '%' : '—' },
          ].map(m => (
            <div key={m.label} style={{ background: '#fff', border: BORDER, borderRadius: 9, padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK_LIGHT, marginBottom: 5 }}>{m.label}</div>
              <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: INK }}>{m.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Engagement funnel */}
      {!loadingDetail && received > 0 && (
        <div style={{ background: '#fff', border: BORDER, borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
          <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK_LIGHT, marginBottom: 16 }}>Engagement (365 days)</div>
          <StatBar label="Opened"  value={opened}  total={received} color="#9BAE9A" icon={<Eye size={12} />} />
          <StatBar label="Clicked" value={clicked} total={received} color="#C27A54" icon={<MousePointer size={12} />} />
        </div>
      )}

      {/* Recipients — profiles with any engagement in last 90 days */}
      <div style={{ background: '#fff', border: BORDER, borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={13} style={{ color: INK_LIGHT }} />
            <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK_LIGHT }}>Recipients · Last 90 Days</span>
          </div>
          {!loadingEngagement && engagedProfiles.length > 0 && (
            <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: INK_LIGHT }}>{engagedProfiles.length} contacts</span>
          )}
        </div>

        {loadingEngagement ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(216,210,198,0.35)' }} />
                <div style={{ flex: 1, height: 12, borderRadius: 4, background: 'rgba(216,210,198,0.35)' }} />
                <div style={{ width: 44, height: 16, borderRadius: 8, background: 'rgba(216,210,198,0.35)' }} />
              </div>
            ))}
          </div>
        ) : engagedProfiles.length === 0 ? (
          <p style={{ fontFamily: FONT, fontSize: 12, color: INK_LIGHT, margin: 0 }}>No engagement data found in the last 90 days.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {shownProfiles.map((p, i) => {
              const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || null
              const eng  = flowEng[p.klaviyo_id]
              return (
                <div key={p.klaviyo_id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 0',
                  borderBottom: i < shownProfiles.length - 1 ? '1px solid rgba(216,210,198,0.2)' : 'none',
                }}>
                  {/* Avatar */}
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                    background: OATMILK, border: BORDER,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: FONT, fontSize: 11, fontWeight: 700, color: INK_MID,
                  }}>
                    {initials(p)}
                  </div>
                  {/* Name + email */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {name && <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>}
                    <div style={{ fontFamily: FONT, fontSize: 11, color: INK_MID, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</div>
                  </div>
                  {/* Engagement tags */}
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {eng?.received   && !eng.opened && <EngTag label="Received"  color="#747474" bg="#F5F5F0" icon={<Mail size={8} />} />}
                    {eng?.opened     && <EngTag label="Opened"    color="#3A7A3A" bg="#E8F3E8" icon={<Eye size={8} />} />}
                    {eng?.clicked    && <EngTag label="Clicked"   color="#3A5FA0" bg="#EEF5FF" icon={<MousePointer size={8} />} />}
                    {eng?.converted  && <EngTag label="Converted" color="#7A4A1A" bg="#FFF4E6" icon={<ShoppingBag size={8} />} />}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {engagedProfiles.length > SHOW_LIMIT && !loadingEngagement && (
          <button onClick={() => setProfilesExpanded(e => !e)}
            style={{ marginTop: 10, fontFamily: FONT, fontSize: 12, fontWeight: 600, color: INK_MID, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            {profilesExpanded ? '↑ Show less' : `↓ Show all ${engagedProfiles.length} contacts`}
          </button>
        )}
      </div>

      {/* All flow messages */}
      {!loadingDetail && detail?.messages && detail.messages.length > 1 && (
        <div style={{ background: '#fff', border: BORDER, borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
          <div style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: INK_LIGHT, marginBottom: 12 }}>Flow Emails ({detail.messages.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {detail.messages.map((m, i) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: i < detail.messages.length - 1 ? '1px solid rgba(216,210,198,0.2)' : 'none' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: OATMILK, border: BORDER, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, fontSize: 10, fontWeight: 700, color: INK_MID, flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.subject ?? m.name}</div>
                  {m.preview_text && <div style={{ fontFamily: FONT, fontSize: 11, color: INK_LIGHT, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic' }}>{m.preview_text}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Klaviyo link */}
      <a href={`https://www.klaviyo.com/flows/${flow.klaviyo_id}`} target="_blank" rel="noopener noreferrer"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontSize: 12, fontWeight: 600, color: INK_MID, textDecoration: 'none' }}>
        View in Klaviyo <ExternalLink size={12} />
      </a>
    </div>
  )
}

// ─── Main Drawer ──────────────────────────────────────────────────────────────

// Lightweight per-campaign card info fetched in bulk on drawer open
interface CampaignCardDetail {
  stats:    { received: number; opened: number; clicked: number }
  preview:  string | null
  fromLabel: string | null
}

export function KlaviyoDrawer() {
  const [data, setData] = useState<KlaviyoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [cardDetails, setCardDetails] = useState<Record<string, CampaignCardDetail>>({})
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null)
  const [tab, setTab] = useState<'campaigns' | 'flows'>('campaigns')

  useEffect(() => {
    setLoading(true)
    fetch('/api/klaviyo/data')
      .then(r => r.json())
      .then((d: KlaviyoData) => {
        setData(d)
        // Fetch detail for each sent campaign in parallel to get real stats + preview text
        const sent = (d.campaigns ?? []).filter(c => c.status === 'Sent')
        Promise.all(
          sent.map(c =>
            fetch(`/api/klaviyo/campaigns/${c.klaviyo_id}`)
              .then(r => r.json())
              .then((det: CampaignDetail) => ({
                id: c.klaviyo_id,
                detail: {
                  stats:     det.stats ?? { received: 0, opened: 0, clicked: 0 },
                  preview:   det.messages?.[0]?.preview_text ?? null,
                  fromLabel: det.messages?.[0]?.from_label ?? null,
                } as CampaignCardDetail,
              }))
              .catch(() => null)
          )
        ).then(results => {
          const map: Record<string, CampaignCardDetail> = {}
          for (const r of results) { if (r) map[r.id] = r.detail }
          setCardDetails(map)
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ fontFamily: FONT, fontSize: 13, color: INK_LIGHT, padding: '40px 0', textAlign: 'center' }}>Loading…</div>
  if (!data)   return <div style={{ fontFamily: FONT, fontSize: 13, color: INK_LIGHT, padding: '40px 0', textAlign: 'center' }}>Could not load Klaviyo data.</div>

  if (selectedCampaign) return <CampaignDetail campaign={selectedCampaign} onBack={() => setSelectedCampaign(null)} />
  if (selectedFlow)     return <FlowDetail flow={selectedFlow} onBack={() => setSelectedFlow(null)} />

  const metrics     = data.metrics ?? {}
  const received    = metrics['Received Email'] ?? 0
  const opened      = metrics['Opened Email']   ?? 0
  const clicked     = metrics['Clicked Email']  ?? 0
  const openRate    = received > 0 ? (opened  / received * 100).toFixed(1) + '%' : '—'
  const clickRate   = received > 0 ? (clicked / received * 100).toFixed(1) + '%' : '—'
  const liveFlows   = (data.flows ?? []).filter(f => f.status === 'live' || f.status === 'manual')
  const sentCampaigns = (data.campaigns ?? []).filter(c => c.status === 'Sent')

  const flowStatusColor: Record<string, { bg: string; text: string }> = {
    live:     { bg: '#E8F3E8', text: '#3A7A3A' },
    manual:   { bg: '#EEF5FF', text: '#3A5FA0' },
    draft:    { bg: '#F5F5F0', text: '#747474' },
    archived: { bg: '#FFF0EE', text: '#A05030' },
  }

  return (
    <div>
      {/* Top KPIs */}
      <KpiGrid items={[
        { label: 'Subscribers',   value: fmt(data.total_subscribers), sub: data.lists[0]?.name },
        { label: 'Open Rate 30d', value: openRate,  sub: `${fmt(opened)} of ${fmt(received)}` },
        { label: 'Click Rate 30d',value: clickRate, sub: `${fmt(clicked)} clicks` },
        { label: 'Active Flows',  value: String(liveFlows.length), sub: `${data.flows.length} total` },
      ]} />

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(216,210,198,0.5)', marginBottom: 20 }}>
        {(['campaigns', 'flows'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontFamily: FONT, fontSize: 13, fontWeight: tab === t ? 700 : 500,
            color: tab === t ? INK : INK_MID,
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '8px 12px 10px',
            borderBottom: tab === t ? '2px solid #2C2C2C' : '2px solid transparent',
            marginBottom: -1, textTransform: 'capitalize',
          }}>
            {t === 'campaigns' ? `Campaigns (${sentCampaigns.length})` : `Flows (${data.flows.length})`}
          </button>
        ))}
      </div>

      {/* ── Campaigns tab ── */}
      {tab === 'campaigns' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sentCampaigns.length === 0 && <p style={{ fontFamily: FONT, fontSize: 13, color: INK_LIGHT }}>No sent campaigns found.</p>}
          {sentCampaigns.map(c => {
            const cd = cardDetails[c.klaviyo_id]

            // Prefer live API stats; fall back to DB (treating 0 as no-data)
            const sent    = cd?.stats?.received || c.recipients  || null
            const opens   = cd?.stats?.opened   || c.unique_opens || c.opens   || null
            const clicks  = cd?.stats?.clicked  || c.unique_clicks || c.clicks || null
            const openRate  = sent && opens  ? opens  / sent : null
            const clickRate = sent && clicks ? clicks / sent : null

            const sentStr = sent   ? fmt(sent)   : (cd ? '—' : '…')
            const orStr   = openRate  != null ? (openRate  * 100).toFixed(1) + '%' : (cd ? '—' : '…')
            const crStr   = clickRate != null ? (clickRate * 100).toFixed(1) + '%' : (cd ? '—' : '…')

            const previewText = cd?.preview ?? null
            const fromLabel   = cd?.fromLabel ?? 'Weeknight Dinner Party'
            const senderDomain = c.from_email?.split('@')[1]?.replace('weeknightdinnerparty.com', 'WDP') ?? 'WDP'

            return (
              <button key={c.klaviyo_id} onClick={() => setSelectedCampaign(c)}
                style={{ width: '100%', textAlign: 'left', background: '#fff', border: BORDER, borderRadius: 12, overflow: 'hidden', cursor: 'pointer', transition: 'box-shadow 0.12s ease, border-color 0.12s ease' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 12px rgba(44,44,44,0.1)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(194,122,84,0.5)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(216,210,198,0.6)' }}
              >
                {/* Email client chrome */}
                <div style={{ background: '#2C2C2C', padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#C94040', display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#B87816', display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3A7A3A', display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontFamily: FONT, fontSize: 9, color: 'rgba(255,255,255,0.35)', marginLeft: 6, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.from_email ?? 'hello@weeknightdinnerparty.com'}
                  </span>
                  <span style={{ fontFamily: FONT, fontSize: 9, color: 'rgba(255,255,255,0.25)', flexShrink: 0 }}>{relDate(c.send_time)}</span>
                </div>

                {/* Email meta: from + subject */}
                <div style={{ background: OATMILK, padding: '8px 12px', borderBottom: BORDER }}>
                  <div style={{ fontFamily: FONT, fontSize: 10, color: INK_MID, marginBottom: 3 }}>
                    <strong style={{ color: INK }}>{fromLabel}</strong>
                    {' '}<span style={{ color: INK_LIGHT }}>via {senderDomain}</span>
                  </div>
                  {c.subject && (
                    <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 700, color: INK, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.subject}
                    </div>
                  )}
                </div>

                {/* Preview text body */}
                {previewText && (
                  <div style={{ background: '#fff', padding: '8px 12px', borderBottom: BORDER }}>
                    <div style={{ fontFamily: FONT, fontSize: 11, color: INK_MID, lineHeight: 1.5, fontStyle: 'italic',
                      overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {previewText}
                    </div>
                  </div>
                )}

                {/* Campaign name + live stats */}
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: INK_MID, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name}
                  </div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    {[
                      { label: 'Sent',  value: sentStr },
                      { label: 'Open',  value: orStr },
                      { label: 'Click', value: crStr },
                      ...((c.revenue ?? 0) > 0 ? [{ label: 'Rev', value: '$' + fmt(c.revenue) }] : []),
                    ].map(m => (
                      <div key={m.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontFamily: FONT, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK_LIGHT }}>{m.label}</span>
                        <span style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: m.label === 'Rev' ? '#3A8A5A' : (m.value === '—' || m.value === '…') ? INK_LIGHT : INK }}>{m.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Flows tab ── */}
      {tab === 'flows' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.flows.map(f => {
            const sc = flowStatusColor[f.status] ?? { bg: '#F5F5F0', text: '#747474' }
            return (
              <button key={f.klaviyo_id} onClick={() => setSelectedFlow(f)}
                style={{ width: '100%', textAlign: 'left', background: '#fff', border: BORDER, borderRadius: 10, padding: '14px 16px', cursor: 'pointer', transition: 'box-shadow 0.12s ease, border-color 0.12s ease', display: 'flex', alignItems: 'center', gap: 12 }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 10px rgba(44,44,44,0.08)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(194,122,84,0.5)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(216,210,198,0.6)' }}
              >
                <Zap size={15} style={{ color: INK_LIGHT, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: INK, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                  {f.trigger_type && <div style={{ fontFamily: FONT, fontSize: 11, color: INK_LIGHT }}>{f.trigger_type}</div>}
                </div>
                <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: sc.bg, color: sc.text, flexShrink: 0, textTransform: 'capitalize' }}>{f.status}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 28, paddingTop: 16, borderTop: '1px solid rgba(216,210,198,0.4)' }}>
        <a href="https://www.klaviyo.com" target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: FONT, fontSize: 12, fontWeight: 600, color: INK_LIGHT, textDecoration: 'none' }}>
          <Mail size={13} /> Open Klaviyo <ExternalLink size={11} />
        </a>
      </div>
    </div>
  )
}
