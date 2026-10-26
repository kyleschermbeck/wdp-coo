import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

// Approximate pricing per 1M tokens (USD) — Anthropic only; Gmail API is free
const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'claude-sonnet-4-6':         { input: 3.00, output: 15.00 },
}

export async function GET() {
  try {
    const db = await getDb()

    const rows = (await db.execute({sql: `
      SELECT operation, model,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens,
        COUNT(*) as call_count
      FROM api_usage
      GROUP BY operation, model
    `, args: []})).rows as unknown as { operation: string; model: string; input_tokens: number; output_tokens: number; call_count: number }[]

    let total_input = 0
    let total_output = 0
    let estimated_cost = 0
    const gmail_rows: typeof rows = []
    const anthropic_rows: typeof rows = []

    for (const row of rows) {
      if (row.model === 'gmail') {
        gmail_rows.push(row)
      } else {
        anthropic_rows.push(row)
        total_input += row.input_tokens
        total_output += row.output_tokens
        const p = ANTHROPIC_PRICING[row.model] ?? { input: 3.00, output: 15.00 }
        estimated_cost += (row.input_tokens / 1_000_000) * p.input
        estimated_cost += (row.output_tokens / 1_000_000) * p.output
      }
    }

    const gmail_list_calls = gmail_rows.find(r => r.operation === 'gmail_list')?.input_tokens ?? 0
    const gmail_get_calls = gmail_rows.find(r => r.operation === 'gmail_get')?.input_tokens ?? 0

    return NextResponse.json({
      anthropic: {
        total_input_tokens: total_input,
        total_output_tokens: total_output,
        total_tokens: total_input + total_output,
        estimated_cost_usd: Math.round(estimated_cost * 10000) / 10000,
        by_operation: anthropic_rows,
      },
      gmail: {
        list_calls: gmail_list_calls,
        get_calls: gmail_get_calls,
        total_calls: gmail_list_calls + gmail_get_calls,
        note: 'Gmail API is free up to 1B quota units/day',
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
