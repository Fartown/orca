import { describe, expect, it } from 'vitest'
import { localTaskWriteMessage } from './local-task-failure-message'
import { localTasksCopy } from './local-tasks-copy'

describe('mobile local task refusal copy', () => {
  it('explains invalid input and prefix history, and falls back for a newer host code', () => {
    const copy = localTasksCopy()
    expect(
      localTaskWriteMessage(copy, { kind: 'refused', code: 'invalid_argument', detail: null })
    ).toBe(copy.failures.invalid_argument)
    expect(
      localTaskWriteMessage(copy, {
        kind: 'refused',
        code: 'prefix_history_in_project',
        detail: null
      })
    ).toBe(copy.failures.prefix_history_in_project)
    expect(
      localTaskWriteMessage(copy, { kind: 'refused', code: 'future_code', detail: null })
    ).toBe(copy.failureGeneric('future_code'))
  })
})
