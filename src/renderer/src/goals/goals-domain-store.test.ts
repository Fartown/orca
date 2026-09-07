import { beforeEach, describe, expect, it } from 'vitest'
import type { GoalSummary } from '../../../shared/goals/goal-control-contract'
import { goalDomainStore } from './goals-domain-store'

function summary(overrides: Partial<GoalSummary>): GoalSummary {
  return {
    goalId: 'g1',
    objectivePreview: 'ship it',
    workspace: { selector: 'wt', path: '/tmp/wt', executionHostId: 'local' },
    binding: { worktree: 'wt', terminal: 'term_1', expectedIncarnationId: 'inc' },
    runtimeFence: 0,
    specRevision: 1,
    runId: null,
    continuation: 'enabled',
    phase: 'executing',
    reason: null,
    completion: 'not_complete',
    stopSupport: 'request_only',
    driver: { status: 'live' },
    terminal: { status: 'live', ptyIds: ['p'] },
    agentStatus: 'working',
    turn: 'running',
    archived: false,
    turns: 2,
    activeMs: 1000,
    observedAt: 5,
    ...overrides
  }
}

beforeEach(() => {
  goalDomainStore.setState({
    status: 'idle',
    statusReason: null,
    summaries: [],
    listObservedAt: null,
    detailsById: {},
    pendingOperations: {},
    editor: { open: false, prefill: null }
  })
})

describe('goalDomainStore', () => {
  it('keeps list identity when a poll returns the same facts', () => {
    const first = [summary({})]
    goalDomainStore.getState().applyList(first, 10)
    goalDomainStore.getState().applyList([summary({ observedAt: 11 })], 11)
    expect(goalDomainStore.getState().summaries).toBe(first)
    expect(goalDomainStore.getState().listObservedAt).toBe(11)
    goalDomainStore.getState().applyList([summary({ phase: 'waiting_user' })], 12)
    expect(goalDomainStore.getState().summaries[0].phase).toBe('waiting_user')
  })

  it('tracks and settles pending operations by id', () => {
    goalDomainStore.getState().trackOperation({
      clientOperationId: 'op',
      goalId: 'g1',
      status: 'accepted',
      code: 'ok',
      message: '',
      runtimeFence: 1,
      runId: null,
      continuationPaused: null,
      turnStopped: null,
      acceptanceStopped: null
    })
    expect(Object.keys(goalDomainStore.getState().pendingOperations)).toEqual(['op'])
    goalDomainStore.getState().settleOperation('op')
    expect(goalDomainStore.getState().pendingOperations).toEqual({})
  })

  it('opens the editor with the pane it came from and clears it on close', () => {
    goalDomainStore.getState().openEditor({ worktreeId: 'wt', paneKey: 'tab:leaf' })
    expect(goalDomainStore.getState().editor).toEqual({
      open: true,
      prefill: { worktreeId: 'wt', paneKey: 'tab:leaf' }
    })
    goalDomainStore.getState().closeEditor()
    expect(goalDomainStore.getState().editor.open).toBe(false)
  })
})
