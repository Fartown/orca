import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalTaskProposal } from '../../../shared/local-tasks/local-task-dispatcher-types'

const fixture = vi.hoisted(() => {
  const pane: { key: string | null } = { key: 'tab-d:leaf' }
  return { pane, watches: vi.fn(), inbox: vi.fn(), list: vi.fn() }
})

vi.mock('./local-task-dispatcher-client', () => ({
  localTaskDispatcherClient: {
    watches: fixture.watches,
    inbox: fixture.inbox,
    list: fixture.list
  }
}))
vi.mock('./local-task-dispatcher-session', () => ({
  knownDispatcherPaneKey: () => fixture.pane.key
}))

import {
  localTaskDispatcherLedgerStore,
  refreshLocalTaskDispatcherLedger
} from './local-task-dispatcher-ledger'

function executed(id: string, conversationId: string, decidedAt: number): LocalTaskProposal {
  return {
    id,
    conversationId,
    summary: id,
    items: [],
    status: 'executed',
    keptItemIndexes: null,
    results: [],
    createdAt: 0,
    decidedAt,
    decidedSource: 'desktop'
  }
}

describe('dispatcher ledger', () => {
  beforeEach(() => {
    fixture.pane.key = 'tab-d:leaf'
    fixture.watches.mockReset()
    fixture.watches.mockResolvedValue({
      ok: true,
      watches: [{ taskId: 't-1', addedAt: 5, addedBy: 'proposal' }]
    })
    fixture.inbox.mockResolvedValue({
      ok: true,
      inbox: {
        conversationId: 'c-1',
        items: [{ kind: 'progress', at: 9, taskId: 't-1', taskRef: 'SHOP-1', summary: 'done' }],
        cursor: 'x',
        more: false,
        watchedTaskCount: 1
      }
    })
    fixture.list.mockResolvedValue({
      proposals: [executed('old', 'c-1', 1), executed('other', 'c-2', 9), executed('new', 'c-1', 3)]
    })
  })

  it('shows what this dispatcher follows, has not handled, and dispatched, newest first', async () => {
    await refreshLocalTaskDispatcherLedger()
    const state = localTaskDispatcherLedgerStore.getState()

    expect(state.watches.map((watch) => watch.taskId)).toEqual(['t-1'])
    expect(state.unread.map((item) => item.summary)).toEqual(['done'])
    expect(state.dispatched.map((proposal) => proposal.id)).toEqual(['new', 'old'])
  })

  it('reads nothing before a dispatcher was ever opened', async () => {
    fixture.pane.key = null
    await refreshLocalTaskDispatcherLedger()

    expect(fixture.watches).not.toHaveBeenCalled()
    expect(localTaskDispatcherLedgerStore.getState()).toMatchObject({ loaded: true, watches: [] })
  })
})
