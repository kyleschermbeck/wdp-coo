import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = getDb()

  // ── Revenue ───────────────────────────────────────────────────────────────
  const rev30 = db.prepare(`
    SELECT COUNT(*) as orders, ROUND(SUM(total_price),2) as revenue, ROUND(AVG(total_price),2) as aov
    FROM shopify_orders WHERE financial_status='paid' AND created_at >= datetime('now','-30 days')
  `).get() as { orders: number; revenue: number; aov: number }

  const rev7 = db.prepare(`
    SELECT ROUND(SUM(total_price),2) as revenue, COUNT(*) as orders
    FROM shopify_orders WHERE financial_status='paid' AND created_at >= datetime('now','-7 days')
  `).get() as { revenue: number; orders: number }

  const revPrev7 = db.prepare(`
    SELECT ROUND(SUM(total_price),2) as revenue
    FROM shopify_orders WHERE financial_status='paid'
      AND created_at >= datetime('now','-14 days') AND created_at < datetime('now','-7 days')
  `).get() as { revenue: number }

  const revAllTime = db.prepare(`
    SELECT ROUND(SUM(total_price),2) as revenue, COUNT(*) as orders
    FROM shopify_orders WHERE financial_status='paid'
  `).get() as { revenue: number; orders: number }

  // ── Daily revenue (last 30 days for sparkline) ───────────────────────────
  const dailyRevenue = db.prepare(`
    SELECT date(created_at) as day, ROUND(SUM(total_price),2) as revenue, COUNT(*) as orders
    FROM shopify_orders WHERE financial_status='paid' AND created_at >= datetime('now','-30 days')
    GROUP BY day ORDER BY day ASC
  `).all() as { day: string; revenue: number; orders: number }[]

  // ── Top products ──────────────────────────────────────────────────────────
  const topProducts = db.prepare(`
    SELECT
      json_extract(li.value,'$.title') as product,
      SUM(CAST(json_extract(li.value,'$.quantity') as INTEGER)) as units,
      ROUND(SUM(CAST(json_extract(li.value,'$.price') as REAL) * CAST(json_extract(li.value,'$.quantity') as INTEGER)),2) as revenue
    FROM shopify_orders o, json_each(o.line_items) li
    WHERE o.financial_status='paid'
    GROUP BY product ORDER BY revenue DESC LIMIT 8
  `).all() as { product: string; units: number; revenue: number }[]

  // ── Customers ─────────────────────────────────────────────────────────────
  const customerTotal = db.prepare('SELECT COUNT(*) as count FROM shopify_customers').get() as { count: number }
  const customersByMonth = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as new_customers
    FROM shopify_customers GROUP BY month ORDER BY month ASC LIMIT 12
  `).all() as { month: string; new_customers: number }[]
  const repeatBuyers = db.prepare(
    'SELECT COUNT(*) as count FROM shopify_customers WHERE orders_count > 1'
  ).get() as { count: number }

  // ── Email / Klaviyo ───────────────────────────────────────────────────────
  const klaviyoLists = db.prepare(
    'SELECT name, profile_count FROM klaviyo_lists ORDER BY profile_count DESC'
  ).all() as { name: string; profile_count: number }[]

  const recentCampaigns = db.prepare(`
    SELECT name, send_time, unique_opens, unique_clicks, revenue
    FROM klaviyo_campaigns ORDER BY send_time DESC LIMIT 5
  `).all() as { name: string; send_time: string; unique_opens: number; unique_clicks: number; revenue: number }[]

  const totalSubscribers = klaviyoLists.reduce((s, l) => s + (l.profile_count ?? 0), 0)

  // ── Inventory health ──────────────────────────────────────────────────────
  const inventorySummary = db.prepare(`
    SELECT
      SUM(CASE WHEN status='active' AND is_bundle=0 THEN 1 ELSE 0 END) as active_skus,
      SUM(CASE WHEN status='draft' AND is_bundle=0 THEN 1 ELSE 0 END) as draft_skus,
      SUM(CASE WHEN status='active' AND is_bundle=0 AND inventory_quantity < 0 THEN 1 ELSE 0 END) as negative_stock,
      SUM(CASE WHEN status='active' AND is_bundle=0 AND inventory_quantity = 0 THEN 1 ELSE 0 END) as zero_stock,
      SUM(CASE WHEN status='active' AND is_bundle=0 AND inventory_quantity > 0 AND inventory_quantity <= 5 THEN 1 ELSE 0 END) as critical_low,
      SUM(CASE WHEN status='active' AND is_bundle=0 AND inventory_quantity > 5 THEN 1 ELSE 0 END) as healthy
    FROM shopify_products
  `).get() as { active_skus: number; draft_skus: number; negative_stock: number; zero_stock: number; critical_low: number; healthy: number }

  // ── Tasks pulse ───────────────────────────────────────────────────────────
  const tasksPulse = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as done,
      SUM(CASE WHEN status!='done' AND due_date < date('now') THEN 1 ELSE 0 END) as overdue,
      SUM(CASE WHEN priority='urgent' AND status!='done' THEN 1 ELSE 0 END) as urgent
    FROM tasks
  `).get() as { total: number; done: number; overdue: number; urgent: number }

  const weekChange = revPrev7.revenue > 0
    ? Math.round(((rev7.revenue - revPrev7.revenue) / revPrev7.revenue) * 100)
    : null

  return NextResponse.json({
    revenue: {
      last30d: rev30.revenue ?? 0,
      orders30d: rev30.orders ?? 0,
      aov: rev30.aov ?? 0,
      thisWeek: rev7.revenue ?? 0,
      ordersThisWeek: rev7.orders ?? 0,
      weekChange,
      allTime: revAllTime.revenue ?? 0,
      allTimeOrders: revAllTime.orders ?? 0,
    },
    dailyRevenue,
    topProducts,
    customers: {
      total: customerTotal.count,
      byMonth: customersByMonth,
      repeatBuyers: repeatBuyers.count,
    },
    email: {
      totalSubscribers,
      lists: klaviyoLists,
      recentCampaigns,
    },
    inventory: inventorySummary,
    tasks: tasksPulse,
    generatedAt: new Date().toISOString(),
  })
}
