import type { LocalTaskWriteOutcome } from './local-tasks-api'
import type { LocalTasksCopy } from './local-tasks-copy'

function isKnownCode(
  failures: LocalTasksCopy['failures'],
  code: string
): code is keyof LocalTasksCopy['failures'] {
  return Object.hasOwn(failures, code)
}

/** What to tell the user about a write, or null when there is nothing to say. */
export function localTaskWriteMessage(
  copy: LocalTasksCopy,
  outcome: LocalTaskWriteOutcome<unknown>
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
      return typeof entry === 'function' ? entry(outcome.detail ?? '') : entry
    }
  }
}
