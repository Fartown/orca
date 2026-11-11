import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import type { LocalTaskWriteOutcome } from './local-tasks-api'
import type { LocalTasksCopy } from './local-tasks-copy'

function isKnownCode(
  failures: LocalTasksCopy['failures'],
  code: string
): code is keyof LocalTasksCopy['failures'] {
  return Object.hasOwn(failures, code)
}

// The host names the task holding a workspace or session by its ref; the message names it by title.
const NAMES_A_TASK: ReadonlySet<string> = new Set([
  'workspace_already_linked',
  'session_already_linked'
])

/**
 * What to tell the user about a write, or null when there is nothing to say. `tasks` are the ones
 * the caller has loaded; a ref the host names is shown as that task's title when one matches.
 */
export function localTaskWriteMessage(
  copy: LocalTasksCopy,
  outcome: LocalTaskWriteOutcome<unknown>,
  tasks?: readonly Pick<LocalTask, 'ref' | 'title'>[]
): string | null {
  switch (outcome.kind) {
    case 'ok':
      return null
    case 'unknown':
      return copy.deliveryUnknown
    case 'error':
      return copy.writeError(outcome.message)
    case 'refused': {
      if (!isKnownCode(copy.failures, outcome.code)) {
        return copy.failureGeneric(outcome.code)
      }
      const entry = copy.failures[outcome.code]
      const detail = outcome.detail ?? ''
      const named = NAMES_A_TASK.has(outcome.code)
        ? (tasks?.find((task) => task.ref === detail)?.title ?? detail)
        : detail
      return typeof entry === 'function' ? entry(named) : entry
    }
  }
}
