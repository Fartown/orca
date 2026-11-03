import { translate } from '../i18n/mobile-i18n'
import { LOCAL_TASKS_COPY_EN } from './local-tasks-copy-en'

export type LocalTasksCopy = typeof LOCAL_TASKS_COPY_EN & { title: string; description: string }

// Why mostly English: this copy predates the mobile catalog; entries move to translate() as
// they are localized.
export function localTasksCopy(): LocalTasksCopy {
  return {
    ...LOCAL_TASKS_COPY_EN,
    title: translate('localTasks.title', 'Tasks'),
    description: translate('localTasks.description', 'Description')
  }
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
