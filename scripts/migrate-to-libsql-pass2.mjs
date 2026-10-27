#!/usr/bin/env node
/**
 * Second-pass migration: handles remaining db.prepare() calls that pass2 script missed.
 * Uses a character-level parser to handle:
 *  - Whitespace between db.prepare( and the SQL string
 *  - Nested parentheses in args (e.g. title.trim(), nullish coalescing)
 *  - Single-quoted SQL strings
 *  - Variable SQL (e.g. db.prepare(q).all(...params))
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
  return content.includes('db.prepare(') && !f.includes('/lib/db.ts')
})

console.log(`Found ${files.length} files with remaining db.prepare() calls\n`)

let totalChanged = 0

for (const file of files) {
  const original = readFileSync(file, 'utf8')
  let content = transformFile(original)
  if (content !== original) {
    writeFileSync(file, content, 'utf8')
    totalChanged++
    console.log(`  ✓ ${file.replace(SRC + '/', '')}`)
  }
}

console.log(`\nMigrated ${totalChanged} more files`)

// Check remaining
const stillLeft = walkSync(SRC).filter(f => {
  const content = readFileSync(f, 'utf8')
  return content.includes('db.prepare(') && !f.includes('/lib/db.ts')
})
if (stillLeft.length > 0) {
  console.log('\n⚠️  Still needs manual review:')
  for (const f of stillLeft) console.log(`  - ${f.replace(SRC + '/', '')}`)
}

// ─── core transformer ─────────────────────────────────────────────────────────

function transformFile(content) {
  // Find all db.prepare( occurrences and transform each one
  let result = ''
  let i = 0

  while (i < content.length) {
    const idx = content.indexOf('db.prepare(', i)
    if (idx === -1) {
      result += content.slice(i)
      break
    }

    result += content.slice(i, idx)
    const [transformed, consumed] = transformPrepareCall(content, idx)
    result += transformed
    i = idx + consumed
  }

  return result
}

/**
 * Given the content starting at `db.prepare(`, extract the full call and transform it.
 * Returns [transformedString, charsConsumed].
 */
function transformPrepareCall(content, start) {
  // start points to 'd' of 'db.prepare('
  // Skip past 'db.prepare('
  let i = start + 'db.prepare('.length

  // Skip whitespace
  while (i < content.length && /\s/.test(content[i])) i++

  // Extract the SQL argument (may be template literal, single-quoted, double-quoted, or variable)
  let sql = ''
  let sqlKind = 'unknown' // 'backtick', 'single', 'double', 'variable'

  if (content[i] === '`') {
    // template literal
    sqlKind = 'backtick'
    const end = findEndOfTemplateLiteral(content, i)
    sql = content.slice(i, end + 1)
    i = end + 1
  } else if (content[i] === "'") {
    // single-quoted string
    sqlKind = 'single'
    const end = findEndOfString(content, i, "'")
    sql = content.slice(i, end + 1)
    i = end + 1
  } else if (content[i] === '"') {
    // double-quoted string
    sqlKind = 'double'
    const end = findEndOfString(content, i, '"')
    sql = content.slice(i, end + 1)
    i = end + 1
  } else {
    // variable reference — extract identifier/expression up to closing )
    // Find the matching )
    let depth = 0
    const varStart = i
    while (i < content.length) {
      if (content[i] === '(') depth++
      else if (content[i] === ')') {
        if (depth === 0) break
        depth--
      }
      i++
    }
    sql = content.slice(varStart, i).trim()
    sqlKind = 'variable'
  }

  // Skip whitespace after SQL
  while (i < content.length && /\s/.test(content[i])) i++

  // Expect closing ) of prepare(...)
  if (content[i] !== ')') {
    // Can't parse — return original
    return [content.slice(start, i), i - start]
  }
  i++ // consume the )

  // Skip whitespace
  while (i < content.length && /\s/.test(content[i])) i++

  // Expect .get( or .all( or .run(
  if (content[i] !== '.') {
    return [content.slice(start, i), i - start]
  }
  i++ // consume the .

  // Read method name
  const methodStart = i
  while (i < content.length && /[a-z]/.test(content[i])) i++
  const method = content.slice(methodStart, i)

  if (!['get', 'all', 'run', 'exec'].includes(method)) {
    return [content.slice(start, i), i - start]
  }

  // Expect (
  if (content[i] !== '(') {
    return [content.slice(start, i), i - start]
  }
  i++ // consume (

  // Extract args (handling nested parens, strings, template literals)
  const args = extractArgs(content, i)
  i += args.consumed

  // Expect )
  if (content[i] !== ')') {
    return [content.slice(start, i), i - start]
  }
  i++ // consume )

  // Build the libsql equivalent
  const sqlExpr = sqlKind === 'variable' ? sql : sql
  const argsStr = buildArgs(args.args)

  let transformed
  if (method === 'all') {
    transformed = `(await db.execute({sql: ${sqlExpr}, args: ${argsStr}})).rows`
  } else if (method === 'get') {
    transformed = `(await db.execute({sql: ${sqlExpr}, args: ${argsStr}})).rows[0]`
  } else if (method === 'run') {
    transformed = `await db.execute({sql: ${sqlExpr}, args: ${argsStr}})`
  } else {
    // exec — shouldn't appear but handle it
    transformed = `await db.execute(${sqlExpr})`
  }

  return [transformed, i - start]
}

function buildArgs(args) {
  if (args.length === 0) return '[]'
  if (args.length === 1) {
    const a = args[0].trim()
    if (a.startsWith('...')) return a.slice(3).trim()  // spread → use array directly
    if (a.startsWith('[')) return a  // already an array literal
  }
  // Check for spread in single arg
  if (args.length === 1 && args[0].trim().startsWith('...')) {
    return args[0].trim().slice(3).trim()
  }
  return `[${args.join(', ')}]`
}

/**
 * Extract comma-separated args from current position (after the opening '(').
 * Handles nested parens, template literals, strings.
 * Returns { args: string[], consumed: number } where consumed is chars including trailing content up to ')'.
 */
function extractArgs(content, start) {
  const args = []
  let current = ''
  let depth = 0
  let i = start

  while (i < content.length) {
    const ch = content[i]

    if (ch === ')' && depth === 0) {
      // End of args
      const trimmed = current.trim()
      if (trimmed.length > 0) args.push(trimmed)
      return { args, consumed: i - start }
    }

    if (ch === ',' && depth === 0) {
      const trimmed = current.trim()
      if (trimmed.length > 0) args.push(trimmed)
      current = ''
      i++
      continue
    }

    if (ch === '(' || ch === '[' || ch === '{') depth++
    else if (ch === ')' || ch === ']' || ch === '}') depth--
    else if (ch === '`') {
      const end = findEndOfTemplateLiteral(content, i)
      current += content.slice(i, end + 1)
      i = end + 1
      continue
    } else if (ch === "'") {
      const end = findEndOfString(content, i, "'")
      current += content.slice(i, end + 1)
      i = end + 1
      continue
    } else if (ch === '"') {
      const end = findEndOfString(content, i, '"')
      current += content.slice(i, end + 1)
      i = end + 1
      continue
    }

    current += ch
    i++
  }

  return { args, consumed: i - start }
}

function findEndOfTemplateLiteral(content, start) {
  // start is at the opening backtick
  let i = start + 1
  while (i < content.length) {
    if (content[i] === '\\') { i += 2; continue }
    if (content[i] === '$' && content[i + 1] === '{') {
      // template expression — skip it
      let depth = 1
      i += 2
      while (i < content.length && depth > 0) {
        if (content[i] === '{') depth++
        else if (content[i] === '}') depth--
        i++
      }
      continue
    }
    if (content[i] === '`') return i
    i++
  }
  return i
}

function findEndOfString(content, start, quote) {
  let i = start + 1
  while (i < content.length) {
    if (content[i] === '\\') { i += 2; continue }
    if (content[i] === quote) return i
    i++
  }
  return i
}
