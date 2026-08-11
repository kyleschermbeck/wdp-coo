import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// Returns Klaviyo subscribers who have never placed a Shopify order.
// These are warm leads — they know the brand but haven't converted yet.
export async function GET() {
  const db = getDb()

  const prospects = db.prepare(`
    SELECT DISTINCT
      kp.klaviyo_id,
      kp.email,
      kp.first_name,
      kp.last_name,
      kp.created as subscribed_at,
      GROUP_CONCAT(DISTINCT kpl.list_name) as lists
    FROM klaviyo_profiles kp
    LEFT JOIN klaviyo_profile_lists kpl ON kp.klaviyo_id = kpl.profile_id
    WHERE kp.email IS NOT NULL
      AND lower(kp.email) NOT IN (
        SELECT lower(email) FROM shopify_orders WHERE email IS NOT NULL
        UNION
        SELECT lower(email) FROM shopify_customers WHERE email IS NOT NULL AND orders_count > 0
      )
    GROUP BY kp.klaviyo_id
    ORDER BY kp.created DESC
  `).all() as {
    klaviyo_id: string
    email: string
    first_name: string | null
    last_name: string | null
    subscribed_at: string | null
    lists: string | null
  }[]

  return NextResponse.json({ prospects, count: prospects.length })
}
