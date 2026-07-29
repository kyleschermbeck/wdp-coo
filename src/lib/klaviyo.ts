import Database from 'better-sqlite3'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KlaviyoConfig {
  id: number
  api_key: string
  account_name: string | null
  last_synced_at: string | null
}

export interface KlaviyoList {
  id: string
  name: string
  profile_count: number
}

export interface KlaviyoCampaign {
  id: string
  name: string
  status: string
  subject: string | null
  from_email: string | null
  send_time: string | null
}

export interface KlaviyoFlow {
  id: string
  name: string
  status: string
  trigger_type: string | null
  created: string | null
  updated: string | null
}

export interface KlaviyoMetricSummary {
  metric_name: string
  klaviyo_metric_id: string | null
  value_30d: number
}

export interface KlaviyoSyncResult {
  lists_synced: number
  campaigns_synced: number
  flows_synced: number
  metrics_synced: number
  account_name: string
  synced_at: string
}

// ─── Config ───────────────────────────────────────────────────────────────────

export function getKlaviyoConfig(db: Database.Database): KlaviyoConfig | null {
  const row = db.prepare('SELECT * FROM klaviyo_config WHERE id = 1').get() as KlaviyoConfig | undefined
  return row ?? null
}

// ─── Fetch helper ─────────────────────────────────────────────────────────────

function klaviyoFetch(apiKey: string, path: string, options: RequestInit = {}) {
  return fetch(`https://a.klaviyo.com/api${path}`, {
    ...options,
    headers: {
      'Authorization': `Klaviyo-API-Key ${apiKey}`,
      'revision': '2024-02-15',
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  })
}

// ─── Test connection ───────────────────────────────────────────────────────────

export async function testKlaviyoConnection(apiKey: string): Promise<{ id: string; name: string }> {
  const res = await klaviyoFetch(apiKey, '/accounts/')
  if (!res.ok) throw new Error(`Klaviyo connection failed (${res.status}): ${await res.text()}`)
  const data = await res.json() as {
    data: Array<{ id: string; attributes: { contact_information: { organization_name: string } } }>
  }
  const account = data.data[0]
  if (!account) throw new Error('No account found')
  return { id: account.id, name: account.attributes.contact_information.organization_name }
}

// ─── Fetch lists (with profile counts via per-list pagination) ────────────────

async function countListProfiles(apiKey: string, listId: string): Promise<number> {
  let count = 0
  let url = `/lists/${listId}/profiles/?page[size]=100&fields[profile]=id`
  while (url) {
    const res = await klaviyoFetch(apiKey, url.startsWith('/') ? url : url.replace('https://a.klaviyo.com/api', ''))
    if (!res.ok) break
    const data = await res.json() as { data: unknown[]; links: { next?: string | null } }
    count += data.data.length
    const next = data.links?.next
    if (!next) break
    // Extract path from absolute URL
    url = next.replace('https://a.klaviyo.com/api', '')
  }
  return count
}

export async function fetchKlaviyoLists(apiKey: string): Promise<KlaviyoList[]> {
  const res = await klaviyoFetch(apiKey, '/lists/?fields[list]=name')
  if (!res.ok) throw new Error(`Failed to fetch Klaviyo lists (${res.status}): ${await res.text()}`)
  const data = await res.json() as {
    data: Array<{ id: string; attributes: { name: string } }>
  }
  // Fetch profile count for each list (sequential to respect rate limits)
  const lists: KlaviyoList[] = []
  for (const l of data.data) {
    const profile_count = await countListProfiles(apiKey, l.id)
    lists.push({ id: l.id, name: l.attributes.name, profile_count })
  }
  return lists
}

// ─── Fetch campaigns ──────────────────────────────────────────────────────────

export async function fetchKlaviyoCampaigns(apiKey: string): Promise<KlaviyoCampaign[]> {
  const filter = encodeURIComponent("equals(messages.channel,'email')")
  const url = `/campaigns/?filter=${filter}&include=campaign-messages&fields%5Bcampaign%5D=name,status,send_time&fields%5Bcampaign-message%5D=content&sort=-created_at`
  const res = await klaviyoFetch(apiKey, url)
  if (!res.ok) throw new Error(`Failed to fetch Klaviyo campaigns (${res.status}): ${await res.text()}`)
  const data = await res.json() as {
    data: Array<{
      id: string
      attributes: { name: string; status: string; send_time: string | null }
      relationships: { 'campaign-messages': { data: Array<{ id: string }> } }
    }>
    included?: Array<{
      id: string; type: string
      attributes: { content?: { subject?: string; from_email?: string } }
    }>
  }
  const messageMap = new Map<string, { subject?: string; from_email?: string }>()
  for (const inc of data.included ?? []) {
    if (inc.type === 'campaign-message') {
      messageMap.set(inc.id, { subject: inc.attributes.content?.subject, from_email: inc.attributes.content?.from_email })
    }
  }
  return data.data.map(c => {
    const firstMsgId = c.relationships?.['campaign-messages']?.data?.[0]?.id
    const msg = firstMsgId ? messageMap.get(firstMsgId) : undefined
    return { id: c.id, name: c.attributes.name, status: c.attributes.status, subject: msg?.subject ?? null, from_email: msg?.from_email ?? null, send_time: c.attributes.send_time ?? null }
  })
}

// ─── Fetch flows ──────────────────────────────────────────────────────────────

export async function fetchKlaviyoFlows(apiKey: string): Promise<KlaviyoFlow[]> {
  const res = await klaviyoFetch(apiKey, `/flows/?fields%5Bflow%5D=name,status,trigger_type,created,updated&sort=-updated`)
  if (!res.ok) throw new Error(`Failed to fetch Klaviyo flows (${res.status}): ${await res.text()}`)
  const data = await res.json() as {
    data: Array<{
      id: string
      attributes: { name: string; status: string; trigger_type?: string; created?: string; updated?: string }
    }>
  }
  return data.data.map(f => ({
    id: f.id,
    name: f.attributes.name,
    status: f.attributes.status,
    trigger_type: f.attributes.trigger_type ?? null,
    created: f.attributes.created ?? null,
    updated: f.attributes.updated ?? null,
  }))
}

// ─── Profiles ─────────────────────────────────────────────────────────────────

export interface KlaviyoProfile {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  created: string | null
  updated: string | null
}

export async function fetchKlaviyoProfiles(apiKey: string): Promise<KlaviyoProfile[]> {
  const profiles: KlaviyoProfile[] = []
  let url = `/profiles/?fields%5Bprofile%5D=email,first_name,last_name,phone,created,updated&page%5Bsize%5D=100`
  while (url) {
    const res = await klaviyoFetch(apiKey, url.startsWith('/') ? url : url.replace('https://a.klaviyo.com/api', ''))
    if (!res.ok) break
    const data = await res.json() as {
      data: Array<{ id: string; attributes: { email?: string; first_name?: string; last_name?: string; phone?: string; created?: string; updated?: string } }>
      links: { next?: string | null }
    }
    for (const p of data.data) {
      profiles.push({ id: p.id, email: p.attributes.email ?? null, first_name: p.attributes.first_name ?? null, last_name: p.attributes.last_name ?? null, phone: p.attributes.phone ?? null, created: p.attributes.created ?? null, updated: p.attributes.updated ?? null })
    }
    const next = data.links?.next
    if (!next) break
    url = next.replace('https://a.klaviyo.com/api', '')
  }
  return profiles
}

export async function createKlaviyoCampaign(
  apiKey: string,
  params: {
    name: string
    channel: 'email' | 'sms'
    list_id: string
    subject?: string
    from_name?: string
    from_email?: string
    body?: string
  }
): Promise<{ campaign_id: string; message_id: string }> {
  const content = params.channel === 'email'
    ? { subject: params.subject ?? '', preview_text: '', from_name: params.from_name ?? 'Weeknight Dinner Party', from_email: params.from_email ?? '', reply_to_email: params.from_email ?? '' }
    : { body: params.body ?? '' }

  // Create campaign with message inline (API requires campaign-messages at creation time)
  const campaignRes = await klaviyoFetch(apiKey, '/campaigns/', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'campaign',
        attributes: {
          name: params.name,
          audiences: { included: [params.list_id], excluded: [] },
          send_options: { use_smart_sending: true },
          send_strategy: { method: 'immediate' },
          tracking_options: { is_add_utm: false, utm_params: [] },
          'campaign-messages': {
            data: [{
              type: 'campaign-message',
              attributes: { channel: params.channel, label: params.name, content },
            }],
          },
        },
      },
    }),
  })
  if (!campaignRes.ok) throw new Error(`Failed to create campaign (${campaignRes.status}): ${await campaignRes.text()}`)
  const campaignData = await campaignRes.json() as {
    data: { id: string; relationships?: { 'campaign-messages'?: { data?: Array<{ id: string }> } } }
  }
  const campaign_id = campaignData.data.id
  const message_id = campaignData.data.relationships?.['campaign-messages']?.data?.[0]?.id ?? ''
  return { campaign_id, message_id }
}

// ─── Fetch metrics ─────────────────────────────────────────────────────────────

async function fetchMetricId(apiKey: string, nameContains: string): Promise<string | null> {
  const res = await klaviyoFetch(apiKey, `/metrics/?fields[metric]=name`)
  if (!res.ok) return null
  const data = await res.json() as {
    data: Array<{ id: string; attributes: { name: string } }>
  }
  const found = data.data.find(m =>
    m.attributes.name.toLowerCase().includes(nameContains.toLowerCase())
  )
  return found?.id ?? null
}

async function fetchMetricAggregate30d(apiKey: string, metricId: string, measurement: 'count' | 'unique'): Promise<number> {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 90)

  const fmt = (d: Date) => d.toISOString().split('.')[0]

  const res = await klaviyoFetch(apiKey, '/metric-aggregates/', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'metric-aggregate',
        attributes: {
          metric_id: metricId,
          measurements: [measurement],
          interval: 'day',
          filter: [
            `greater-or-equal(datetime,${fmt(start)})`,
            `less-than(datetime,${fmt(end)})`,
          ],
        },
      },
    }),
  })

  if (!res.ok) return 0

  const data = await res.json() as {
    data: { attributes: { data: Array<{ measurements: Record<string, number[]> }> } }
  }

  const rows = data.data?.attributes?.data ?? []
  return rows.reduce((sum, row) => {
    const vals = row.measurements[measurement] ?? []
    return sum + vals.reduce((s, v) => s + v, 0)
  }, 0)
}

// ─── Main sync ─────────────────────────────────────────────────────────────────

export async function syncKlaviyoData(db: Database.Database): Promise<KlaviyoSyncResult> {
  const config = getKlaviyoConfig(db)
  if (!config) throw new Error('Klaviyo not configured')
  const { api_key } = config

  // ── Account ──
  const account = await testKlaviyoConnection(api_key)
  db.prepare(`UPDATE klaviyo_config SET account_name = ? WHERE id = 1`).run(account.name)

  // ── Lists ──
  const lists = await fetchKlaviyoLists(api_key)
  const upsertList = db.prepare(`
    INSERT INTO klaviyo_lists (klaviyo_id, name, profile_count)
    VALUES (?, ?, ?)
    ON CONFLICT(klaviyo_id) DO UPDATE SET
      name = excluded.name, profile_count = excluded.profile_count, synced_at = datetime('now')
  `)
  db.transaction(() => {
    for (const l of lists) upsertList.run(l.id, l.name, l.profile_count)
  })()

  // ── Campaigns ──
  const campaigns = await fetchKlaviyoCampaigns(api_key)
  const upsertCampaign = db.prepare(`
    INSERT INTO klaviyo_campaigns (klaviyo_id, name, status, subject, from_email, send_time)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(klaviyo_id) DO UPDATE SET
      name = excluded.name, status = excluded.status, subject = excluded.subject,
      from_email = excluded.from_email, send_time = excluded.send_time, synced_at = datetime('now')
  `)
  db.transaction(() => {
    for (const c of campaigns) upsertCampaign.run(c.id, c.name, c.status, c.subject, c.from_email, c.send_time)
  })()

  // ── Flows ──
  const flows = await fetchKlaviyoFlows(api_key)
  const upsertFlow = db.prepare(`
    INSERT INTO klaviyo_flows (klaviyo_id, name, status, trigger_type, created, updated)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(klaviyo_id) DO UPDATE SET
      name = excluded.name, status = excluded.status, trigger_type = excluded.trigger_type,
      updated = excluded.updated, synced_at = datetime('now')
  `)
  db.transaction(() => {
    for (const f of flows) upsertFlow.run(f.id, f.name, f.status, f.trigger_type, f.created, f.updated)
  })()

  // ── Profiles + list memberships (fetch per list) ──
  const upsertProfile = db.prepare(`
    INSERT INTO klaviyo_profiles (klaviyo_id, email, first_name, last_name, phone, created, updated)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(klaviyo_id) DO UPDATE SET
      email = excluded.email, first_name = excluded.first_name, last_name = excluded.last_name,
      phone = excluded.phone, updated = excluded.updated, synced_at = datetime('now')
  `)
  db.prepare('DELETE FROM klaviyo_profile_lists').run()
  const insertMembership = db.prepare(`INSERT OR IGNORE INTO klaviyo_profile_lists (profile_id, list_id, list_name) VALUES (?, ?, ?)`)
  for (const list of lists) {
    let url = `/lists/${list.id}/profiles/?fields%5Bprofile%5D=email,first_name,last_name,phone_number,created,updated&page%5Bsize%5D=100`
    while (url) {
      const r = await klaviyoFetch(api_key, url.startsWith('/') ? url : url.replace('https://a.klaviyo.com/api', ''))
      if (!r.ok) break
      const d = await r.json() as {
        data: Array<{
          id: string
          attributes: { email?: string; first_name?: string; last_name?: string; phone_number?: string; created?: string; updated?: string }
        }>
        links: { next?: string | null }
      }
      db.transaction(() => {
        for (const p of d.data) {
          upsertProfile.run(p.id, p.attributes.email ?? null, p.attributes.first_name ?? null, p.attributes.last_name ?? null, p.attributes.phone_number ?? null, p.attributes.created ?? null, p.attributes.updated ?? null)
          insertMembership.run(p.id, list.id, list.name)
        }
      })()
      const next = d.links?.next
      if (!next) break
      url = next.replace('https://a.klaviyo.com/api', '')
    }
  }

  // ── Metrics (30d aggregates) ──
  let metricsCount = 0
  const upsertMetric = db.prepare(`
    INSERT INTO klaviyo_metrics (metric_name, klaviyo_metric_id, value_30d)
    VALUES (?, ?, ?)
    ON CONFLICT(metric_name) DO UPDATE SET
      klaviyo_metric_id = excluded.klaviyo_metric_id, value_30d = excluded.value_30d, updated_at = datetime('now')
  `)

  const metricTargets = [
    { name: 'Received Email',      search: 'Received Email',      measurement: 'count'  as const },
    { name: 'Opened Email',        search: 'Opened Email',        measurement: 'unique' as const },
    { name: 'Clicked Email',       search: 'Clicked Email',       measurement: 'unique' as const },
    { name: 'Unsubscribed',        search: 'Unsubscribed',        measurement: 'count'  as const },
    { name: 'Received Flow Email', search: 'Received Flow Email', measurement: 'count'  as const },
    { name: 'Opened Flow Email',   search: 'Opened Flow Email',   measurement: 'unique' as const },
    { name: 'Clicked Flow Email',  search: 'Clicked Flow Email',  measurement: 'unique' as const },
  ]

  for (const target of metricTargets) {
    try {
      const metricId = await fetchMetricId(api_key, target.search)
      if (metricId) {
        const value = await fetchMetricAggregate30d(api_key, metricId, target.measurement)
        upsertMetric.run(target.name, metricId, value)
        metricsCount++
      }
    } catch { /* skip individual metric failures */ }
  }

  const now = new Date().toISOString()
  db.prepare(`UPDATE klaviyo_config SET last_synced_at = ? WHERE id = 1`).run(now)

  return {
    lists_synced: lists.length,
    campaigns_synced: campaigns.length,
    flows_synced: flows.length,
    metrics_synced: metricsCount,
    account_name: account.name,
    synced_at: now,
  }
}
