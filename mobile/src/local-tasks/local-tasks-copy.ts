import { LOCAL_TASKS_COPY_EN, type LocalTasksCopy } from './local-tasks-copy-en'

export type { LocalTasksCopy }

// Why English only: the rest of the phone app is inline English with no locale switch, so one
// page in the device language would read half translated (see continuation-copy.ts).
export function localTasksCopy(): LocalTasksCopy {
  return LOCAL_TASKS_COPY_EN
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
