#!/usr/bin/env node
/**
 * Migrates all API route files from better-sqlite3 (sync) to @libsql/client (async).
 *
 * Transformations applied:
 *  1. const db = getDb()  →  const db = await getDb()
 *  2. db.prepare(`sql`).all(args)  →  (await db.execute({sql:`sql`, args:[args]})).rows
 *  3. db.prepare(`sql`).get(args)  →  (await db.execute({sql:`sql`, args:[args]})).rows[0]
 *  4. db.prepare(`sql`).run(args)  →  await db.execute({sql:`sql`, args:[args]})
 *  5. result.lastInsertRowid  left as-is (libsql returns bigint, same as better-sqlite3)
 *
 * The script uses a simple line-oriented approach that handles the majority of cases.
 * It outputs which files it could not fully transform for manual review.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

function walkSync(dir, exts = ['.ts', '.tsx'], results = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name !== 'node_modules' && name !== '.next') walkSync(p, exts, results)
    } else if (exts.some(e => name.endsWith(e)) && !name.endsWith('.d.ts')) {
      results.push(p)
    }
  }
  return results
}

const ROOT = join(import.meta.dirname, '..')
const SRC = join(ROOT, 'src')

const files = walkSync(SRC).filter(f => {
  const content = readFileSync(f, 'utf8')
  return content.includes('getDb') && !f.includes('/lib/db.ts')
})

console.log(`Found ${files.length} files to migrate\n`)

let totalChanged = 0
const needsReview = []

for (const file of files) {
  const original = readFileSync(file, 'utf8')
  let content = original

  // ── 1. const db = getDb() → const db = await getDb() ─────────────────────
  content = content.replace(/\bconst db = getDb\(\)/g, 'const db = await getDb()')

  // ── 2-4. db.prepare(sql).<method>(args) transformations ───────────────────
  // Strategy: find each db.prepare(...).method(...) call
  // We handle both single-line and basic multi-line cases

  // Pass A: single-line template literal SQL
  // db.prepare(`...`).all()
  content = content.replace(
    /db\.prepare\(`([^`]*)`\)\.all\(\)/g,
    (_, sql) => `(await db.execute({sql: \`${sql}\`, args: []})).rows`
  )
  // db.prepare(`...`).all(...args)
  content = content.replace(
    /db\.prepare\(`([^`]*)`\)\.all\(([^)]+)\)/g,
    (_, sql, argsExpr) => {
      const args = parseArgs(argsExpr)
      return `(await db.execute({sql: \`${sql}\`, args: ${args}})).rows`
    }
  )
  // db.prepare(`...`).get()
  content = content.replace(
    /db\.prepare\(`([^`]*)`\)\.get\(\)/g,
    (_, sql) => `(await db.execute({sql: \`${sql}\`, args: []})).rows[0]`
  )
  // db.prepare(`...`).get(...args)
  content = content.replace(
    /db\.prepare\(`([^`]*)`\)\.get\(([^)]+)\)/g,
    (_, sql, argsExpr) => {
      const args = parseArgs(argsExpr)
      return `(await db.execute({sql: \`${sql}\`, args: ${args}})).rows[0]`
    }
  )
  // db.prepare(`...`).run() - no return value needed
  content = content.replace(
    /db\.prepare\(`([^`]*)`\)\.run\(\)/g,
    (_, sql) => `await db.execute({sql: \`${sql}\`, args: []})`
  )
  // db.prepare(`...`).run(args) - may have lastInsertRowid
  content = content.replace(
    /db\.prepare\(`([^`]*)`\)\.run\(([^)]+)\)/g,
    (_, sql, argsExpr) => {
      const args = parseArgs(argsExpr)
      return `await db.execute({sql: \`${sql}\`, args: ${args}})`
    }
  )

  // Pass B: single-line string SQL (quoted with ' or ")
  content = content.replace(
    /db\.prepare\(('(?:[^'\\]|\\.)*')\)\.all\(\)/g,
    (_, sql) => `(await db.execute({sql: ${sql}, args: []})).rows`
  )
  content = content.replace(
    /db\.prepare\(('(?:[^'\\]|\\.)*')\)\.get\(\)/g,
    (_, sql) => `(await db.execute({sql: ${sql}, args: []})).rows[0]`
  )
  content = content.replace(
    /db\.prepare\(('(?:[^'\\]|\\.)*')\)\.get\(([^)]+)\)/g,
    (_, sql, argsExpr) => {
      const args = parseArgs(argsExpr)
      return `(await db.execute({sql: ${sql}, args: ${args}})).rows[0]`
    }
  )
  content = content.replace(
    /db\.prepare\(('(?:[^'\\]|\\.)*')\)\.run\(([^)]+)\)/g,
    (_, sql, argsExpr) => {
      const args = parseArgs(argsExpr)
      return `await db.execute({sql: ${sql}, args: ${args}})`
    }
  )
  content = content.replace(
    /db\.prepare\(('(?:[^'\\]|\\.)*')\)\.run\(\)/g,
    (_, sql) => `await db.execute({sql: ${sql}, args: []})`
  )

  // ── 3. stored prepared statements: assigned to variable then called ────────
  // const stmt = db.prepare(sql); stmt.get/all/run(args)
  // These are less common; flag for review if still present
  if (content.includes('db.prepare(') && content.includes('.prepare(')) {
    needsReview.push(file)
  }

  // ── 4. db.exec() in route files (shouldn't be common but handle it) ───────
  content = content.replace(
    /\bdb\.exec\(`([^`]*)`\)/g,
    (_, sql) => `await db.execute(\`${sql}\`)`
  )

  if (content !== original) {
    writeFileSync(file, content, 'utf8')
    totalChanged++
    const rel = file.replace(SRC + '/', '')
    console.log(`  ✓ ${rel}`)
  }
}

console.log(`\nMigrated ${totalChanged} files`)

if (needsReview.length > 0) {
  console.log('\n⚠️  Files needing manual review (still have db.prepare):')
  for (const f of needsReview) {
    console.log(`  - ${f.replace(SRC + '/', '')}`)
  }
}

function parseArgs(expr) {
  expr = expr.trim()
  // ...spread → use array directly
  if (expr.startsWith('...')) {
    return expr.slice(3).trim()
  }
  // already an array literal
  if (expr.startsWith('[')) return expr
  // single value or multiple comma-separated values
  return `[${expr}]`
}
