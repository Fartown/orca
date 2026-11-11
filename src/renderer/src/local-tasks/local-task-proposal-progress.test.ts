import { describe, expect, it } from 'vitest'
import type { LocalTaskProposal } from '../../../shared/local-tasks/local-task-dispatcher-types'
import { localTaskProposalProgress } from './local-task-proposal-progress'

const item = (title: string) => ({
  kind: 'record' as const,
  title,
  target: { worktreeId: `repo::/${title}` }
})

function proposal(overrides: Partial<LocalTaskProposal>): LocalTaskProposal {
  return {
    id: 'p-1',
    conversationId: 'c-1',
    summary: null,
    items: [item('a'), item('b'), item('c'), item('d')],
    status: 'executing',
    executionActive: true,
    keptItemIndexes: [0, 1, 2],
    results: [{ index: 0, ok: true, taskId: 't-a' }],
    createdAt: 0,
    decidedAt: 1,
    decidedSource: 'desktop',
    ...overrides
  }
}

const stages = (value: LocalTaskProposal, runningHere = false) =>
  localTaskProposalProgress(value, runningHere)?.items.map((entry) => entry.stage)

describe('localTaskProposalProgress', () => {
  it('names the first unreported item as running while the execution window is live', () => {
    expect(stages(proposal({}))).toEqual(['done', 'running', 'waiting', 'dropped'])
    expect(localTaskProposalProgress(proposal({}), false)).toMatchObject({ done: 1, total: 3 })
  })

  it('splits an interrupted run into the unknown item in flight and the ones never started', () => {
    expect(stages(proposal({ executionActive: false }))).toEqual([
      'done',
      'unknown',
      'skipped',
      'dropped'
    ])
  })

  it('keeps the item in flight running while this window runs it, even on a stale snapshot', () => {
    expect(stages(proposal({ executionActive: false }), true)).toEqual([
      'done',
      'running',
      'waiting',
      'dropped'
    ])
  })

  it('does not guess when an older host cannot say whether the window is live', () => {
    expect(stages(proposal({ executionActive: undefined }))).toEqual([
      'done',
      'unverifiable',
      'unverifiable',
      'dropped'
    ])
  })

  it('follows the order the items ran in, not their position', () => {
    const outOfOrder = proposal({
      executionActive: false,
      keptItemIndexes: [2, 0, 1],
      results: [{ index: 2, ok: false, detail: 'no project' }]
    })
    expect(stages(outOfOrder)).toEqual(['unknown', 'skipped', 'failed', 'dropped'])
  })

  it('shows the gap a run that was closed out early left', () => {
    expect(stages(proposal({ status: 'executed', executionActive: undefined }))).toEqual([
      'done',
      'unknown',
      'skipped',
      'dropped'
    ])
  })

  it('has nothing to say before a decision or after a dismissal', () => {
    expect(localTaskProposalProgress(proposal({ status: 'pending' }), false)).toBeNull()
    expect(localTaskProposalProgress(proposal({ status: 'dismissed' }), false)).toBeNull()
  })
})
