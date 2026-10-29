/** Snooze choices offered on desktop and phone (REQ-015); custom times are picked by the user. */
export const LOCAL_TASK_SNOOZE_PRESETS = ['hour', 'tonight', 'tomorrow', 'next-week'] as const
export type LocalTaskSnoozePreset = (typeof LOCAL_TASK_SNOOZE_PRESETS)[number]

const TONIGHT_HOUR = 20
const MORNING_HOUR = 9
const HOUR_MS = 60 * 60 * 1000

function atLocalHour(base: Date, dayOffset: number, hour: number): Date {
  // Why setters: day arithmetic on the local calendar stays right across DST changes.
  const result = new Date(base)
  result.setDate(result.getDate() + dayOffset)
  result.setHours(hour, 0, 0, 0)
  return result
}

/**
 * When a preset ends, in the device's local time; null when it no longer applies today
 * (tonight, once evening has started).
 */
export function localTaskSnoozeUntil(preset: LocalTaskSnoozePreset, now: Date): number | null {
  switch (preset) {
    case 'hour':
      return now.getTime() + HOUR_MS
    case 'tonight': {
      const tonight = atLocalHour(now, 0, TONIGHT_HOUR)
      return tonight.getTime() > now.getTime() ? tonight.getTime() : null
    }
    case 'tomorrow':
      return atLocalHour(now, 1, MORNING_HOUR).getTime()
    case 'next-week': {
      // Monday morning; on a Monday that means the one a week away.
      const daysToMonday = (8 - now.getDay()) % 7 || 7
      return atLocalHour(now, daysToMonday, MORNING_HOUR).getTime()
    }
  }
}
