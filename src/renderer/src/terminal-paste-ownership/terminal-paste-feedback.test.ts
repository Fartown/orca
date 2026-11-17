import { describe, expect, it, vi } from 'vitest'
import { clearRecoveredTerminalPasteErrors } from './terminal-paste-feedback'
import { formatTerminalPasteOwnershipFailure } from './terminal-paste-failure'
import { formatTerminalPasteExecutionError } from '@/components/terminal-pane/terminal-paste-errors'

vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))

describe('paste failure feedback', () => {
  it('clears only the recovered pane paste errors and preserves unrelated terminal errors', () => {
    const focus = formatTerminalPasteOwnershipFailure('focus-changed')
    const errors = {
      1: [focus, 'Remote terminal was closed.', 'Image paste failed: clipboard rejected'],
      2: [focus]
    }
    expect(clearRecoveredTerminalPasteErrors(errors, 1)).toEqual({
      1: ['Remote terminal was closed.'],
      2: [focus]
    })
  })

  it('does not relabel generic stale targets as focus changes', () => {
    expect(formatTerminalPasteExecutionError('stale-target')).toBe(
      'Paste cancelled: terminal target changed before paste completed.'
    )
    expect(formatTerminalPasteOwnershipFailure('focus-changed')).toBe(
      'Paste cancelled: input focus does not match the target terminal.'
    )
  })

  it('retains object identity when there are no recovered errors', () => {
    const errors = { 1: ['Unrelated terminal failure'] }
    expect(clearRecoveredTerminalPasteErrors(errors, 1)).toBe(errors)
  })
})
