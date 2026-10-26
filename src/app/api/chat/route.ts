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

**Write actions**: Before calling update_task or create_task, always describe exactly what you're about to do and ask for confirmation. For tasks, include a task-proposal block (see below) so Kyle can confirm visually. Only call the write tool after Kyle confirms. If they say something like "yes", "do it", "go ahead", "yep", or "create it", that counts — immediately call create_task without re-asking.

**Task proposals**: When proposing to create a task, always output a task-proposal block at the end of your message so it renders as a confirmation card. Format:
\`\`\`task-proposal
{"title": "...", "project_id": 1, "project_name": "Blog Recipes", "priority": "medium", "due_date": "YYYY-MM-DD"}
\`\`\`
Always include BOTH project_id (number from get_projects) AND project_name (the human-readable name) so Kyle can see which project it's going to. Omit due_date or project fields if not applicable. After Kyle clicks Create on the card OR says yes/go ahead/do it, immediately call create_task — do not re-confirm.

**Task lists — MANDATORY FORMAT**: Any time you call get_tasks and return task data, you MUST output the results as a task-list code block. No exceptions — not for "walk me through", "show me", "what's urgent", or any other phrasing. The task-list block is how the UI renders interactive cards; plain markdown lists are not acceptable. Format:
\`\`\`task-list
[{"id": 1, "title": "...", "status": "todo", "priority": "high", "start_date": "2026-08-19", "due_date": "2026-08-20", "project_name": "Operational Tasks", "notes": "...", "subtasks": [{"id": 1, "title": "...", "status": "todo", "completed": 0}]}]
\`\`\`
Include all task fields from get_tasks including start_date, due_date, and the subtasks array. You may add a brief intro sentence before the block, and analysis/recommendations after. Never output tasks as a numbered list or bullet points.

**Task lookup — use ID or search, never guess**: When a prompt includes "task #123" or "Show me task #123", ALWAYS call get_tasks with task_id=123 to retrieve it directly. When a prompt includes a task name in quotes, call get_tasks with search="partial name" to find it. Never say you can't find a task without first trying a search or ID lookup.

**After saving or updating**: Briefly confirm what you did — "Done, saved." or "Created — task is on the board." Keep it short.

**stat-grid blocks — use instead of prose summaries**: When summarizing task status, customer metrics, revenue breakdowns, or any analysis with 2–5 key numbers, output a stat-grid block. This renders as a row of visual metric tiles instead of paragraphs. Format:
\`\`\`stat-grid
[{"label": "Subtasks Done", "value": "5/7", "sub": "71% complete", "color": "positive"}, {"label": "Days Left", "value": "12", "sub": "due Aug 31", "color": "neutral"}, {"label": "Status", "value": "On Track", "sub": "2 items remain", "color": "positive"}]
\`\`\`
Colors: "positive" (green), "warning" (amber), "alert" (red), "neutral" (blue). Use this for task progress, revenue snapshots, customer breakdowns, email metrics, inventory counts — any situation where you'd otherwise write a paragraph of numbers. Place it right after a task-list block or as the opener of a data response. Follow with 1-2 sentence analysis and any action recommendations.

**Data formatting**: When presenting other data (orders, products, campaigns, inventory), use markdown tables wherever the data has multiple columns. For a single metric or short answer, plain text is fine. Use bold for key numbers.

**Knowledge Base (search_docs)**: You have a search_docs tool that searches uploaded business documents (PDFs, guides, pricing sheets, brand guidelines, SOPs, etc.). Use it proactively — do NOT ask Kyle to upload something if the topic might already be covered in a document. Instead, call search_docs first, then answer based on what you find. If nothing is found, then let Kyle know the doc isn't in the knowledge base yet.

**Meta Ads access**: You have full access to Meta Ads data via get_marketing_data. The Weeknight Dinner Party Meta Ads account (act_1702967937530974) IS connected. Campaign performance data is cached locally — call get_marketing_data with source "meta_ads" to see all campaigns, spend, impressions, clicks, CPM, CTR, and ROAS. If campaign data hasn't been synced yet, you can tell Kyle to click the sync button or that you can trigger a sync. Never tell Kyle there is no Meta Ads access — the account is connected.

**Google Analytics access**: You have LIVE access to Google Analytics data via get_marketing_data with source "google_analytics". The property "Weeknight Dinner Party" (G-6X8DB23243) IS connected and returning real data. Always call get_marketing_data with source "google_analytics" when Kyle asks about website traffic, page views, sessions, visitors, bounce rate, top pages, or traffic sources. The data includes: sessions, pageViews, newUsers, totalUsers, bounceRate, avgSessionDuration, top pages by views, traffic sources (organic, direct, etc.), device breakdown, and a 30-day daily trend. Never tell Kyle that analytics data isn't available — call the tool first.
`

// ─── Tool definitions ────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_tasks',
    description: 'Get tasks from the project management system. Returns tasks with status, priority, due date, project name, ID, and any subtasks attached to each task.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['todo', 'in_progress', 'review', 'done', 'all'], description: 'Filter by status (default: all)' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent', 'all'], description: 'Filter by priority (default: all)' },
        project_name: { type: 'string', description: 'Filter by project name (partial match)' },
        search: { type: 'string', description: 'Search by task title (partial match). Use this to look up a specific task by name.' },
        task_id: { type: 'number', description: 'Get a single specific task by ID. Returns just that task with its subtasks.' },
        limit: { type: 'number', description: 'Max results to return (default 30)' },
      },
    },
  },
  {
    name: 'create_subtask',
    description: 'Add a subtask to an existing task. Get the parent task ID from get_tasks first.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'number', description: 'ID of the parent task' },
        title: { type: 'string', description: 'Subtask title' },
        due_date: { type: 'string', description: 'Due date in YYYY-MM-DD format (optional)' },
        notes: { type: 'string', description: 'Additional notes (optional)' },
      },
      required: ['task_id', 'title'],
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
    description: 'Update a task\'s status, priority, start date, due date, or notes. Only call this after Kyle has explicitly confirmed the action.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'number', description: 'The ID of the task to update (get from get_tasks)' },
        status: { type: 'string', enum: ['todo', 'in_progress', 'review', 'done'], description: 'New status' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'New priority' },
        start_date: { type: 'string', description: 'Start date in YYYY-MM-DD format, or null to clear' },
        due_date: { type: 'string', description: 'Due/end date in YYYY-MM-DD format, or null to clear' },
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
        start_date: { type: 'string', description: 'Start date in YYYY-MM-DD format (optional)' },
        due_date: { type: 'string', description: 'Due/end date in YYYY-MM-DD format' },
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
  // ── New action tools ──────────────────────────────────────────────────────
  {
    name: 'queue_email',
    description: 'Draft an email and add it to the review queue for Kyle to approve before sending. Use for Klaviyo campaigns, wholesale outreach, customer follow-ups, etc. Always tell Kyle what you\'re about to draft before calling this.',
    input_schema: {
      type: 'object',
      properties: {
        subject: { type: 'string', description: 'Email subject line' },
        body: { type: 'string', description: 'Full email body in markdown. Write in WDP brand voice — warm, confident, chef-forward.' },
        to_email: { type: 'string', description: 'Recipient email address (optional if it\'s a broadcast/Klaviyo campaign)' },
        to_name: { type: 'string', description: 'Recipient name (optional)' },
        context: { type: 'string', description: 'Brief explanation of why you\'re drafting this — what triggered it, what it\'s meant to accomplish' },
      },
      required: ['subject', 'body'],
    },
  },
  {
    name: 'write_recipe',
    description: 'Write a new recipe to the recipe base as a draft. Always propose the concept to Kyle first and get a confirm before calling this.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Recipe name' },
        tagline: { type: 'string', description: 'One-line description / hook' },
        description: { type: 'string', description: 'Intro paragraph — story, context, why this dish works' },
        blend_used: { type: 'string', description: 'Which WDP spice blend(s) this recipe features' },
        ingredients: { type: 'string', description: 'Ingredient list in markdown (use bullet points with quantities)' },
        instructions: { type: 'string', description: 'Step-by-step instructions in markdown' },
        notes: { type: 'string', description: 'Chef notes, variations, pairing suggestions, storage tips' },
      },
      required: ['title', 'blend_used', 'ingredients', 'instructions'],
    },
  },
  {
    name: 'update_inventory_threshold',
    description: 'Update the reorder threshold for a product. Propose the new threshold and confirm with Kyle before calling.',
    input_schema: {
      type: 'object',
      properties: {
        product_name: { type: 'string', description: 'Product name (partial match OK)' },
        new_threshold: { type: 'number', description: 'New reorder threshold (units)' },
      },
      required: ['product_name', 'new_threshold'],
    },
  },
  {
    name: 'flag_item',
    description: 'Flag something for Kyle\'s attention — a campaign performing poorly, an inventory risk, a deadline approaching, a customer issue, etc. Use this to create a persistent alert Kyle can review.',
    input_schema: {
      type: 'object',
      properties: {
        item_type: { type: 'string', enum: ['campaign', 'inventory', 'task', 'email', 'customer', 'financial', 'supplier', 'content', 'other'], description: 'What kind of item is being flagged' },
        item_name: { type: 'string', description: 'Name or identifier of the flagged item' },
        reason: { type: 'string', description: 'Why this is being flagged — be specific' },
        urgency: { type: 'string', enum: ['low', 'medium', 'high'], description: 'How urgent is this (default: medium)' },
      },
      required: ['item_type', 'item_name', 'reason'],
    },
  },
  {
    name: 'get_supplies',
    description: 'Get supply chain data — ingredients, packaging materials, vendor information, costs. Useful for understanding COGS, what needs reordering, and supplier relationships.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['product', 'packaging', 'all'], description: 'Filter by category (default: all)' },
      },
    },
  },
  {
    name: 'get_flags',
    description: 'Get open flags and alerts that have been raised — items needing Kyle\'s attention.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'resolved', 'all'], description: 'Filter by status (default: open)' },
        urgency: { type: 'string', enum: ['low', 'medium', 'high', 'all'], description: 'Filter by urgency' },
      },
    },
  },
  {
    name: 'get_email_queue',
    description: 'Get email drafts queued by the COO agent, pending Kyle\'s review.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending_review', 'approved', 'sent', 'discarded', 'all'], description: 'Filter by status (default: pending_review)' },
      },
    },
  },
  {
    name: 'get_recipes',
    description: 'Get recipes in the recipe base — both agent-drafted and published.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft', 'published', 'all'], description: 'Filter by status (default: all)' },
        blend: { type: 'string', description: 'Filter by spice blend used (partial match)' },
      },
    },
  },
  {
    name: 'get_marketing_strategy',
    description: 'Get saved marketing strategy content — goals, pillars, positioning, seasonal plans.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_products',
    description: 'Get WDP product catalog — names, prices, descriptions, which are active.',
    input_schema: {
      type: 'object',
      properties: {
        active_only: { type: 'boolean', description: 'Only return active products (default: true)' },
      },
    },
  },
  {
    name: 'get_customer_insights',
    description: 'Get customer data — total customers, order history, top spenders, email list size. Good for understanding who the WDP customer is.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_blend_recipe',
    description: 'Get the ingredient formula for a WDP spice blend — tablespoons of each ingredient per 8oz jar. Use this whenever Kyle asks about batch production, scaling a recipe, COGS breakdown, or what goes into a blend. Supports partial name matching.',
    input_schema: {
      type: 'object',
      properties: {
        blend_name: { type: 'string', description: 'Name of the blend (partial match OK, e.g. "steak", "churri", "cajun")' },
      },
      required: ['blend_name'],
    },
  },
  {
    name: 'get_klaviyo_data',
    description: 'Get Klaviyo email marketing data — campaigns, flows, metrics (open rate, click rate, revenue), and list stats. Use this for email performance questions, campaign history, and marketing insights.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['campaigns', 'flows', 'metrics', 'lists', 'all'], description: 'What to fetch (default: all)' },
      },
    },
  },
  {
    name: 'get_marketing_data',
    description: 'Get marketing performance data — Meta/Instagram ad campaigns (spend, ROAS, impressions, clicks), Google Analytics (sessions, revenue, top pages), and Instagram account stats. Use for paid ads questions, website traffic, and social performance.',
    input_schema: {
      type: 'object',
      properties: {
        source: { type: 'string', enum: ['meta_ads', 'google_analytics', 'instagram', 'all'], description: 'Which data source to pull (default: all)' },
      },
    },
  },
  {
    name: 'get_customers',
    description: 'Get customer data from Shopify — total count, repeat vs one-time buyers, top customers by spend, LTV stats, and Klaviyo email/SMS list sizes. Use for any customer, audience, or subscriber questions.',
    input_schema: {
      type: 'object',
      properties: {
        view: { type: 'string', enum: ['summary', 'top_customers', 'klaviyo', 'all'], description: 'Which slice to return (default: all)' },
      },
    },
  },
  {
    name: 'sync_meta_ads',
    description: 'Trigger a sync of Meta Ads campaign data from the Facebook Graph API. This fetches live campaign performance (spend, impressions, clicks, CPM, CTR) and caches it locally. Use when Kyle asks to refresh or sync Meta Ads data.',
    input_schema: { type: 'object', properties: {} },
  },
]

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  db: Database.Database,
  agentId: number,
): Promise<unknown> {
  switch (name) {
    case 'get_tasks': {
      const { status = 'all', priority = 'all', project_name, search, task_id, limit = 30 } = input as Record<string, string | number>
      // Direct lookup by ID — fastest path
      if (task_id) {
        const task = db.prepare(
          `SELECT t.id, t.title, t.status, t.priority, t.start_date, t.due_date, t.description, t.notes, p.name as project_name
           FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE t.id = ?`
        ).get(Number(task_id)) as Record<string, unknown> | undefined
        if (!task) return { error: `Task #${task_id} not found` }
        const subs = db.prepare(
          `SELECT id, task_id, title, status, completed, due_date, notes FROM subtasks WHERE task_id = ? ORDER BY sort_order, created_at`
        ).all(Number(task_id)) as Array<Record<string, unknown>>
        return [{ ...task, subtasks: subs }]
      }
      let q = `SELECT t.id, t.title, t.status, t.priority, t.start_date, t.due_date, t.description, t.notes, p.name as project_name
               FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE 1=1`
      const params: unknown[] = []
      if (status && status !== 'all') { q += ' AND t.status = ?'; params.push(status) }
      if (priority && priority !== 'all') { q += ' AND t.priority = ?'; params.push(priority) }
      if (project_name) { q += ' AND p.name LIKE ?'; params.push(`%${project_name}%`) }
      if (search) { q += ' AND t.title LIKE ?'; params.push(`%${search}%`) }
      q += ` ORDER BY CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, t.due_date LIMIT ?`
      params.push(Number(limit))
      const tasks = db.prepare(q).all(...params) as Array<Record<string, unknown>>
      if (tasks.length === 0) return []
      const ids = tasks.map(t => t.id as number)
      const subtasks = db.prepare(
        `SELECT id, task_id, title, status, completed, due_date, notes FROM subtasks
         WHERE task_id IN (${ids.map(() => '?').join(',')}) ORDER BY sort_order, created_at`
      ).all(...ids) as Array<Record<string, unknown>>
      const byTask: Record<number, unknown[]> = {}
      for (const s of subtasks) {
        const tid = s.task_id as number
        if (!byTask[tid]) byTask[tid] = []
        byTask[tid].push(s)
      }
      return tasks.map(t => ({ ...t, subtasks: byTask[t.id as number] ?? [] }))
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
      const { task_id, status, priority, start_date, due_date, notes } = input as {
        task_id: number; status?: string; priority?: string; start_date?: string | null; due_date?: string | null; notes?: string
      }
      const fields: string[] = []
      const params: unknown[] = []
      if (status !== undefined) { fields.push('status = ?'); params.push(status) }
      if (priority !== undefined) { fields.push('priority = ?'); params.push(priority) }
      if (start_date !== undefined) { fields.push('start_date = ?'); params.push(start_date ?? null) }
      if (due_date !== undefined) { fields.push('due_date = ?'); params.push(due_date ?? null) }
      if (notes !== undefined) { fields.push('notes = ?'); params.push(notes) }
      if (fields.length === 0) return { error: 'No fields to update' }
      params.push(task_id)
      db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...params)
      const task = db.prepare('SELECT id, title, status, priority, start_date, due_date, notes FROM tasks WHERE id = ?').get(task_id)
      return { updated: true, task }
    }
    case 'create_task': {
      const { title, project_id, start_date, due_date, priority = 'medium', status = 'todo', description, notes } = input as {
        title: string; project_id?: number; start_date?: string; due_date?: string; priority?: string; status?: string; description?: string; notes?: string
      }
      const result = db.prepare(
        'INSERT INTO tasks (title, project_id, start_date, due_date, priority, status, description, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(title, project_id ?? null, start_date ?? null, due_date ?? null, priority, status, description ?? null, notes ?? null)
      const task = db.prepare('SELECT id, title, status, priority, start_date, due_date, project_id FROM tasks WHERE id = ?').get(result.lastInsertRowid)
      return { created: true, task }
    }
    case 'create_subtask': {
      const { task_id, title, due_date, notes } = input as { task_id: number; title: string; due_date?: string; notes?: string }
      const parentExists = db.prepare('SELECT id FROM tasks WHERE id = ?').get(task_id)
      if (!parentExists) return { error: `Task ${task_id} not found` }
      const result = db.prepare(
        'INSERT INTO subtasks (task_id, title, due_date, notes, status) VALUES (?, ?, ?, ?, ?)'
      ).run(task_id, title, due_date ?? null, notes ?? null, 'todo')
      const subtask = db.prepare('SELECT id, task_id, title, status, due_date FROM subtasks WHERE id = ?').get(result.lastInsertRowid)
      return { created: true, subtask }
    }
    case 'get_klaviyo_data': {
      const { type = 'all' } = input as { type?: string }
      const result: Record<string, unknown> = {}
      if (type === 'all' || type === 'campaigns') {
        result.campaigns = db.prepare(
          `SELECT name, status, subject, send_time, recipients, opens, clicks, open_rate, click_rate, revenue
           FROM klaviyo_campaigns ORDER BY send_time DESC LIMIT 20`
        ).all()
      }
      if (type === 'all' || type === 'flows') {
        result.flows = db.prepare(
          `SELECT name, status, trigger_type, created_at FROM klaviyo_flows ORDER BY created_at DESC LIMIT 10`
        ).all()
      }
      if (type === 'all' || type === 'metrics') {
        result.metrics = db.prepare('SELECT name, value FROM klaviyo_metrics').all()
      }
      if (type === 'all' || type === 'lists') {
        result.lists = db.prepare(
          `SELECT name, profile_count FROM klaviyo_lists ORDER BY profile_count DESC LIMIT 10`
        ).all()
      }
      return result
    }
    case 'get_customers': {
      const { view = 'all' } = input as { view?: string }
      const result: Record<string, unknown> = {}

      if (view === 'all' || view === 'summary') {
        const summary = db.prepare(`
          SELECT
            COUNT(*) as total_customers,
            COUNT(CASE WHEN orders_count > 1 THEN 1 END) as repeat_buyers,
            COUNT(CASE WHEN orders_count = 1 THEN 1 END) as one_time_buyers,
            COUNT(CASE WHEN orders_count = 0 THEN 1 END) as no_orders,
            ROUND(AVG(CASE WHEN total_spent > 0 THEN total_spent END), 2) as avg_ltv,
            ROUND(MAX(total_spent), 2) as top_ltv,
            ROUND(SUM(total_spent), 2) as total_revenue_from_customers,
            ROUND(AVG(orders_count), 1) as avg_orders_per_customer
          FROM shopify_customers
        `).get()
        result.summary = summary
      }

      if (view === 'all' || view === 'top_customers') {
        result.top_customers = db.prepare(`
          SELECT first_name, last_name, email, orders_count, total_spent, tags
          FROM shopify_customers
          WHERE total_spent > 0
          ORDER BY total_spent DESC
          LIMIT 10
        `).all()
      }

      if (view === 'all' || view === 'klaviyo') {
        result.klaviyo_lists = db.prepare(`
          SELECT name, profile_count FROM klaviyo_lists ORDER BY profile_count DESC
        `).all()
        const profileCount = db.prepare('SELECT COUNT(*) as count FROM klaviyo_profiles').get()
        result.klaviyo_total_profiles = profileCount
      }

      // Top products by order frequency
      if (view === 'all') {
        const recentOrders = db.prepare(`SELECT line_items FROM shopify_orders LIMIT 50`).all() as { line_items: string }[]
        const productCounts: Record<string, number> = {}
        for (const row of recentOrders) {
          try {
            const items = JSON.parse(row.line_items) as Array<{ title: string; quantity: number }>
            for (const item of items) {
              productCounts[item.title] = (productCounts[item.title] ?? 0) + (item.quantity ?? 1)
            }
          } catch { /* ignore */ }
        }
        result.top_products_by_orders = Object.entries(productCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([title, count]) => ({ title, orders: count }))
      }

      return result
    }
    case 'sync_meta_ads': {
      const metaConfig = db.prepare('SELECT access_token, ad_account_id, account_name FROM meta_ads_config LIMIT 1').get() as
        { access_token: string; ad_account_id: string; account_name: string } | undefined
      if (!metaConfig?.access_token) return { error: 'Meta Ads not configured' }
      // Return sync instructions — actual live fetch happens via /api/meta-ads/sync (requires production env with network access)
      const existing = db.prepare('SELECT COUNT(*) as count FROM meta_ads_campaigns').get() as { count: number }
      return {
        status: 'sync_available',
        account_name: metaConfig.account_name,
        ad_account_id: metaConfig.ad_account_id,
        cached_campaigns: existing.count,
        message: existing.count > 0
          ? `Using ${existing.count} cached campaigns. To refresh live data, click Sync in Meta Ads settings.`
          : 'No campaigns cached yet. Live API sync is available in production environment. Use get_marketing_data to see current state.',
      }
    }
    case 'get_marketing_data': {
      const { source = 'all' } = input as { source?: string }
      const result: Record<string, unknown> = {}
      if (source === 'all' || source === 'meta_ads') {
        const metaConfig = db.prepare('SELECT account_name, ad_account_id, connected_at FROM meta_ads_config LIMIT 1').get() as { account_name: string; ad_account_id: string; connected_at: string } | undefined
        const metaCampaigns = db.prepare('SELECT id, name, COALESCE(effective_status, status) as status, objective, spend, impressions, clicks, reach, cpc, cpm, ctr, date_start, date_stop, synced_at FROM meta_ads_campaigns ORDER BY spend DESC').all() as Array<Record<string, unknown>>
        result.meta_ads = {
          connected: !!metaConfig,
          account_name: metaConfig?.account_name ?? null,
          ad_account_id: metaConfig?.ad_account_id ?? null,
          campaigns: metaCampaigns,
          total_spend: metaCampaigns.reduce((s, c) => s + ((c.spend as number) ?? 0), 0),
          active_campaigns: metaCampaigns.filter(c => c.status === 'ACTIVE').length,
          data_note: metaCampaigns.length === 0
            ? 'No campaign data synced yet. To sync live data from the Facebook Graph API, ask me to sync Meta Ads data.'
            : `Showing cached data. Last synced: ${(metaCampaigns[0]?.synced_at as string) ?? 'unknown'}`,
        }
      }
      if (source === 'all' || source === 'google_analytics') {
        const gaConfig = db.prepare('SELECT property_id, property_name FROM google_analytics_config WHERE id = 1').get() as { property_id: string; property_name: string } | undefined
        if (gaConfig?.property_id) {
          try {
            // 12-second timeout to avoid hanging the stream on slow external GA API
            const ctrl = new AbortController()
            const timeout = setTimeout(() => ctrl.abort(), 12000)
            const gaRes = await fetch(`http://localhost:3000/api/google-analytics/data?days=30`, { signal: ctrl.signal })
            clearTimeout(timeout)
            if (gaRes.ok) {
              result.google_analytics = await gaRes.json()
            } else {
              result.google_analytics = { error: `GA API returned ${gaRes.status}`, property_name: gaConfig.property_name }
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'unknown error'
            result.google_analytics = { error: `GA fetch failed: ${msg}`, property_name: gaConfig.property_name }
          }
        } else {
          result.google_analytics = { error: 'Google Analytics not connected' }
        }
      }
      if (source === 'all' || source === 'instagram') {
        result.instagram = db.prepare('SELECT * FROM instagram_config LIMIT 1').get()
        result.ig_note = 'Instagram account connected; live follower/engagement data requires live API access'
      }
      return result
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

    // ── New action tools ────────────────────────────────────────────────────
    case 'queue_email': {
      const { subject, body, to_email, to_name, context } = input as {
        subject: string; body: string; to_email?: string; to_name?: string; context?: string
      }
      const result = db.prepare(`
        INSERT INTO agent_email_queue (subject, body, to_email, to_name, context)
        VALUES (?, ?, ?, ?, ?)
      `).run(subject, body, to_email ?? null, to_name ?? null, context ?? null)
      return { queued: true, id: result.lastInsertRowid, subject, message: 'Email draft added to review queue. Kyle will see it before anything is sent.' }
    }

    case 'write_recipe': {
      const { title, tagline, description, blend_used, ingredients, instructions, notes } = input as {
        title: string; tagline?: string; description?: string; blend_used: string
        ingredients: string; instructions: string; notes?: string
      }
      const result = db.prepare(`
        INSERT INTO recipes (title, tagline, description, blend_used, ingredients, instructions, notes, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', 'coo_agent')
      `).run(title, tagline ?? null, description ?? null, blend_used, ingredients, instructions, notes ?? null)
      return { written: true, id: result.lastInsertRowid, title, status: 'draft', message: 'Recipe saved as draft.' }
    }

    case 'update_inventory_threshold': {
      const { product_name, new_threshold } = input as { product_name: string; new_threshold: number }
      const product = db.prepare(
        'SELECT shopify_id, title FROM shopify_products WHERE title LIKE ? AND status = ? LIMIT 1'
      ).get(`%${product_name}%`, 'active') as { shopify_id: string; title: string } | undefined
      if (!product) return { error: `No active product found matching "${product_name}"` }
      db.prepare(`
        INSERT INTO shopify_inventory_settings (shopify_product_id, reorder_threshold)
        VALUES (?, ?)
        ON CONFLICT(shopify_product_id) DO UPDATE SET reorder_threshold = excluded.reorder_threshold
      `).run(product.shopify_id, new_threshold)
      return { updated: true, product: product.title, new_threshold }
    }

    case 'flag_item': {
      const { item_type, item_name, reason, urgency = 'medium' } = input as {
        item_type: string; item_name: string; reason: string; urgency?: string
      }
      const result = db.prepare(`
        INSERT INTO agent_flags (item_type, item_name, reason, urgency)
        VALUES (?, ?, ?, ?)
      `).run(item_type, item_name, reason, urgency)
      return { flagged: true, id: result.lastInsertRowid, item_name, urgency, message: 'Flag created.' }
    }

    case 'get_supplies': {
      const { category = 'all' } = input as { category?: string }
      let q = 'SELECT id, name, vendor, category, package_cost, active FROM supplies WHERE 1=1'
      const params: unknown[] = []
      if (category && category !== 'all') { q += ' AND category = ?'; params.push(category) }
      q += ' ORDER BY category, name'
      return db.prepare(q).all(...params)
    }

    case 'get_flags': {
      const { status = 'open', urgency } = input as { status?: string; urgency?: string }
      let q = 'SELECT * FROM agent_flags WHERE 1=1'
      const params: unknown[] = []
      if (status && status !== 'all') { q += ' AND status = ?'; params.push(status) }
      if (urgency && urgency !== 'all') { q += ' AND urgency = ?'; params.push(urgency) }
      q += ' ORDER BY CASE urgency WHEN ? THEN 1 WHEN ? THEN 2 ELSE 3 END, created_at DESC'
      params.push('high', 'medium')
      return db.prepare(q).all(...params)
    }

    case 'get_email_queue': {
      const { status = 'pending_review' } = input as { status?: string }
      let q = 'SELECT id, to_email, to_name, subject, body, context, status, created_at FROM agent_email_queue WHERE 1=1'
      const params: unknown[] = []
      if (status && status !== 'all') { q += ' AND status = ?'; params.push(status) }
      q += ' ORDER BY created_at DESC LIMIT 10'
      return db.prepare(q).all(...params)
    }

    case 'get_recipes': {
      const { status = 'all', blend } = input as { status?: string; blend?: string }
      let q = `SELECT id, title, tagline, description, blend_used,
                 ingredients, instructions, notes, status, created_by, created_at
               FROM recipes WHERE 1=1`
      const params: unknown[] = []
      if (status && status !== 'all') { q += ' AND status = ?'; params.push(status) }
      if (blend) { q += ' AND blend_used LIKE ?'; params.push(`%${blend}%`) }
      q += ' ORDER BY created_at DESC'
      return db.prepare(q).all(...params)
    }

    case 'get_marketing_strategy': {
      return db.prepare('SELECT section, content, updated_at FROM marketing_strategy ORDER BY section').all()
    }

    case 'get_products': {
      const { active_only = true } = input as { active_only?: boolean }
      let q = 'SELECT id, name, slug, description, wholesale_price, retail_price, accent_color, active FROM products WHERE 1=1'
      const params: unknown[] = []
      if (active_only) { q += ' AND active = 1' }
      q += ' ORDER BY id'
      return db.prepare(q).all(...params)
    }

    case 'get_customer_insights': {
      const totalCustomers = db.prepare('SELECT COUNT(*) as count FROM shopify_customers').get() as { count: number }
      const topSpenders = db.prepare(
        'SELECT first_name, last_name, email, orders_count, ROUND(total_spent, 2) as total_spent FROM shopify_customers ORDER BY total_spent DESC LIMIT 10'
      ).all()
      const orderStats = db.prepare(`
        SELECT COUNT(*) as total_orders,
               ROUND(SUM(total_price), 2) as total_revenue,
               ROUND(AVG(total_price), 2) as avg_order_value,
               COUNT(DISTINCT email) as unique_customers
        FROM shopify_orders WHERE financial_status = 'paid'
      `).get()
      const repeatBuyers = db.prepare(
        'SELECT COUNT(*) as count FROM shopify_customers WHERE orders_count > 1'
      ).get() as { count: number }
      const listSize = db.prepare('SELECT SUM(profile_count) as total FROM klaviyo_lists').get() as { total: number | null }
      return {
        total_shopify_customers: totalCustomers.count,
        repeat_buyers: repeatBuyers.count,
        email_subscribers: listSize?.total ?? 0,
        order_stats: orderStats,
        top_spenders: topSpenders,
      }
    }

    case 'get_blend_recipe': {
      const { blend_name } = input as { blend_name: string }
      const product = db.prepare(
        `SELECT shopify_id, title FROM shopify_products WHERE lower(title) LIKE lower(?)`
      ).get(`%${blend_name}%`) as { shopify_id: string; title: string } | undefined

      if (!product) return { error: `No blend found matching "${blend_name}". Available blends: ${
        (db.prepare(`SELECT title FROM shopify_products WHERE status = 'active' AND (is_bundle = 0 OR is_bundle IS NULL)`).all() as { title: string }[]).map(r => r.title).join(', ')
      }` }

      const ingredients = db.prepare(`
        SELECT pi.tbsp, s.name as ingredient, s.oz_per_tbsp,
               ROUND(pi.tbsp * COALESCE(s.oz_per_tbsp, 0), 3) as oz_per_jar
        FROM product_ingredients pi
        JOIN supplies s ON s.id = pi.supply_id
        WHERE pi.shopify_product_id = ?
        ORDER BY pi.sort_order
      `).all(product.shopify_id)

      const packaging = db.prepare(`
        SELECT s.name, s.serving_size, s.serving_unit
        FROM product_packaging pp
        JOIN supplies s ON s.id = pp.supply_id
        WHERE pp.shopify_product_id = ?
      `).all(product.shopify_id)

      const local = db.prepare(
        'SELECT labor_cost, cost_per_unit FROM product_local WHERE shopify_product_id = ?'
      ).get(product.shopify_id) as { labor_cost: number; cost_per_unit: number } | undefined

      return {
        blend_name: product.title,
        ingredients_per_jar: ingredients,
        packaging,
        labor_cost_per_jar: local?.labor_cost ?? 0,
        cost_per_jar: local?.cost_per_unit ?? null,
        scaling_note: 'tbsp values are per single 8oz jar. Multiply each tbsp amount by batch size to scale.',
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

  // ── Seasonal / temporal awareness ────────────────────────────────────────
  const now = new Date()
  const todayStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const todayISO = now.toISOString().slice(0, 10)
  const year = now.getFullYear()

  // Key dates for a DTC food brand
  const keyDates: { label: string; date: Date; note?: string }[] = [
    { label: "Valentine's Day", date: new Date(`${year}-02-14`), note: 'gift sets, romantic dinners' },
    { label: "Mother's Day", date: new Date(`${year}-05-11`), note: 'gifting push, host-the-mom messaging' },
    { label: "Memorial Day", date: new Date(`${year}-05-26`), note: 'outdoor grilling season' },
    { label: 'Summer launch', date: new Date(`${year}-06-01`), note: 'lighter blends, al fresco entertaining' },
    { label: 'Fall launch', date: new Date(`${year}-09-01`), note: 'warming spices, soup season' },
    { label: 'Halloween', date: new Date(`${year}-10-31`) },
    { label: 'Thanksgiving', date: new Date(`${year}-11-27`), note: 'biggest gifting window, holiday bundles' },
    { label: 'Black Friday', date: new Date(`${year}-11-28`), note: 'sale start' },
    { label: 'Cyber Monday', date: new Date(`${year}-12-01`) },
    { label: 'Holiday shipping cutoff', date: new Date(`${year}-12-15`), note: 'last day for guaranteed Christmas delivery' },
    { label: 'Christmas', date: new Date(`${year}-12-25`) },
    { label: "New Year's / resolution season", date: new Date(`${year + 1}-01-01`), note: 'healthy cooking, fresh starts' },
  ]

  const msPerWeek = 7 * 24 * 60 * 60 * 1000
  const upcomingLines = keyDates
    .map(kd => {
      const weeksOut = Math.round((kd.date.getTime() - now.getTime()) / msPerWeek)
      return { ...kd, weeksOut }
    })
    .filter(kd => kd.weeksOut >= -1 && kd.weeksOut <= 16) // show ±1 week to 16 weeks out
    .sort((a, b) => a.weeksOut - b.weeksOut)
    .map(kd => {
      const when = kd.weeksOut < 0 ? `${Math.abs(kd.weeksOut)} week(s) ago`
        : kd.weeksOut === 0 ? 'this week'
        : `${kd.weeksOut} week(s) away`
      return `- **${kd.label}** (${when})${kd.note ? ` — ${kd.note}` : ''}`
    })

  const seasonalSection = `\n\n## Today's Date & Seasonal Context\nToday is **${todayStr}** (${todayISO}).

${upcomingLines.length > 0
  ? `**Upcoming milestones in the next 16 weeks:**\n${upcomingLines.join('\n')}\n\nProactively flag these windows when relevant — WDP needs 6–8 weeks of runway to plan a campaign, photograph product, draft copy, and schedule emails.`
  : 'No major milestones in the next 16 weeks — good time for evergreen content and community building.'
}`

  const basePrompt = agent?.system_prompt || 'You are a helpful assistant for Weeknight Dinner Party.'
  const systemPrompt = basePrompt + brandSection + seasonalSection + memorySection + BEHAVIOR_INSTRUCTIONS

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

        for (let round = 0; round < 12; round++) {
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

          // Keep-alive: send invisible zero-width space every 5s during tool execution
          // so the browser doesn't close the stream while waiting for slow external APIs
          const keepAliveInterval = setInterval(() => {
            try { controller.enqueue(encoder.encode('​')) } catch { /* stream already closed */ }
          }, 5000)

          const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(toolUseBlocks.map(async block => {
            let toolInput: Record<string, unknown> = {}
            try { toolInput = JSON.parse(block.inputJson) } catch { /* ignore */ }
            try {
              const result = await executeTool(block.name, toolInput, db, agent_id)
              return {
                type: 'tool_result' as const,
                tool_use_id: block.id,
                content: JSON.stringify(result),
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'Tool execution error'
              return {
                type: 'tool_result' as const,
                tool_use_id: block.id,
                content: JSON.stringify({ error: msg }),
                is_error: true,
              }
            }
          }))

          clearInterval(keepAliveInterval)

          loopMessages = [
            ...loopMessages,
            { role: 'assistant' as const, content: finalMsg.content },
            { role: 'user' as const, content: toolResults },
          ]
        }
      } catch (e) {
        console.error('Chat stream error:', e)
        try {
          const msg = e instanceof Error ? e.message : 'Unknown error'
          controller.enqueue(encoder.encode(`\n\n*Something went wrong: ${msg}. Please try again.*`))
        } catch { /* stream already closed */ }
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
