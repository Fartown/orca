import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Continuation watches a terminal from birth, so it is the path that hits xterm's DECRQM handler:
// esbuild's minifySyntax folds the handler's `(void 0 || (i = {}))` table into a shape that never
// answers, and the agent waits forever. The engine build minifies whitespace and identifiers only.
const ENGINE = join(import.meta.dirname, '..', 'terminal', 'terminal-webview-engine.generated.ts')

describe('the terminal WebView engine bundle', () => {
  it('keeps the request-mode table that syntax minification breaks', () => {
    const engine = readFileSync(ENGINE, 'utf8')
    // Guards the guard: an empty or missing bundle would also contain no folded table.
    expect(engine.length).toBeGreaterThan(100_000)
    expect(engine).not.toContain('void 0||(i=')
  })
})
