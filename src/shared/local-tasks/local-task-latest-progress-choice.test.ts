import { describe, expect, it } from 'vitest'
import {
  chooseLocalTaskFamilyProgress,
  chooseLocalTaskOwnProgress
} from './local-task-latest-progress-choice'
import type { LocalTaskLatestProgress } from './local-task-types'

const writeback = (at: number, body = 'result'): LocalTaskLatestProgress => ({
  kind: 'progress',
  body,
  at,
  sessionLinkId: 's1'
})
const turnEnd = (at: number, roundStartedAt: number | null, sessionLinkId = 's1') => ({
  progress: {
    kind: 'turn-ended' as const,
    body: `last words at ${at}`,
    at,
    sessionLinkId
  },
  roundStartedAt
})

describe('a task’s own latest progress (REQ-022)', () => {
  it('keeps the writeback over the turn end that closes its own round', () => {
    expect(chooseLocalTaskOwnProgress(writeback(20), [turnEnd(30, 5)])).toMatchObject({
      kind: 'progress',
      at: 20
    })
  })

  it('gives way to a later round that ended without a writeback', () => {
    expect(chooseLocalTaskOwnProgress(writeback(20), [turnEnd(50, 30)])).toMatchObject({
      kind: 'turn-ended',
      at: 50
    })
  })

  it('shows the newest turn end once any later round outdates the writeback', () => {
    // Another session's round spanned the writeback; this session's next round did not.
    const chosen = chooseLocalTaskOwnProgress(writeback(20), [
      turnEnd(40, 25, 's1'),
      turnEnd(60, 10, 's2')
    ])
    expect(chosen).toMatchObject({ kind: 'turn-ended', at: 60, sessionLinkId: 's2' })
  })

  it('never lets a turn end of unknown round displace a writeback', () => {
    expect(chooseLocalTaskOwnProgress(writeback(20), [turnEnd(90, null)])).toMatchObject({
      kind: 'progress'
    })
  })

  it('uses the newest turn end with no writeback, and nothing with neither', () => {
    expect(chooseLocalTaskOwnProgress(null, [turnEnd(30, null), turnEnd(40, null)])).toMatchObject({
      at: 40
    })
    expect(chooseLocalTaskOwnProgress(null, [])).toBeNull()
  })

  it('counts no text as no progress, so a subtask’s update can show on every client', () => {
    const silent = turnEnd(90, 50)
    silent.progress.body = '  '
    expect(chooseLocalTaskOwnProgress(writeback(20), [silent])).toMatchObject({ at: 20 })
    expect(chooseLocalTaskOwnProgress(writeback(20, ''), [silent])).toBeNull()
  })
})

describe('a task family’s latest progress (REQ-012)', () => {
  const entry = (taskId: string, at: number) => ({ taskId, progress: writeback(at, taskId) })

  it('shows the parent’s own progress before a newer subtask update', () => {
    expect(chooseLocalTaskFamilyProgress(entry('parent', 10), [entry('child', 30)])?.taskId).toBe(
      'parent'
    )
  })

  it('without its own, shows the newest subtask update', () => {
    expect(
      chooseLocalTaskFamilyProgress(null, [entry('child', 30), entry('grandchild', 50)])?.taskId
    ).toBe('grandchild')
    expect(chooseLocalTaskFamilyProgress(null, [])).toBeNull()
  })
})
