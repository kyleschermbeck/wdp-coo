#!/usr/bin/env node
/**
 * Fix db.execute calls where the closing `}` of the object literal was dropped.
 *
 * Pattern: db.execute({sql: ..., args: [...])`  ← missing `}`
 * Fix:     db.execute({sql: ..., args: [...]})`
 *
 * Uses balanced-brace/bracket scanning so it handles multi-line calls correctly.
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

const SRC = join(import.meta.dirname, '..', 'src')

/**
 * Given the content string and position of `{` that opens db.execute({...}),
 * find the position of the matching `}`. Returns -1 if not found.
 */
function findMatchingBrace(content, openPos) {
  let depth = 0
  for (let i = openPos; i < content.length; i++) {
    const ch = content[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i
    } else if (ch === '`') {
      // Skip template literal
      i++
      while (i < content.length) {
        if (content[i] === '\\') { i += 2; continue }
        if (content[i] === '`') break
        // Handle ${...} inside template literals
        if (content[i] === '$' && content[i+1] === '{') {
          const inner = findMatchingBrace(content, i + 1)
          if (inner !== -1) i = inner
        }
        i++
      }
    } else if (ch === '"' || ch === "'") {
      // Skip string
      const q = ch; i++
      while (i < content.length) {
        if (content[i] === '\\') { i += 2; continue }
        if (content[i] === q) break
        i++
      }
    }
  }
  return -1
}

let totalFixed = 0

for (const file of walkSync(SRC)) {
  const original = readFileSync(file, 'utf8')
  let content = original
  let offset = 0
  let fileFixed = 0

  while (true) {
    // Find the next db.execute({ pattern
    const idx = content.indexOf('db.execute({', offset)
    if (idx === -1) break

    // The `{` is at idx + 'db.execute('.length = idx + 11
    const braceOpen = idx + 11

    // Find matching `}` for this object literal
    const braceClose = findMatchingBrace(content, braceOpen)
    if (braceClose === -1) {
      offset = idx + 1
      continue
    }

    // The character after `}` should be `)` to close db.execute(
    // If the character at braceClose is `}`, all is fine.
    // If braceClose doesn't exist and instead `])` comes right after args, we need to fix.
    // Actually: if the `{` wasn't closed (braceClose found `}` via escape), skip.

    // Check: is the call properly terminated with `})`?
    // braceClose is the position of `}`, braceClose+1 should be `)` ideally.
    // But if the `}` is missing, findMatchingBrace would find a `}` that actually
    // belongs to the containing function, not to db.execute's object.

    // Better approach: find the `)` that closes db.execute( by scanning from braceOpen
    // while tracking depth of `(` as well.
    offset = idx + 1
  }

  // Reset and use a different approach:
  // Look for: `db.execute({` ... `])`  where `])` closes the args array AND the execute call
  // i.e., `}` is missing before the final `)`
  //
  // Pattern: scan for `db.execute({`, then find end of the call
  // If the call ends with `])` (array close + paren close) rather than `]})`, fix it.

  offset = 0
  const fixes = []

  while (true) {
    const idx = content.indexOf('db.execute({', offset)
    if (idx === -1) break

    // Scan forward tracking depths
    let parenDepth = 0 // depth of `(` - for the db.execute( call
    let braceDepth = 0 // depth of `{` - for the object literal
    let inString = false
    let stringChar = ''
    let inTemplate = false
    let templateDepth = 0

    // We need to find the `)` that closes `db.execute(`
    // `db.execute(` is at idx, the `(` is at idx + 10
    // `{` is at idx + 11

    // Go back to find the opening `(` of execute(
    // Actually, 'db.execute({' - the `(` is at position idx+10

    let i = idx + 10 // position of `(`
    parenDepth = 0

    let start = i
    let execClosePos = -1

    for (let j = i; j < content.length; j++) {
      const ch = content[j]

      if (inString) {
        if (ch === '\\') { j++; continue }
        if (ch === stringChar) inString = false
        continue
      }

      if (ch === '"' || ch === "'") {
        inString = true; stringChar = ch; continue
      }

      if (ch === '`') {
        // Skip template literal simply (ignoring ${} for brace counting purposes -
        // this is fine since we only care about the outer structure)
        j++
        let tlDepth = 0
        while (j < content.length) {
          const tc = content[j]
          if (tc === '\\') { j++; continue }
          if (tc === '`' && tlDepth === 0) break
          if (tc === '$' && content[j+1] === '{') { tlDepth++; j++; continue }
          if (tc === '}' && tlDepth > 0) { tlDepth--; continue }
          j++
        }
        continue
      }

      if (ch === '(') parenDepth++
      else if (ch === ')') {
        parenDepth--
        if (parenDepth === 0) {
          execClosePos = j
          break
        }
      }
    }

    if (execClosePos === -1) {
      offset = idx + 1
      continue
    }

    // Check the char before execClosePos
    // If it's `]`, the `}` is missing
    // If it's `}`, all is good
    const charBefore = content[execClosePos - 1]

    // Skip whitespace/newline to find the real last non-whitespace char before `)`
    let prevCharPos = execClosePos - 1
    while (prevCharPos > idx && /\s/.test(content[prevCharPos])) prevCharPos--

    const prevChar = content[prevCharPos]

    if (prevChar === ']') {
      // Missing `}` - record the fix position
      fixes.push(prevCharPos + 1) // insert `}` after the `]`
    }

    offset = idx + 1
  }

  // Apply fixes in reverse order so positions don't shift
  if (fixes.length > 0) {
    fixes.sort((a, b) => b - a)
    for (const pos of fixes) {
      content = content.slice(0, pos) + '}' + content.slice(pos)
    }
    writeFileSync(file, content, 'utf8')
    const relPath = file.replace(SRC + '/', '')
    console.log(`  ✓ ${relPath} (${fixes.length} fix${fixes.length > 1 ? 'es' : ''})`)
    totalFixed += fixes.length
    fileFixed += fixes.length
  }
}

console.log(`\nTotal fixes: ${totalFixed}`)
