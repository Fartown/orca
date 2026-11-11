import { formatUiNarrowDuration } from '@/i18n/relative-time-format'
import type { LocalTaskSessionState } from '../../../shared/local-tasks/local-task-link-types'
import { formatLocalTaskTime } from './local-task-time'

const MINUTE = 60_000

/** How long a session has been working ("12m"), or when it reached any other state ("5m ago"). */
export function formatLocalTaskSessionAge(
  state: LocalTaskSessionState,
  since: number | null,
  now: number
): string | null {
  if (since === null) {
    return null
  }
  const elapsed = now - since
  if (state !== 'working' || elapsed < MINUTE) {
    return formatLocalTaskTime(since, now)
  }
  const minutes = Math.round(elapsed / MINUTE)
  if (minutes < 60) {
    return formatUiNarrowDuration(minutes, 'minute')
  }
  const hours = Math.round(minutes / 60)
  return hours < 24
    ? formatUiNarrowDuration(hours, 'hour')
    : formatUiNarrowDuration(Math.round(hours / 24), 'day')
}
