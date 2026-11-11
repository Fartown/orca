import { describe, expect, it } from 'vitest'
import { quotedTaskText, quotedTaskTitle } from './local-task-inbox-copy'

describe('quoted task text for the dispatcher (REQ-031)', () => {
  it('stays within its limit once quoted, even when control characters fill it', () => {
    const escapes = '\u001b[31m'.repeat(80)
    const quoted = quotedTaskText(`${escapes}"done"\\`)
    expect(quoted.length).toBeLessThanOrEqual(160 * 2 + 2)
    expect(quoted).not.toContain('\\u001b')
    expect(`${quotedTaskTitle(escapes)}: ${quoted}`.length).toBeLessThan(500)
  })
})
