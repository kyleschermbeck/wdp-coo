import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { getGmailClient } from '@/lib/gmail'

interface SupplyRow {
  id: number
  name: string
}

interface ParsedItem {
  description: string
  qty: number
  unit: string | null
}

interface ParsedOrder {
  vendor: string
  order_number: string | null
  order_date: string | null
  estimated_delivery: string | null
  tracking_number: string | null
  items: ParsedItem[]
  isDelivered: boolean
  isShipped: boolean
}

function extractBody(payload: Record<string, unknown>): { text: string; html: string } {
  if (!payload) return { text: '', html: '' }
  if (Array.isArray((payload as { parts?: unknown[] }).parts)) {
    let text = '', html = ''
    for (const part of (payload as { parts: Record<string, unknown>[] }).parts) {
      const sub = extractBody(part)
      text += sub.text
      html += sub.html
    }
    return { text, html }
  }
  const data = (payload as { body?: { data?: string } }).body?.data
  if (!data) return { text: '', html: '' }
  const decoded = Buffer.from(data, 'base64url').toString('utf-8')
  const mimeType = (payload as { mimeType?: string }).mimeType
  if (mimeType === 'text/plain') return { text: decoded, html: '' }
  if (mimeType === 'text/html') return { text: '', html: decoded }
  return { text: '', html: '' }
}

function getHeader(headers: { name?: string | null; value?: string | null }[], name: string) {
  return headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n').trim()
}

// Parse YYYY-MM-DD, MM/DD/YYYY, Month DD YYYY, etc.
function parseDate(str: string): string | null {
  if (!str) return null
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(str.trim())) return str.trim()
  // MM/DD/YYYY
  const mdy = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`
  // Month DD, YYYY
  const months: Record<string, string> = {
    january:'01', february:'02', march:'03', april:'04', may:'05', june:'06',
    july:'07', august:'08', september:'09', october:'10', november:'11', december:'12',
    jan:'01', feb:'02', mar:'03', apr:'04', jun:'06', jul:'07', aug:'08',
    sep:'09', oct:'10', nov:'11', dec:'12',
  }
  const named = str.match(/([a-zA-Z]+)\s+(\d{1,2}),?\s+(\d{4})/)
  if (named) {
    const m = months[named[1].toLowerCase()]
    if (m) return `${named[3]}-${m}-${named[2].padStart(2, '0')}`
  }
  return null
}

function parseOrder(subject: string, bodyRaw: string, fromEmail: string): ParsedOrder | null {
  const body = bodyRaw.toLowerCase()
  const vendor = fromEmail.toLowerCase().includes('uline') ? 'Uline'
    : fromEmail.toLowerCase().includes('inkwave') ? 'Inkwave'
    : fromEmail.split('@')[1]?.split('.')[0] ?? 'Unknown'

  // Only process order confirmations, shipping, and delivery notifications
  const isOrder = /order\s*(confirm|receipt|number|#)|your order|thank you for your order/i.test(subject + ' ' + bodyRaw)
  const isShipping = /ship(ped|ping|ment)|tracking|dispatch|on its way|out for delivery/i.test(subject + ' ' + bodyRaw)
  const isDelivered = /deliver(ed|y\s+complete)|package\s+(was\s+)?deliver|your\s+order\s+has\s+(been\s+)?deliver|arrived|delivered\s+to/i.test(subject + ' ' + bodyRaw)
  if (!isOrder && !isShipping && !isDelivered) return null

  // Order number
  let order_number: string | null = null
  const onMatch = bodyRaw.match(/order\s*(?:number|#|no\.?)\s*[:\-]?\s*([A-Z0-9\-]{4,20})/i)
    || bodyRaw.match(/#([A-Z0-9\-]{6,20})/i)
  if (onMatch) order_number = onMatch[1].trim()

  // Order date
  let order_date: string | null = null
  const odMatch = bodyRaw.match(/order\s*date\s*[:\-]?\s*([A-Za-z0-9,\/ ]+?)(?:\n|$)/i)
    || bodyRaw.match(/placed\s*(?:on)?\s*[:\-]?\s*([A-Za-z0-9,\/ ]+?)(?:\n|$)/i)
  if (odMatch) order_date = parseDate(odMatch[1].trim())

  // Estimated delivery
  let estimated_delivery: string | null = null
  const edMatch = bodyRaw.match(/(?:estimated?\s*delivery|est\.?\s*delivery|arrives?|expected?\s*delivery|deliver(?:ed)?\s*by|delivery\s*date)\s*[:\-]?\s*([A-Za-z0-9,\/ ]+?)(?:\n|$)/i)
  if (edMatch) estimated_delivery = parseDate(edMatch[1].trim())

  // Tracking number
  let tracking_number: string | null = null
  const tnMatch = bodyRaw.match(/tracking\s*(?:number|#|no\.?)\s*[:\-]?\s*([A-Z0-9]{8,30})/i)
    || bodyRaw.match(/(?:UPS|FedEx|USPS)\s*[:\-]?\s*([A-Z0-9]{8,30})/i)
  if (tnMatch) tracking_number = tnMatch[1].trim()

  // Line items — look for qty + description patterns
  const items: ParsedItem[] = []
  const lines = bodyRaw.split('\n')

  // Amazon "Ordered: ..." subject — extract first item name
  const amazonSubjectItem = subject.match(/^Ordered:\s*[""](.+?)(?:\.{3}|[""])/i)
  if (amazonSubjectItem) {
    items.push({ description: amazonSubjectItem[1].trim(), qty: 1, unit: null })
  }

  // Pass 1: inline qty+desc patterns
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.length > 200) continue

    // Pattern: "2x 8 oz Mason Jar" or "Qty: 2 | 8 oz Mason Jar" or "2 - 8 oz Jars"
    const qtyFirst = trimmed.match(/^(\d+)\s*x\s+(.+?)(?:\s*\$[\d.]+)?$/i)
      || trimmed.match(/^qty\s*[:\-]?\s*(\d+)\s*[|–\-]\s*(.+?)(?:\s*\$[\d.]+)?$/i)
      || trimmed.match(/^(\d+)\s*[-–]\s+(.+?)(?:\s*\$[\d.,]+)?$/)

    if (qtyFirst) {
      const qty = parseInt(qtyFirst[1])
      const desc = qtyFirst[2].trim()
      if (qty > 0 && desc.length > 3 && !/^(subtotal|total|tax|shipping|discount)/i.test(desc)) {
        items.push({ description: desc, qty, unit: null })
        continue
      }
    }

    // Pattern: "8 oz Jar (x2)" or "Labels (100/roll) x 3"
    const descFirst = trimmed.match(/^(.+?)\s*[x×]\s*(\d+)(?:\s*\$[\d.,]+)?$/i)
    if (descFirst) {
      const desc = descFirst[1].trim()
      const qty = parseInt(descFirst[2])
      if (qty > 0 && desc.length > 3 && !/^(subtotal|total|tax|shipping)/i.test(desc)) {
        items.push({ description: desc, qty, unit: null })
        continue
      }
    }

    // Uline-style: quantity in its own column — look for lines that are just a number between named items
    const justQty = trimmed.match(/^(\d+)\s*$/)
    if (justQty && items.length > 0) {
      const last = items[items.length - 1]
      if (last.qty === 1) last.qty = parseInt(justQty[1])
    }
  }

  // Pass 2: Amazon multi-line format — "Description\nQty: N" on adjacent lines
  if (vendor === 'amazon' || vendor === 'Amazon') {
    const skipLine = /^(\$[\d.,]+|subtotal|total|tax|shipping|discount|free|prime|in stock|sold by|gift|qty|quantity|add to|see more|track|details|return|help|amazon|your account)/i
    for (let i = 0; i < lines.length - 1; i++) {
      const desc = lines[i].trim()
      const next = lines[i + 1].trim()
      if (!desc || desc.length < 4 || desc.length > 180 || skipLine.test(desc)) continue
      // If current line is a description and next line is "Qty: N" or "Quantity: N"
      const qtyLine = next.match(/^(?:qty|quantity)\s*[:\-]?\s*(\d+)$/i)
      if (qtyLine) {
        const qty = parseInt(qtyLine[1])
        // Check if we already added this description from the subject extraction
        const alreadyAdded = items.some(it => it.description.toLowerCase() === desc.toLowerCase())
        if (!alreadyAdded) {
          items.push({ description: desc, qty, unit: null })
        } else {
          // Update qty on the existing item
          const existing = items.find(it => it.description.toLowerCase() === desc.toLowerCase())
          if (existing) existing.qty = qty
        }
        i++ // skip the qty line
      }
    }
  }

  // Deduplicate items by description
  const seen = new Set<string>()
  const dedupedItems = items.filter(it => {
    const key = it.description.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return { vendor, order_number, order_date, estimated_delivery, tracking_number, items: dedupedItems, isDelivered, isShipped: isShipping && !isDelivered }
}

function matchSupply(description: string, supplies: SupplyRow[]): number | null {
  const desc = description.toLowerCase()
  for (const s of supplies) {
    const sn = s.name.toLowerCase()
    if (desc.includes(sn) || sn.includes(desc)) return s.id
    // Check key words: "jar" → "8 oz. Jar", "label" → "Jar Label"
    const words = desc.split(/\s+/).filter(w => w.length > 3)
    const sWords = sn.split(/\s+/)
    if (words.filter(w => sWords.some(sw => sw.startsWith(w) || w.startsWith(sw))).length >= 2) return s.id
  }
  return null
}

export async function POST() {
  const db = await getDb()
  const gmail = await getGmailClient()
  if (!gmail) return NextResponse.json({ error: 'Gmail not connected' }, { status: 400 })

  const supplies = (await db.execute({sql: `SELECT id, name FROM supplies WHERE active = 1`, args: []})).rows as unknown as SupplyRow[]

  const query = 'from:uline.com OR from:inkwave.com OR from:auto-confirm@amazon.com OR from:ship-confirm@amazon.com newer_than:180d'
  const listRes = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 50 })
  const msgs = listRes.data.messages ?? []

  if (msgs.length === 0) return NextResponse.json({ synced: 0, skipped: 0, found: 0 })

  const existingGmailIds = new Set(
    ((await db.execute({sql: `SELECT gmail_id FROM supply_orders`, args: []})).rows as unknown as { gmail_id: string }[]).map(r => r.gmail_id)
  )

  const existingByOrderNumber = (await db.execute({sql: `
    SELECT id, status, order_number FROM supply_orders WHERE order_number IS NOT NULL AND status != 'skipped'
  `, args: []})).rows as unknown as { id: number; status: string; order_number: string }[]
  const orderNumberMap = new Map(existingByOrderNumber.map(r => [r.order_number, r]))

  const insertOrderSql = `INSERT INTO supply_orders (gmail_id, vendor, order_number, order_date, estimated_delivery, tracking_number, status, subject) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
  const insertItemSql = `INSERT INTO supply_order_items (supply_order_id, supply_id, description, qty, unit) VALUES (?, ?, ?, ?, ?)`
  const updateOrderStatusSql = `UPDATE supply_orders SET status = ?, tracking_number = COALESCE(?, tracking_number) WHERE id = ?`
  const insertSkippedSql = `INSERT OR IGNORE INTO supply_orders (gmail_id, vendor, order_number, status, subject) VALUES (?, 'unknown', null, 'skipped', ?)`

  let synced = 0, skipped = 0, updated = 0

  for (const msg of msgs) {
    if (!msg.id || existingGmailIds.has(msg.id)) { skipped++; continue }

    const full = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' })
    const payload = full.data.payload as Record<string, unknown> | undefined
    if (!payload) { skipped++; continue }

    const headers = (payload.headers as { name?: string | null; value?: string | null }[]) ?? []
    const subject = getHeader(headers, 'subject')
    const fromRaw = getHeader(headers, 'from')
    const { text, html } = extractBody(payload)
    const bodyText = text || stripHtml(html)

    const parsed = parseOrder(subject, bodyText, fromRaw)
    if (!parsed) {
      await db.execute({ sql: insertSkippedSql, args: [msg.id, subject] })
      skipped++
      continue
    }

    // If this is a shipping/delivery update for an already-known order, update status instead of inserting
    if (parsed.order_number && orderNumberMap.has(parsed.order_number)) {
      const existing = orderNumberMap.get(parsed.order_number)!
      // Only upgrade status (pending → shipped → delivered), never downgrade
      const statusRank: Record<string, number> = { pending: 0, partial: 1, shipped: 2, delivered: 3 }
      const newStatus = parsed.isDelivered ? 'delivered' : parsed.isShipped ? 'shipped' : null
      if (newStatus && (statusRank[newStatus] ?? 0) > (statusRank[existing.status] ?? 0)) {
        await db.execute({ sql: updateOrderStatusSql, args: [newStatus, parsed.tracking_number, existing.id] })
        updated++
      }
      // Record this gmail_id so it won't be re-processed
      await db.execute({ sql: insertSkippedSql, args: [msg.id, subject] })
      continue
    }

    const result = await db.execute({ sql: insertOrderSql, args: [msg.id, parsed.vendor, parsed.order_number, parsed.order_date, parsed.estimated_delivery, parsed.tracking_number, subject] })
    const orderId = Number(result.lastInsertRowid)

    for (const item of parsed.items) {
      const supplyId = matchSupply(item.description, supplies)
      await db.execute({ sql: insertItemSql, args: [orderId, supplyId, item.description, item.qty, item.unit] })
    }
    synced++
  }

  return NextResponse.json({ synced, skipped, updated, found: msgs.length })
}
