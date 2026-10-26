import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getKlaviyoConfig } from '@/lib/klaviyo'

async function fetchFlowMetric(
  apiKey: string,
  metricId: string,
  flowId: string,
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
      'revision': '2024-02-15',
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
          ],
          by: ['$flow'],
          page_size: 500,
        },
      },
    }),
  })
  if (!res.ok) return 0
  const data = await res.json() as {
    data: { attributes: { data: Array<{ dimensions: string[]; measurements: Record<string, number[]> }> } }
  }
  // Group-by approach: find rows attributed to this specific flow
  const rows = data.data?.attributes?.data ?? []
  let total = 0
  for (const row of rows) {
    if (row.dimensions?.[0] === flowId) {
      const vals = row.measurements[measurement] ?? []
      total += vals.reduce((s, v) => s + v, 0)
    }
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

  const headers = {
    'Authorization': `Klaviyo-API-Key ${config.api_key}`,
    'revision': '2024-02-15',
  }

  // Get stored metric IDs
  const metricRows = (await db.execute({sql: `SELECT metric_name, klaviyo_metric_id FROM klaviyo_metrics WHERE klaviyo_metric_id IS NOT NULL`, args: []})).rows as unknown as { metric_name: string; klaviyo_metric_id: string }[]
  const metricIds: Record<string, string> = {}
  for (const r of metricRows) metricIds[r.metric_name] = r.klaviyo_metric_id

  // Fetch flow actions
  const actionsRes = await fetch(
    `https://a.klaviyo.com/api/flows/${id}/flow-actions/?fields%5Bflow-action%5D=action_type,status`,
    { headers }
  )
  if (!actionsRes.ok) return NextResponse.json({ error: `Klaviyo error ${actionsRes.status}` }, { status: 502 })
  const actionsData = await actionsRes.json() as {
    data: Array<{ id: string; attributes: { action_type: string; status: string } }>
  }

  const messages: Array<{
    id: string; action_id: string; action_type: string; action_status: string
    name: string; subject: string | null; preview_text: string | null
    from_label: string | null; from_email: string | null
    body: string | null; html: string | null; created: string | null; updated: string | null
  }> = []

  for (const action of actionsData.data) {
    const msgRes = await fetch(
      `https://a.klaviyo.com/api/flow-actions/${action.id}/flow-messages/?fields%5Bflow-message%5D=name,content,created,updated`,
      { headers }
    )
    if (!msgRes.ok) continue
    const msgData = await msgRes.json() as {
      data: Array<{
        id: string
        attributes: {
          name: string
          content?: { subject?: string; preview_text?: string; from_label?: string; from_email?: string; body?: string }
          created?: string; updated?: string
        }
      }>
    }

    for (const m of msgData.data) {
      let html: string | null = null
      const tmplRes = await fetch(
        `https://a.klaviyo.com/api/flow-messages/${m.id}/template/?fields%5Btemplate%5D=html`,
        { headers }
      )
      if (tmplRes.ok) {
        const tmplData = await tmplRes.json() as { data?: { attributes?: { html?: string } } }
        html = tmplData.data?.attributes?.html ?? null
      }
      messages.push({
        id: m.id, action_id: action.id,
        action_type: action.attributes.action_type, action_status: action.attributes.status,
        name: m.attributes.name,
        subject: m.attributes.content?.subject ?? null,
        preview_text: m.attributes.content?.preview_text ?? null,
        from_label: m.attributes.content?.from_label ?? null,
        from_email: m.attributes.content?.from_email ?? null,
        body: m.attributes.content?.body ?? null,
        html,
        created: m.attributes.created ?? null,
        updated: m.attributes.updated ?? null,
      })
    }
  }

  // Fetch per-flow engagement stats
  const stats = { received: 0, opened: 0, clicked: 0 }
  try {
    const [recv, opnd, clkd] = await Promise.all([
      metricIds['Received Email'] ? fetchFlowMetric(config.api_key, metricIds['Received Email'], id, 'count') : Promise.resolve(0),
      metricIds['Opened Email']   ? fetchFlowMetric(config.api_key, metricIds['Opened Email'],   id, 'unique') : Promise.resolve(0),
      metricIds['Clicked Email']  ? fetchFlowMetric(config.api_key, metricIds['Clicked Email'],  id, 'unique') : Promise.resolve(0),
    ])
    stats.received = recv
    stats.opened = opnd
    stats.clicked = clkd
  } catch { /* leave zeros */ }

  return NextResponse.json({ messages, stats })
}
