import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getKlaviyoConfig } from '@/lib/klaviyo'

async function fetchCampaignMetric(
  apiKey: string,
  metricId: string,
  campaignId: string,
  measurement: 'count' | 'unique',
): Promise<number> {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 365)
  const fmt = (d: Date) => d.toISOString().split('.')[0]

  const res = await fetch('https://a.klaviyo.com/api/metric-aggregates/', {
    method: 'POST',
    headers: {
      'Authorization': `Klaviyo-API-Key ${apiKey}`,
      'revision': '2024-10-15',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: {
        type: 'metric-aggregate',
        attributes: {
          metric_id: metricId,
          measurements: [measurement],
          interval: 'month',
          filter: [
            `greater-or-equal(datetime,${fmt(start)})`,
            `less-than(datetime,${fmt(end)})`,
            `equals($message,"${campaignId}")`,
          ],
          page_size: 500,
        },
      },
    }),
  })
  if (!res.ok) return 0
  const data = await res.json() as {
    data: { attributes: { data: Array<{ measurements: Record<string, number[]> }> } }
  }
  const rows = data.data?.attributes?.data ?? []
  let total = 0
  for (const row of rows) {
    const vals = row.measurements[measurement] ?? []
    total += vals.reduce((s, v) => s + v, 0)
  }
  return total
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const db = await getDb()
  const config = await getKlaviyoConfig(db)
  if (!config) return NextResponse.json({ error: 'Klaviyo not configured' }, { status: 400 })

  const metricRows = (await db.execute({sql: `SELECT metric_name, klaviyo_metric_id FROM klaviyo_metrics WHERE klaviyo_metric_id IS NOT NULL`, args: []})).rows as unknown as { metric_name: string; klaviyo_metric_id: string }[]
  const metricIds: Record<string, string> = {}
  for (const r of metricRows) metricIds[r.metric_name] = r.klaviyo_metric_id

  const HEADERS = {
    'Authorization': `Klaviyo-API-Key ${config.api_key}`,
    'revision': '2024-10-15',
  }

  const [campaignRes, messagesRes] = await Promise.all([
    fetch(`https://a.klaviyo.com/api/campaigns/${id}/`, { headers: HEADERS }),
    fetch(`https://a.klaviyo.com/api/campaigns/${id}/campaign-messages/`, { headers: HEADERS }),
  ])
  if (!campaignRes.ok) return NextResponse.json({ error: `Klaviyo error ${campaignRes.status}` }, { status: 502 })

  const data = await campaignRes.json() as {
    data: { id: string; attributes: { name: string; status: string; send_time: string | null } }
  }

  const msgsData = messagesRes.ok ? await messagesRes.json() as {
    data: Array<{
      id: string
      attributes: {
        label?: string
        channel?: string
        content?: { subject?: string; preview_text?: string; from_label?: string; from_email?: string }
      }
    }>
  } : { data: [] }

  const messages = (msgsData.data ?? []).map(m => ({
    id: m.id,
    name: m.attributes.label ?? 'Message',
    status: 'sent',
    subject: m.attributes.content?.subject ?? null,
    preview_text: m.attributes.content?.preview_text ?? null,
    from_label: m.attributes.content?.from_label ?? null,
    from_email: m.attributes.content?.from_email ?? null,
  }))

  const stats = { received: 0, opened: 0, clicked: 0 }
  try {
    const [recv, opnd, clkd] = await Promise.all([
      metricIds['Received Email'] ? fetchCampaignMetric(config.api_key, metricIds['Received Email'], id, 'count')  : Promise.resolve(0),
      metricIds['Opened Email']   ? fetchCampaignMetric(config.api_key, metricIds['Opened Email'],   id, 'unique') : Promise.resolve(0),
      metricIds['Clicked Email']  ? fetchCampaignMetric(config.api_key, metricIds['Clicked Email'],  id, 'unique') : Promise.resolve(0),
    ])
    stats.received = recv
    stats.opened = opnd
    stats.clicked = clkd
  } catch { /* leave zeros */ }

  return NextResponse.json({
    id: data.data.id,
    name: data.data.attributes.name,
    status: data.data.attributes.status,
    send_time: data.data.attributes.send_time,
    messages,
    stats,
  })
}
