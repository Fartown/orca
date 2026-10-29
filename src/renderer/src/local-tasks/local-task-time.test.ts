import { describe, expect, it } from 'vitest'
import { formatUiRelativeTime } from '@/i18n/relative-time-format'
import { formatLocalTaskTime } from './local-task-time'

describe('formatLocalTaskTime', () => {
  const now = 1_800_000_000_000

  it('never shows a task time in the future when the clock tick lags a fresh write', () => {
    const ahead = formatLocalTaskTime(now + 45_000, now)
    expect(ahead).toBe(formatLocalTaskTime(now, now))
    expect(ahead).not.toBe(formatUiRelativeTime(45_000))
  })

  it('reads older times the way the rest of Orca does', () => {
    expect(formatLocalTaskTime(now - 5 * 60_000, now)).toBe(formatUiRelativeTime(-5 * 60_000))
    expect(formatLocalTaskTime(now - 3 * 86_400_000, now)).toBe(
      formatUiRelativeTime(-3 * 86_400_000)
    )
  })
})
