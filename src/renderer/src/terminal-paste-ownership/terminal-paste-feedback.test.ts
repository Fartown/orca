import { describe, expect, it, vi } from 'vitest'
import {
  clearRecoveredTerminalPasteErrors,
  createTerminalPasteFeedback
} from './terminal-paste-feedback'
import { formatTerminalPasteOwnershipFailure } from './terminal-paste-failure'
import type { TerminalErrorsByPaneId } from '@/components/terminal-pane/errors/terminal-error-accumulation'
import { formatTerminalPasteExecutionError } from '@/components/terminal-pane/input/paste/terminal-paste-errors'

vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))

const entry = (message: string) => ({ message, resourceLimit: false })

describe('paste failure feedback', () => {
  it('clears only the recovered pane paste errors and preserves unrelated terminal errors', () => {
    const focus = formatTerminalPasteOwnershipFailure('focus-changed')
    const errors = {
      1: [
        entry(focus),
        entry('Remote terminal was closed.'),
        entry('Image paste failed: clipboard rejected')
      ],
      2: [entry(focus)]
    }
    expect(clearRecoveredTerminalPasteErrors(errors, 1)).toEqual({
      1: [entry('Remote terminal was closed.')],
      2: [entry(focus)]
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
    const errors = { 1: [entry('Unrelated terminal failure')] }
    expect(clearRecoveredTerminalPasteErrors(errors, 1)).toBe(errors)
  })

  it('does not let an older completion clear a newer failed paste', () => {
    let errors: TerminalErrorsByPaneId = {}
    const begin = createTerminalPasteFeedback((update) => {
      errors = update(errors)
    })
    const older = begin(1)
    const newer = begin(1)
    const message = formatTerminalPasteOwnershipFailure('focus-changed')
    newer.fail(message)
    older.succeed()
    expect(errors).toEqual({ 1: [entry(message)] })
    begin(1).succeed()
    expect(errors).toEqual({})
  })

  it('does not let an older failure overwrite a newer successful paste', () => {
    let errors: TerminalErrorsByPaneId = {}
    const begin = createTerminalPasteFeedback((update) => {
      errors = update(errors)
    })
    const older = begin(1)
    begin(1).succeed()
    older.fail(formatTerminalPasteOwnershipFailure('focus-changed'))
    expect(errors).toEqual({})
  })

  it('keeps sequencing when tab activation reinstalls paste listeners', () => {
    let errors: TerminalErrorsByPaneId = {}
    const setErrors = (
      update: (current: TerminalErrorsByPaneId) => TerminalErrorsByPaneId
    ): void => {
      errors = update(errors)
    }
    const older = createTerminalPasteFeedback(setErrors)(1)
    const newer = createTerminalPasteFeedback(setErrors)(1)
    const message = formatTerminalPasteOwnershipFailure('target-disconnected')
    newer.fail(message)
    older.succeed()
    expect(errors).toEqual({ 1: [entry(message)] })
  })
})
