#!/usr/bin/env node
/**
 * Fix broken args expressions from the migration scripts.
 *
 * Common broken patterns:
 *   args: [parseInt(id]}))     → args: [parseInt(id)])
 *   args: vals, expr(x}))      → args: [...vals, expr(x)])   (spread case)
 *   args: [name?.trim(]}, ...  → (complex — handled by re-parsing)
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

// Patterns to fix:
// Pattern A: args: [expr(inner]}  → args: [expr(inner)]
// The `]` ended up inside a function call because the regex stopped at `)` prematurely.

// Pattern B: args: spread, expr(inner}  → args: [...spread, expr(inner)]
// The spread was taken literally but then extra args appeared outside the []

let count = 0

for (const file of walkSync(SRC)) {
  const original = readFileSync(file, 'utf8')
  let content = original

  // Fix: args: [expr(stuff]}) → args: [expr(stuff)])
  // Pattern: `args: [` ... something ... `(` ... content without `]` ... `]}`
  // The misplaced `]` closes the array before the `)` of the function call
  content = content.replace(/args: \[([^[\]]*)\(([^\]]*)\]\}([^)]*)\)/g, (match, before, inner, after) => {
    // Reconstruct: args: [before(inner)after]
    return `args: [${before}(${inner})${after}]`
  })

  // Fix: args: spread, expr(stuff}))  → args: [...spread, expr(stuff)])
  // When we see `args: identifier, identifier(content})`
  content = content.replace(/args: ([a-zA-Z_$][a-zA-Z0-9_$]*), ([a-zA-Z_$][a-zA-Z0-9_$.?]*\([^}]*)\}\)/g, (match, spread, rest) => {
    return `args: [...${spread}, ${rest}])`
  })

  // Fix parseInt/parseFloat/Number/String/parseInt with broken close:
  // args: [parseInt(id]})) → args: [parseInt(id)])
  content = content.replace(/args: \[([^\]]*)\(([a-zA-Z0-9_$.?]*)\]\}([^)]*)\)/g, (match, fn, arg, trailing) => {
    return `args: [${fn}(${arg})${trailing}])`
  })

  if (content !== original) {
    writeFileSync(file, content, 'utf8')
    count++
    console.log(`  ✓ ${file.replace(SRC + '/', '')}`)
  }
}

console.log(`\nFixed ${count} files`)
