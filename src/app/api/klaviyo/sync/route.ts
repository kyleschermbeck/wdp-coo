import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { syncKlaviyoData } from '@/lib/klaviyo'

export async function POST() {
  const db = getDb()
  try {
    const result = await syncKlaviyoData(db)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
