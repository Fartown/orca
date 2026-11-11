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

  it('names the task holding a workspace by its title, and keeps the ref when none is loaded', () => {
    const copy = localTasksCopy()
    const refused = {
      kind: 'refused' as const,
      code: 'workspace_already_linked',
      detail: 'SHOP-12'
    }
    const tasks = [{ ref: 'SHOP-12', title: 'Export orders as CSV' }]
    expect(localTaskWriteMessage(copy, refused, tasks)).toBe(
      copy.failures.workspace_already_linked('Export orders as CSV')
    )
    expect(localTaskWriteMessage(copy, refused, [])).toBe(
      copy.failures.workspace_already_linked('SHOP-12')
    )
  })
})
