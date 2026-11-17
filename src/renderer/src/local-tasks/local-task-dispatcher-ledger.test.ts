import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalTaskProposal } from '../../../shared/local-tasks/local-task-dispatcher-types'
import type { LocalTaskEndpointKey } from './local-task-endpoints'

const fixture = vi.hoisted(() => {
  const source: { endpoint: LocalTaskEndpointKey } = { endpoint: 'local' }
  const pane: { key: string | null } = { key: 'tab-d:leaf' }
  return {
    ...source,
    pane,
    watches: vi.fn(),
    inbox: vi.fn(),
    list: vi.fn(),
    epoch: 0
  }
})

vi.mock('./local-task-dispatcher-client', () => ({
  localTaskDispatcherClientFor: () => ({
    watches: fixture.watches,
    inbox: fixture.inbox,
    list: fixture.list
  }),
  localTaskDispatcherClient: {
    watches: fixture.watches,
    inbox: fixture.inbox,
    list: fixture.list
  }
}))
vi.mock('./local-task-dispatcher-source', () => ({
  getLocalTaskDispatcherEndpoint: () => fixture.endpoint,
  getLocalTaskDispatcherEpoch: () => fixture.epoch,
  isLocalTaskDispatcherSourceCurrent: (endpoint: string, epoch: number) =>
    endpoint === fixture.endpoint && epoch === fixture.epoch,
  subscribeLocalTaskDispatcherSource: () => () => {}
}))
vi.mock('./local-task-dispatcher-session', () => ({
  knownDispatcherPaneKey: () => fixture.pane.key
}))

import {
  localTaskDispatcherLedgerStore,
  refreshLocalTaskDispatcherLedger,
  resetLocalTaskDispatcherLedger
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
    resetLocalTaskDispatcherLedger()
    fixture.endpoint = 'local'
    fixture.epoch = 0
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

  it('discards an old source ledger response after switching hosts', async () => {
    let release: (value: { ok: true; watches: [] }) => void = () => {}
    fixture.watches.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve
      })
    )
    const reading = refreshLocalTaskDispatcherLedger()
    fixture.endpoint = 'runtime:mini'
    fixture.epoch += 1
    release({ ok: true, watches: [] })
    await reading
    expect(localTaskDispatcherLedgerStore.getState().dispatched).toEqual([])
    expect(localTaskDispatcherLedgerStore.getState().loaded).toBe(false)
  })
})
