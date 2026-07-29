import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET() {
  const db = getDb()
  const profiles = db.prepare(`
    SELECT p.klaviyo_id, p.email, p.first_name, p.last_name, p.phone, p.created, p.updated,
      GROUP_CONCAT(pl.list_name, ',') AS list_names
    FROM klaviyo_profiles p
    LEFT JOIN klaviyo_profile_lists pl ON pl.profile_id = p.klaviyo_id
    GROUP BY p.klaviyo_id
    ORDER BY p.email ASC
  `).all() as {
    klaviyo_id: string; email: string | null; first_name: string | null; last_name: string | null
    phone: string | null; created: string | null; updated: string | null; list_names: string | null
  }[]
  return NextResponse.json(profiles)
}
