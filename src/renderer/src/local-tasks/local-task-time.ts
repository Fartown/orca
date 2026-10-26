import { translate } from '@/i18n/i18n'
import { formatUiRelativeTime } from '@/i18n/relative-time-format'

const JUST_NOW_MS = 60_000

/**
 * Relative time for a task-library timestamp. Those are always in the past, so a shared clock
 * tick that lags a fresh write (or skew between writers) reads as "just now", never as the future.
 */
export function formatLocalTaskTime(timestamp: number, now: number): string {
  const elapsed = now - timestamp
  if (elapsed < JUST_NOW_MS) {
    return translate('localTasks.time.justNow', 'just now')
  }
  return formatUiRelativeTime(-elapsed)
}
