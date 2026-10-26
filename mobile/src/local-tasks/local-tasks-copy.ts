import { LOCAL_TASKS_COPY_EN, type LocalTasksCopy } from './local-tasks-copy-en'
import { LOCAL_TASKS_COPY_ZH } from './local-tasks-copy-zh'

export type { LocalTasksCopy }

// Why per device locale: mobile has no i18n catalog yet, and this feature ships Chinese and English.
function deviceLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale
  } catch {
    return 'en'
  }
}

export function localTasksCopyFor(locale: string): LocalTasksCopy {
  return /^zh(?:[-_]|$)/i.test(locale) ? LOCAL_TASKS_COPY_ZH : LOCAL_TASKS_COPY_EN
}

let cached: LocalTasksCopy | null = null

export function localTasksCopy(): LocalTasksCopy {
  cached ??= localTasksCopyFor(deviceLocale())
  return cached
}

export function formatLocalTaskAgo(copy: LocalTasksCopy, at: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - at) / 60_000)
  if (minutes < 1) {
    return copy.justNow
  }
  if (minutes < 60) {
    return copy.minutesAgo(minutes)
  }
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? copy.hoursAgo(hours) : copy.daysAgo(Math.floor(hours / 24))
}
