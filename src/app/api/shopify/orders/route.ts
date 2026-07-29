import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

export async function GET(request: Request) {
  const db = getDb()
  const { searchParams } = new URL(request.url)
  const days = parseInt(searchParams.get('days') ?? '90', 10)
  const email = searchParams.get('email')

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffISO = cutoff.toISOString()

  const orders = email
    ? db.prepare(`
        SELECT * FROM shopify_orders
        WHERE created_at >= ? AND email = ?
        ORDER BY created_at DESC
      `).all(cutoffISO, email)
    : db.prepare(`
        SELECT * FROM shopify_orders
        WHERE created_at >= ?
        ORDER BY created_at DESC
      `).all(cutoffISO)

  return NextResponse.json(orders)
}
