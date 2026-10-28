import { describe, expect, it } from 'vitest'
import { localTaskSnoozeUntil } from './local-task-snooze-presets'

describe('snooze presets in local time', () => {
  it('offers tonight only before evening starts', () => {
    const afternoon = new Date(2026, 9, 26, 15, 30)
    expect(localTaskSnoozeUntil('tonight', afternoon)).toBe(new Date(2026, 9, 26, 20, 0).getTime())
    expect(localTaskSnoozeUntil('tonight', new Date(2026, 9, 26, 20, 0))).toBeNull()
  })

  it('wakes tomorrow and next week in the morning', () => {
    const tuesday = new Date(2026, 9, 27, 22, 15)
    expect(localTaskSnoozeUntil('tomorrow', tuesday)).toBe(new Date(2026, 9, 28, 9, 0).getTime())
    expect(localTaskSnoozeUntil('next-week', tuesday)).toBe(new Date(2026, 10, 2, 9, 0).getTime())
  })

  it('treats next week on a Monday as the Monday after', () => {
    const monday = new Date(2026, 9, 26, 8, 0)
    expect(localTaskSnoozeUntil('next-week', monday)).toBe(new Date(2026, 10, 2, 9, 0).getTime())
  })
})
