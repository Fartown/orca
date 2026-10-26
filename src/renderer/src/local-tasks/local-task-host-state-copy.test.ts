import { describe, expect, it } from 'vitest'
import { describeLocalTasksUnavailableReason } from './local-task-host-state-copy'

describe('describeLocalTasksUnavailableReason', () => {
  it('explains a read-only database file instead of echoing SQLite', () => {
    const sentence = describeLocalTasksUnavailableReason('attempt to write a readonly database')
    expect(sentence).not.toContain('attempt to write')
    expect(sentence).toBe(describeLocalTasksUnavailableReason('EACCES: permission denied, open'))
  })

  it('keeps distinct causes apart and still says something without a reason', () => {
    const causes = [
      'database disk image is malformed',
      'SQLITE_FULL: database or disk is full',
      'database is locked',
      null
    ].map(describeLocalTasksUnavailableReason)
    expect(new Set(causes).size).toBe(causes.length)
  })
})
