import Database from 'better-sqlite3'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'data', 'wdp.db')

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    // Merge any pending WAL writes into the main DB file on startup
    db.pragma('wal_checkpoint(TRUNCATE)')
    initSchema(db)
    runMigrations(db)
  }
  return db
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'planning' CHECK(status IN ('planning','active','on_hold','complete')),
      color TEXT NOT NULL DEFAULT 'sage',
      due_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','in_progress','review','done')),
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','urgent')),
      due_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subtasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      notes TEXT,
      due_date TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subtask_tags (
      subtask_id INTEGER NOT NULL REFERENCES subtasks(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (subtask_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT 'sage',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS project_tags (
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (project_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS task_tags (
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (task_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      wholesale_price REAL NOT NULL DEFAULT 10.00,
      retail_price REAL NOT NULL DEFAULT 16.00,
      accent_color TEXT NOT NULL DEFAULT 'sage',
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      quantity_on_hand INTEGER NOT NULL DEFAULT 0,
      reorder_threshold INTEGER NOT NULL DEFAULT 12,
      last_updated TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS oauth_tokens (
      id INTEGER PRIMARY KEY,
      provider TEXT NOT NULL UNIQUE,
      access_token TEXT,
      refresh_token TEXT,
      expiry_date INTEGER
    );

    CREATE TABLE IF NOT EXISTS email_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gmail_id TEXT NOT NULL UNIQUE,
      thread_id TEXT,
      subject TEXT,
      from_email TEXT,
      from_name TEXT,
      date TEXT,
      snippet TEXT,
      body_text TEXT,
      body_html TEXT,
      category TEXT DEFAULT 'other',
      priority INTEGER DEFAULT 2,
      ai_summary TEXT,
      is_read INTEGER DEFAULT 0,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS email_drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email_id INTEGER NOT NULL REFERENCES email_cache(id) ON DELETE CASCADE,
      draft_body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'lead' CHECK(type IN ('wholesale','lead','customer')),
      email TEXT,
      phone TEXT,
      store_name TEXT,
      address TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS api_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subtask_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subtask_id INTEGER NOT NULL REFERENCES subtasks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS marketing_strategy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS marketing_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'growth',
      target_value REAL,
      current_value REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT '',
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS marketing_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'instagram',
      type TEXT NOT NULL DEFAULT 'post',
      status TEXT NOT NULL DEFAULT 'planned',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  seedInitialData(db)
}

function runMigrations(db: Database.Database) {
  try { db.exec(`ALTER TABLE tasks ADD COLUMN notes TEXT`) } catch {}
  try { db.exec(`ALTER TABLE tasks ADD COLUMN recipe_data TEXT`) } catch {}
  try { db.exec(`ALTER TABLE subtasks ADD COLUMN notes TEXT`) } catch {}
  try { db.exec(`ALTER TABLE subtasks ADD COLUMN due_date TEXT`) } catch {}
  try { db.exec(`ALTER TABLE subtasks ADD COLUMN status TEXT NOT NULL DEFAULT 'todo'`) } catch {}
  try { db.exec(`ALTER TABLE subtasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`) } catch {}
  try { db.exec(`ALTER TABLE email_cache ADD COLUMN is_sent INTEGER NOT NULL DEFAULT 0`) } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS subtask_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subtask_id INTEGER NOT NULL REFERENCES subtasks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  } catch {}
  // api_usage may not exist on older DB files that were initialized before this table was added
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS api_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS marketing_strategy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS marketing_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'growth',
      target_value REAL,
      current_value REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT '',
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS marketing_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'instagram',
      type TEXT NOT NULL DEFAULT 'post',
      status TEXT NOT NULL DEFAULT 'planned',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS shopify_config (
      id INTEGER PRIMARY KEY,
      store_url TEXT NOT NULL,
      access_token TEXT NOT NULL DEFAULT '',
      client_id TEXT,
      client_secret TEXT,
      oauth_state TEXT,
      last_synced_at TEXT
    )`)
  } catch {}
  try { db.exec(`ALTER TABLE shopify_config ADD COLUMN client_id TEXT`) } catch {}
  try { db.exec(`ALTER TABLE shopify_config ADD COLUMN client_secret TEXT`) } catch {}
  try { db.exec(`ALTER TABLE shopify_config ADD COLUMN oauth_state TEXT`) } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS shopify_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shopify_id TEXT NOT NULL UNIQUE,
      order_number INTEGER,
      email TEXT,
      total_price REAL,
      subtotal_price REAL,
      financial_status TEXT,
      fulfillment_status TEXT,
      line_items TEXT,
      created_at TEXT,
      processed_at TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS shopify_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shopify_id TEXT NOT NULL UNIQUE,
      title TEXT,
      handle TEXT,
      status TEXT,
      inventory_quantity INTEGER DEFAULT 0,
      inventory_item_id TEXT,
      product_id INTEGER REFERENCES products(id),
      raw TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  } catch {}
  try { db.exec(`ALTER TABLE shopify_products ADD COLUMN inventory_item_id TEXT`) } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS shopify_customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shopify_id TEXT NOT NULL UNIQUE,
      email TEXT,
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      orders_count INTEGER DEFAULT 0,
      total_spent REAL DEFAULT 0,
      tags TEXT,
      note TEXT,
      created_at TEXT,
      updated_at TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS shopify_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shopify_id TEXT NOT NULL UNIQUE,
      name TEXT,
      active INTEGER DEFAULT 1
    )`)
  } catch {}
  try { db.exec(`ALTER TABLE shopify_products ADD COLUMN inventory_item_id TEXT`) } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS shopify_inventory_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shopify_product_id TEXT NOT NULL UNIQUE,
      reorder_threshold INTEGER NOT NULL DEFAULT 12
    )`)
  } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS klaviyo_config (
      id INTEGER PRIMARY KEY,
      api_key TEXT NOT NULL,
      account_name TEXT,
      last_synced_at TEXT
    )`)
  } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS klaviyo_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      klaviyo_id TEXT NOT NULL UNIQUE,
      name TEXT,
      profile_count INTEGER DEFAULT 0,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS klaviyo_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      klaviyo_id TEXT NOT NULL UNIQUE,
      name TEXT,
      status TEXT,
      subject TEXT,
      from_email TEXT,
      send_time TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS klaviyo_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metric_name TEXT NOT NULL UNIQUE,
      klaviyo_metric_id TEXT,
      value_30d REAL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS klaviyo_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      klaviyo_id TEXT NOT NULL UNIQUE,
      email TEXT,
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      created TEXT,
      updated TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS klaviyo_profile_lists (
      profile_id TEXT NOT NULL,
      list_id TEXT NOT NULL,
      list_name TEXT,
      PRIMARY KEY (profile_id, list_id)
    )`)
  } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS klaviyo_flows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      klaviyo_id TEXT NOT NULL UNIQUE,
      name TEXT,
      status TEXT,
      trigger_type TEXT,
      created TEXT,
      updated TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS event_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES marketing_events(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  } catch {}
  try { db.exec(`ALTER TABLE marketing_events ADD COLUMN pillar TEXT`) } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS instagram_config (
      id INTEGER PRIMARY KEY,
      access_token TEXT NOT NULL,
      ig_user_id TEXT NOT NULL,
      username TEXT,
      connected_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS meta_ads_config (
      id INTEGER PRIMARY KEY,
      access_token TEXT NOT NULL,
      ad_account_id TEXT NOT NULL,
      account_name TEXT,
      connected_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS supplies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      vendor TEXT,
      order_url TEXT,
      package_weight REAL,
      weight_unit TEXT NOT NULL DEFAULT 'lb',
      serving_size REAL,
      serving_unit TEXT NOT NULL DEFAULT 'oz',
      package_cost REAL,
      oz_per_tbsp REAL,
      category TEXT NOT NULL DEFAULT 'product',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  } catch {}
  // Migrations for supplies table
  try { db.exec(`ALTER TABLE supplies ADD COLUMN package_extra_oz REAL DEFAULT 0`) } catch {}
  try { db.exec(`ALTER TABLE supplies ADD COLUMN total_servings INTEGER DEFAULT 0`) } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS product_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shopify_product_id TEXT NOT NULL,
      supply_id INTEGER NOT NULL REFERENCES supplies(id) ON DELETE CASCADE,
      tbsp REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`)
  } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS product_packaging (
      shopify_product_id TEXT NOT NULL,
      supply_id INTEGER NOT NULL REFERENCES supplies(id) ON DELETE CASCADE,
      PRIMARY KEY (shopify_product_id, supply_id)
    )`)
  } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS product_local (
      shopify_product_id TEXT PRIMARY KEY,
      labor_cost REAL NOT NULL DEFAULT 0,
      accent_color TEXT
    )`)
  } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS settings_kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS subtask_dependencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subtask_id INTEGER NOT NULL REFERENCES subtasks(id) ON DELETE CASCADE,
      depends_on_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      depends_on_subtask_id INTEGER REFERENCES subtasks(id) ON DELETE CASCADE
    )`)
  } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS agent_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      topic TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
  } catch {}
}

function seedInitialData(db: Database.Database) {
  const productCount = (db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number }).count
  if (productCount > 0) return

  const products = [
    { name: 'House Seasoning',     slug: 'house-seasoning',     description: 'The Handy Sidekick for Everything',       accent_color: 'terracotta' },
    { name: 'Make No Mis-Steak',   slug: 'make-no-mis-steak',   description: 'Our Steak Spice Blend',                   accent_color: 'tomato' },
    { name: "Let's Taco-Bout It",  slug: 'lets-taco-bout-it',   description: 'Our Bold and Smoky Taco Seasoning',        accent_color: 'butter' },
    { name: 'Chim Chim Churri',    slug: 'chim-chim-churri',    description: 'Our Herby Chimmichurri Blend',             accent_color: 'thyme' },
    { name: 'Just Dill With It',   slug: 'just-dill-with-it',   description: 'Classic Ranch Seasoning Blend',            accent_color: 'sage' },
    { name: 'Top of the Morning',  slug: 'top-of-the-morning',  description: 'Bright Savory Flavor for Breakfast',       accent_color: 'citrus' },
    { name: 'Herbs of a Feather',  slug: 'herbs-of-a-feather',  description: 'Tangy & Herby Poultry and Veggie Blend',   accent_color: 'sage' },
    { name: 'For Every O-Cajun',   slug: 'for-every-o-cajun',   description: 'Smoky Cajun Flavor Without the Fuss',      accent_color: 'terracotta' },
    { name: 'Wing It On',          slug: 'wing-it-on',          description: 'For Wings and Game Day Everything',         accent_color: 'tomato' },
    { name: 'Sweeten the Deal',    slug: 'sweeten-the-deal',    description: 'Our Sweet and Spice Blend',                accent_color: 'candy' },
  ]

  const insertProduct = db.prepare(`
    INSERT INTO products (name, slug, description, wholesale_price, retail_price, accent_color)
    VALUES (@name, @slug, @description, 10.00, 16.00, @accent_color)
  `)
  const insertInventory = db.prepare(`
    INSERT INTO inventory (product_id, quantity_on_hand, reorder_threshold)
    VALUES (?, 0, 12)
  `)

  db.transaction(() => {
    for (const p of products) {
      const result = insertProduct.run(p)
      insertInventory.run(result.lastInsertRowid)
    }
  })()
}
