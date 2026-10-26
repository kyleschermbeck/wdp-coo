import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getShopifyConfig } from '@/lib/shopify'

// Shopify GraphQL Admin API — marketingActivities (Campaign Autopilot + other channels)
// Requires read_marketing_events scope on the Shopify token.

const GQL_QUERY = `
  query GetMarketingActivities($first: Int!, $after: String) {
    marketingActivities(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          status
          marketingChannelType
          budget {
            budgetType
            total { amount currencyCode }
          }
          adSpend { amount currencyCode }
          marketingEvent {
            startedAt
            scheduledToEndAt
            type
          }
          utmParameters {
            source
            medium
            campaign
          }
        }
      }
    }
  }
`

export interface CampaignActivity {
  id: string
  title: string
  status: string
  channel: string
  budget_total: number | null
  budget_remaining: number | null
  currency: string
  start: string | null
  end: string | null
  clicks: number
  impressions: number
  spent: number
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
}

export async function GET() {
  const db = getDb()
  const config = getShopifyConfig(db)
  if (!config) return NextResponse.json({ error: 'Shopify not connected' }, { status: 400 })

  const url = `https://${config.store_url}/admin/api/2024-01/graphql.json`
  const headers = {
    'X-Shopify-Access-Token': config.access_token,
    'Content-Type': 'application/json',
  }

  const activities: CampaignActivity[] = []
  let after: string | null = null
  let pages = 0

  try {
    do {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: GQL_QUERY,
          variables: { first: 50, ...(after ? { after } : {}) },
        }),
      })

      if (!res.ok) {
        const text = await res.text()
        // If scope missing, return a clear error rather than 500
        if (res.status === 403 || text.includes('ACCESS_DENIED')) {
          return NextResponse.json({
            error: 'scope_missing',
            message: 'The read_marketing_events scope is required. Reconnect Shopify in Settings to enable Campaign Autopilot data.',
            activities: [],
          })
        }
        return NextResponse.json({ error: `Shopify API error (${res.status})`, activities: [] })
      }

      const json = await res.json() as {
        data?: {
          marketingActivities?: {
            pageInfo: { hasNextPage: boolean; endCursor: string | null }
            edges: Array<{
              node: {
                id: string
                title: string
                status: string
                marketingChannelType?: string
                budget?: {
                  budgetType?: string
                  total?: { amount: string; currencyCode: string }
                }
                adSpend?: { amount: string; currencyCode: string }
                marketingEvent?: {
                  startedAt?: string
                  scheduledToEndAt?: string
                  type?: string
                }
                utmParameters?: { source?: string; medium?: string; campaign?: string }
              }
            }>
          }
        }
        errors?: Array<{ message: string }>
      }

      // Surface GraphQL errors — only flag scope_missing on explicit access denial
      if (json.errors?.length) {
        const msg = json.errors[0].message
        const isAccessDenied = msg.toLowerCase().includes('access denied') || msg.toLowerCase().includes('read_marketing_events')
        if (isAccessDenied) {
          return NextResponse.json({
            error: 'scope_missing',
            message: 'The read_marketing_events scope is required. Reconnect Shopify in Settings to enable Campaign Autopilot data.',
            activities: [],
          })
        }
        return NextResponse.json({ error: msg, activities: [] })
      }

      const page = json.data?.marketingActivities
      if (!page) break

      for (const { node: n } of page.edges) {
        activities.push({
          id:               n.id,
          title:            n.title,
          status:           n.status,
          channel:          n.marketingChannelType ?? 'UNKNOWN',
          currency:         n.budget?.total?.currencyCode ?? n.adSpend?.currencyCode ?? 'USD',
          budget_total:     n.budget?.total ? parseFloat(n.budget.total.amount) : null,
          budget_remaining: null,
          start:            n.marketingEvent?.startedAt       ?? null,
          end:              n.marketingEvent?.scheduledToEndAt ?? null,
          clicks:           0,
          impressions:      0,
          spent:            n.adSpend ? parseFloat(n.adSpend.amount) : 0,
          utm_source:       n.utmParameters?.source   ?? null,
          utm_medium:       n.utmParameters?.medium   ?? null,
          utm_campaign:     n.utmParameters?.campaign ?? null,
        })
      }

      after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null
      pages++
    } while (after && pages < 5)

    return NextResponse.json({ activities })
  } catch (err) {
    return NextResponse.json({ error: String(err), activities: [] })
  }
}
