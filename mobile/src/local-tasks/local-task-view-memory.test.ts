import { describe, expect, it, vi } from 'vitest'

vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }))
vi.mock('../storage/mirrored-storage-keys', () => ({ persistMirrored: vi.fn() }))

import { isPageStorageKey } from '../mobile-web-shell/page-storage-keys'
import {
  LOCAL_TASK_VIEW_STORAGE_KEY,
  readLocalTaskViewChoices,
  writeLocalTaskViewChoice,
  type LocalTaskViewChoice
} from './local-task-view-memory'

const board: LocalTaskViewChoice = { projectId: 'p1', segment: 'started', view: 'board' }

describe("the task page's remembered view", () => {
  it('keeps each library apart, and is a key the hybrid page may read and write', () => {
    const one = writeLocalTaskViewChoice(new Map(), 'host-a\u0000self', board)
    const both = writeLocalTaskViewChoice(readLocalTaskViewChoices(one), 'host-a\u0000runtime:vm', {
      projectId: null,
      segment: 'all',
      view: 'list'
    })
    const read = readLocalTaskViewChoices(both)
    expect(read.get('host-a\u0000self')).toEqual(board)
    expect(read.get('host-a\u0000runtime:vm')?.projectId).toBeNull()
    expect(isPageStorageKey(LOCAL_TASK_VIEW_STORAGE_KEY)).toBe(true)
  })

  it('drops what it cannot read, entry by entry, rather than the whole store', () => {
    const raw = JSON.stringify({ good: board, bad: { segment: 'someday' } })
    expect([...readLocalTaskViewChoices(raw).keys()]).toEqual(['good'])
    expect(readLocalTaskViewChoices('not json').size).toBe(0)
  })

  it('forgets the libraries left longest ago, so the value stays small', () => {
    let raw: string | null = null
    for (let at = 0; at < 30; at += 1) {
      raw = writeLocalTaskViewChoice(readLocalTaskViewChoices(raw), `library-${at}`, board)
    }
    const kept = readLocalTaskViewChoices(raw)
    expect(kept.size).toBe(24)
    expect(kept.has('library-0')).toBe(false)
    expect(kept.has('library-29')).toBe(true)
  })
})
