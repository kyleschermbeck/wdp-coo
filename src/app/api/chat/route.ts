import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getDb } from '@/lib/db'
import { readFileSync } from 'fs'
import { join } from 'path'
import type Database from 'better-sqlite3'

function getApiKey(): string | undefined {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  try {
    const content = readFileSync(join(process.cwd(), '.env.local'), 'utf-8')
    const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m)
    return match?.[1]?.trim()
  } catch { return undefined }
}

interface Agent {
  id: number
  name: string
  system_prompt: string
  model: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

// ─── Behavior instructions injected at runtime (not stored in DB) ────────────

const BEHAVIOR_INSTRUCTIONS = `

## How you handle memory and actions

**Feedback detection**: While talking, stay alert for when Kyle shares a preference, correction, or instruction about how you should behave — things like "always format it this way", "I prefer bullet points", "my threshold for reorders is X", or "remember that...". When you detect this, do NOT save it automatically. Instead, pause and ask: "Got it — should I save that so I remember it in future conversations?" Wait for Kyle to confirm (yes / sure / yeah / save it) before calling save_memory.

**Write actions**: Before calling update_task or create_task, always describe exactly what you're about to do and ask for confirmation: "I'll mark 'Task Title' as done — go ahead?" Only call the write tool after Kyle confirms. If they say something like "yes", "do it", "go ahead", or "yep", that counts.

**After saving or updating**: Briefly confirm what you did — "Done, saved." or "Updated — marked as in progress." Keep it short.

**Knowledge Base (search_docs)**: You have a search_docs tool that searches uploaded business documents (PDFs, guides, pricing sheets, brand guidelines, SOPs, etc.). Use it proactively — do NOT ask Kyle to upload something if the topic might already be covered in a document. Instead, call search_docs first, then answer based on what you find. If nothing is found, then let Kyle know the doc isn't in the knowledge base yet.
`

// ─── Tool definitions ────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_tasks',
    description: 'Get tasks from the project management system. Returns tasks with status, priority, due date, project name, and ID.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['todo', 'in_progress', 'review', 'done', 'all'], description: 'Filter by status (default: all)' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent', 'all'], description: 'Filter by priority (default: all)' },
        project_name: { type: 'string', description: 'Filter by project name (partial match)' },
        limit: { type: 'number', description: 'Max results to return (default 30)' },
      },
    },
  },
  {
    name: 'get_projects',
    description: 'Get all projects with their status, task counts, and completion progress.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['planning', 'active', 'on_hold', 'complete', 'all'], description: 'Filter by project status (default: all)' },
      },
    },
  },
  {
    name: 'get_orders',
    description: 'Get Shopify order data and revenue summary. Use summary_only for quick revenue stats.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max orders to return (default 10)' },
        summary_only: { type: 'boolean', description: 'Return only aggregate stats (count, revenue, avg order value)' },
      },
    },
  },
  {
    name: 'get_inventory',
    description: 'Get live Shopify product inventory levels, prices, status (active/draft), and which products are low on stock or bundles.',
    input_schema: {
      type: 'object',
      properties: {
        low_stock_only: { type: 'boolean', description: 'Only return products at or below reorder threshold' },
        status: { type: 'string', enum: ['active', 'draft', 'all'], description: 'Filter by product status (default: all)' },
      },
    },
  },
  {
    name: 'get_contacts',
    description: 'Look up contacts, customers, and wholesale accounts.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['wholesale', 'lead', 'customer', 'all'], description: 'Filter by contact type (default: all)' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    },
  },
  {
    name: 'get_marketing',
    description: 'Get marketing calendar events and goals. Use for content schedule, upcoming posts, campaign status, and marketing targets.',
    input_schema: {
      type: 'object',
      properties: {
        include_goals: { type: 'boolean', description: 'Include marketing goals/targets (default true)' },
        include_events: { type: 'boolean', description: 'Include calendar events/scheduled content (default true)' },
        platform: { type: 'string', description: 'Filter events by platform (e.g. instagram, email)' },
        status: { type: 'string', description: 'Filter events by status (e.g. published, scheduled, draft)' },
        limit: { type: 'number', description: 'Max events to return (default 20)' },
      },
    },
  },
  {
    name: 'get_klaviyo',
    description: 'Get email marketing data from Klaviyo: campaigns, flows, lists, and subscriber counts.',
    input_schema: {
      type: 'object',
      properties: {
        include_campaigns: { type: 'boolean', description: 'Include recent email campaigns (default true)' },
        include_flows: { type: 'boolean', description: 'Include automated flows (default true)' },
        include_lists: { type: 'boolean', description: 'Include subscriber lists and counts (default true)' },
      },
    },
  },
  {
    name: 'update_task',
    description: 'Update a task\'s status, priority, due date, or notes. Only call this after Kyle has explicitly confirmed the action.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'number', description: 'The ID of the task to update (get from get_tasks)' },
        status: { type: 'string', enum: ['todo', 'in_progress', 'review', 'done'], description: 'New status' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'New priority' },
        due_date: { type: 'string', description: 'New due date in YYYY-MM-DD format, or null to clear' },
        notes: { type: 'string', description: 'Notes to set on the task (replaces existing notes)' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'create_task',
    description: 'Create a new task in the system. Only call this after Kyle has confirmed the details.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        project_id: { type: 'number', description: 'Project to add the task to (get ID from get_projects)' },
        due_date: { type: 'string', description: 'Due date in YYYY-MM-DD format' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Task priority (default: medium)' },
        status: { type: 'string', enum: ['todo', 'in_progress', 'review', 'done'], description: 'Initial status (default: todo)' },
      },
      required: ['title'],
    },
  },
  {
    name: 'save_memory',
    description: 'Save or update something to remember for future conversations — a preference, instruction, or piece of information Kyle wants retained. Only call this after Kyle confirms they want it saved.',
    input_schema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Short label for this memory, e.g. "formatting preferences", "reorder threshold", "weekly review day"' },
        content: { type: 'string', description: 'What to remember — be specific and complete' },
      },
      required: ['topic', 'content'],
    },
  },
  {
    name: 'get_memories',
    description: 'Retrieve all saved memories for this agent — useful when Kyle asks what you remember or to review stored preferences.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'delete_memory',
    description: 'Delete a saved memory by its ID. Use get_memories first to find the ID. Only delete after Kyle confirms.',
    input_schema: {
      type: 'object',
      properties: {
        memory_id: { type: 'number', description: 'The ID of the memory to delete' },
      },
      required: ['memory_id'],
    },
  },
  {
    name: 'search_docs',
    description: 'Search the Knowledge Base for relevant information from uploaded documents (PDFs, Word docs, guides, etc.). Use this whenever a question might be answered by a document Kyle has uploaded — pricing sheets, wholesale guides, brand guidelines, SOPs, etc.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keywords to search for in the documents' },
      },
      required: ['query'],
    },
  },
]

function executeTool(
  name: string,
  input: Record<string, unknown>,
  db: Database.Database,
  agentId: number,
): unknown {
  switch (name) {
    case 'get_tasks': {
      const { status = 'all', priority = 'all', project_name, limit = 30 } = input as Record<string, string | number>
      let q = `SELECT t.id, t.title, t.status, t.priority, t.due_date, t.description, t.notes, p.name as project_name
               FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE 1=1`
      const params: unknown[] = []
      if (status && status !== 'all') { q += ' AND t.status = ?'; params.push(status) }
      if (priority && priority !== 'all') { q += ' AND t.priority = ?'; params.push(priority) }
      if (project_name) { q += ' AND p.name LIKE ?'; params.push(`%${project_name}%`) }
      q += ` ORDER BY CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, t.due_date LIMIT ?`
      params.push(Number(limit))
      return db.prepare(q).all(...params)
    }
    case 'get_projects': {
      const { status = 'all' } = input as Record<string, string>
      let q = `SELECT p.id, p.name, p.status, p.due_date, p.description,
                 COUNT(t.id) as task_count,
                 SUM(CASE WHEN t.status='done' THEN 1 ELSE 0 END) as done_count
               FROM projects p LEFT JOIN tasks t ON t.project_id = p.id WHERE 1=1`
      const params: unknown[] = []
      if (status && status !== 'all') { q += ' AND p.status = ?'; params.push(status) }
      q += ' GROUP BY p.id ORDER BY p.created_at DESC'
      return db.prepare(q).all(...params)
    }
    case 'get_orders': {
      const { limit = 10, summary_only = false } = input as Record<string, number | boolean>
      const summary = db.prepare(`
        SELECT COUNT(*) as total_orders,
               ROUND(SUM(total_price), 2) as total_revenue,
               ROUND(AVG(total_price), 2) as avg_order_value
        FROM shopify_orders WHERE financial_status = 'paid'
      `).get()
      if (summary_only) return summary
      const orders = db.prepare(`
        SELECT order_number, email, total_price, financial_status, fulfillment_status, created_at
        FROM shopify_orders ORDER BY created_at DESC LIMIT ?
      `).all(Number(limit))
      return { summary, recent_orders: orders }
    }
    case 'get_inventory': {
      const { low_stock_only = false, status = 'all' } = input as Record<string, unknown>
      let q = `SELECT sp.title, sp.status, sp.inventory_quantity as qty_on_hand,
                 sp.is_bundle,
                 COALESCE(sis.reorder_threshold, 12) as reorder_threshold,
                 CASE WHEN sp.inventory_quantity <= COALESCE(sis.reorder_threshold, 12) THEN 1 ELSE 0 END as is_low_stock,
                 json_extract(sp.raw, '$.variants[0].price') as price,
                 json_extract(sp.raw, '$.variants[0].sku') as sku
               FROM shopify_products sp
               LEFT JOIN shopify_inventory_settings sis ON sis.shopify_product_id = sp.shopify_id
               WHERE sp.status != 'archived'`
      const params: unknown[] = []
      if (status && status !== 'all') { q += ' AND sp.status = ?'; params.push(status) }
      if (low_stock_only) q += ' AND sp.is_bundle = 0 AND sp.inventory_quantity <= COALESCE(sis.reorder_threshold, 12)'
      q += ' ORDER BY sp.inventory_quantity ASC, sp.title ASC'
      return db.prepare(q).all(...params)
    }
    case 'get_contacts': {
      const { type = 'all', limit = 20 } = input as Record<string, string | number>
      let q = `SELECT name, type, email, phone, store_name, notes, created_at FROM contacts WHERE 1=1`
      const params: unknown[] = []
      if (type && type !== 'all') { q += ' AND type = ?'; params.push(type) }
      q += ' ORDER BY created_at DESC LIMIT ?'
      params.push(Number(limit))
      return db.prepare(q).all(...params)
    }
    case 'get_marketing': {
      const { include_goals = true, include_events = true, platform, status, limit = 20 } = input as Record<string, unknown>
      const result: Record<string, unknown> = {}
      if (include_goals) {
        result.goals = db.prepare(`
          SELECT title, category, target_value, current_value, unit, due_date, status
          FROM marketing_goals ORDER BY category, title
        `).all()
      }
      if (include_events) {
        let q = `SELECT title, date, platform, type, status, notes, pillar FROM marketing_events WHERE 1=1`
        const params: unknown[] = []
        if (platform) { q += ' AND platform = ?'; params.push(platform) }
        if (status) { q += ' AND status = ?'; params.push(status) }
        q += ' ORDER BY date DESC LIMIT ?'
        params.push(Number(limit))
        result.events = db.prepare(q).all(...params)
      }
      return result
    }
    case 'get_klaviyo': {
      const { include_campaigns = true, include_flows = true, include_lists = true } = input as Record<string, unknown>
      const result: Record<string, unknown> = {}
      if (include_lists) {
        result.lists = db.prepare(`SELECT name, profile_count FROM klaviyo_lists ORDER BY profile_count DESC`).all()
      }
      if (include_campaigns) {
        result.campaigns = db.prepare(`
          SELECT name, status, send_time, unique_opens, unique_clicks, revenue
          FROM klaviyo_campaigns ORDER BY send_time DESC LIMIT 10
        `).all()
      }
      if (include_flows) {
        result.flows = db.prepare(`SELECT name, status FROM klaviyo_flows ORDER BY name`).all()
      }
      return result
    }
    case 'update_task': {
      const { task_id, status, priority, due_date, notes } = input as {
        task_id: number; status?: string; priority?: string; due_date?: string | null; notes?: string
      }
      const fields: string[] = []
      const params: unknown[] = []
      if (status !== undefined) { fields.push('status = ?'); params.push(status) }
      if (priority !== undefined) { fields.push('priority = ?'); params.push(priority) }
      if (due_date !== undefined) { fields.push('due_date = ?'); params.push(due_date ?? null) }
      if (notes !== undefined) { fields.push('notes = ?'); params.push(notes) }
      if (fields.length === 0) return { error: 'No fields to update' }
      params.push(task_id)
      db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...params)
      const task = db.prepare('SELECT id, title, status, priority, due_date, notes FROM tasks WHERE id = ?').get(task_id)
      return { updated: true, task }
    }
    case 'create_task': {
      const { title, project_id, due_date, priority = 'medium', status = 'todo' } = input as {
        title: string; project_id?: number; due_date?: string; priority?: string; status?: string
      }
      const maxOrder = (db.prepare(
        'SELECT COALESCE(MAX(sort_order), -1) as m FROM tasks WHERE project_id IS ?'
      ).get(project_id ?? null) as { m: number }).m
      const result = db.prepare(
        'INSERT INTO tasks (title, project_id, due_date, priority, status, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(title, project_id ?? null, due_date ?? null, priority, status, maxOrder + 1)
      const task = db.prepare('SELECT id, title, status, priority, due_date FROM tasks WHERE id = ?').get(result.lastInsertRowid)
      return { created: true, task }
    }
    case 'save_memory': {
      const { topic, content } = input as { topic: string; content: string }
      const existing = db.prepare(
        'SELECT id FROM agent_memories WHERE agent_id = ? AND topic = ?'
      ).get(agentId, topic) as { id: number } | undefined
      if (existing) {
        db.prepare(
          "UPDATE agent_memories SET content = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(content, existing.id)
        return { saved: true, action: 'updated', topic, content }
      }
      const r = db.prepare(
        'INSERT INTO agent_memories (agent_id, topic, content) VALUES (?, ?, ?)'
      ).run(agentId, topic, content)
      return { saved: true, action: 'created', id: r.lastInsertRowid, topic, content }
    }
    case 'get_memories': {
      return db.prepare(
        'SELECT id, topic, content, updated_at FROM agent_memories WHERE agent_id = ? ORDER BY updated_at DESC'
      ).all(agentId)
    }
    case 'delete_memory': {
      const { memory_id } = input as { memory_id: number }
      db.prepare('DELETE FROM agent_memories WHERE id = ? AND agent_id = ?').run(memory_id, agentId)
      return { deleted: true, memory_id }
    }
    case 'search_docs': {
      const { query } = input as { query: string }
      try {
        const results = db.prepare(`
          SELECT d.id, d.original_name, d.task_id,
                 snippet(documents_fts, 0, '**', '**', '…', 48) as excerpt
          FROM documents_fts
          JOIN documents d ON d.id = documents_fts.rowid
          WHERE documents_fts MATCH ?
          ORDER BY rank
          LIMIT 4
        `).all(query) as { id: number; original_name: string; task_id: number | null; excerpt: string }[]
        if (results.length === 0) return { found: false, message: 'No documents matched that query.' }
        return { found: true, results: results.map(r => ({ document: r.original_name, excerpt: r.excerpt })) }
      } catch {
        return { found: false, message: 'No documents in knowledge base yet.' }
      }
    }
    default:
      return { error: `Unknown tool: ${name}` }
  }
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { agent_id, messages, image } = await req.json() as {
    agent_id: number
    messages: Message[]
    image?: { data: string; media_type: string }
  }

  const db = getDb()
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agent_id) as Agent | undefined

  // Load memories and inject into system prompt
  const memories = db.prepare(
    'SELECT id, topic, content FROM agent_memories WHERE agent_id = ? ORDER BY updated_at DESC LIMIT 30'
  ).all(agent_id) as { id: number; topic: string; content: string }[]

  const memorySection = memories.length > 0
    ? `\n\n## What you remember about Kyle and WDP\n${memories.map(m => `- **${m.topic}** (id:${m.id}): ${m.content}`).join('\n')}`
    : ''

  // Pull brand/tone context from all knowledge base documents
  let brandSection = ''
  try {
    const brandDocs = db.prepare(`
      SELECT original_name, content_text
      FROM documents
      WHERE content_text IS NOT NULL AND length(content_text) > 50
      ORDER BY created_at DESC
      LIMIT 5
    `).all() as { original_name: string; content_text: string }[]

    if (brandDocs.length > 0) {
      const docContext = brandDocs.map(d =>
        `### ${d.original_name}\n${d.content_text.slice(0, 3000)}${d.content_text.length > 3000 ? '\n…(truncated)' : ''}`
      ).join('\n\n')
      brandSection = `\n\n## Knowledge Base — Brand & Business Documents\nThe following documents have been uploaded by Kyle and define WDP's brand voice, style, and business context. Apply this knowledge to all responses — use the tone, terminology, and positioning described here.\n\n${docContext}`
    }
  } catch { /* no documents table yet */ }

  const basePrompt = agent?.system_prompt || 'You are a helpful assistant for Weeknight Dinner Party.'
  const systemPrompt = basePrompt + brandSection + memorySection + BEHAVIOR_INSTRUCTIONS

  const model = agent?.model || 'claude-sonnet-4-6'
  const apiKey = getApiKey()
  const client = new Anthropic({ apiKey })
  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      try {
        type MsgParam = Anthropic.MessageParam
        // If an image was attached, embed it as a vision block on the last user message
        let loopMessages: MsgParam[] = messages.map((m, idx) => {
          if (image && idx === messages.length - 1 && m.role === 'user') {
            return {
              role: 'user' as const,
              content: [
                {
                  type: 'image' as const,
                  source: {
                    type: 'base64' as const,
                    media_type: image.media_type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                    data: image.data,
                  },
                },
                { type: 'text' as const, text: m.content || 'Please review this image.' },
              ],
            }
          }
          return { role: m.role, content: m.content }
        })

        for (let round = 0; round < 6; round++) {
          const stream = client.messages.stream({
            model,
            max_tokens: 4096,
            system: systemPrompt,
            messages: loopMessages,
            tools: TOOLS,
          })

          type ToolBlock = { id: string; name: string; inputJson: string }
          const toolUseBlocks: ToolBlock[] = []
          let currentBlock: ToolBlock | null = null

          for await (const chunk of stream) {
            if (chunk.type === 'content_block_start' && chunk.content_block.type === 'tool_use') {
              currentBlock = { id: chunk.content_block.id, name: chunk.content_block.name, inputJson: '' }
            } else if (chunk.type === 'content_block_delta') {
              if (chunk.delta.type === 'text_delta') {
                controller.enqueue(encoder.encode(chunk.delta.text))
              } else if (chunk.delta.type === 'input_json_delta' && currentBlock) {
                currentBlock.inputJson += chunk.delta.partial_json
              }
            } else if (chunk.type === 'content_block_stop' && currentBlock) {
              toolUseBlocks.push(currentBlock)
              currentBlock = null
            }
          }

          const finalMsg = await stream.finalMessage()

          try {
            db.prepare('INSERT INTO api_usage (operation, model, input_tokens, output_tokens) VALUES (?, ?, ?, ?)').run('chat', model, finalMsg.usage.input_tokens, finalMsg.usage.output_tokens)
          } catch { /* ignore */ }

          if (finalMsg.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) break

          const toolResults: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map(block => {
            let toolInput: Record<string, unknown> = {}
            try { toolInput = JSON.parse(block.inputJson) } catch { /* ignore */ }
            const result = executeTool(block.name, toolInput, db, agent_id)
            return {
              type: 'tool_result' as const,
              tool_use_id: block.id,
              content: JSON.stringify(result),
            }
          })

          loopMessages = [
            ...loopMessages,
            { role: 'assistant' as const, content: finalMsg.content },
            { role: 'user' as const, content: toolResults },
          ]
        }
      } catch (e) {
        console.error('Chat stream error:', e)
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
