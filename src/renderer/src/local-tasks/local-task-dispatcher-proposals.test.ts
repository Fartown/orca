import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalTaskProposal } from '../../../shared/local-tasks/local-task-dispatcher-types'

const fixture = vi.hoisted(() => ({
  claim: vi.fn(),
  list: vi.fn(),
  execute: vi.fn(),
  recordResults: vi.fn()
}))

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() }
}))
vi.mock('./local-task-dispatcher-client', () => ({
  localTaskDispatcherClient: {
    claim: fixture.claim,
    list: fixture.list,
    recordResults: fixture.recordResults
  }
}))
vi.mock('./local-task-proposal-execution', () => ({ executeLocalTaskProposal: fixture.execute }))

import {
  finishInterruptedLocalTaskProposal,
  localTaskProposalsStore,
  runLocalTaskProposal
} from './local-task-dispatcher-proposals'

const proposal: LocalTaskProposal = {
  id: 'p-1',
  conversationId: 'c-1',
  summary: 'Ship',
  items: [],
  status: 'confirmed',
  keptItemIndexes: null,
  results: null,
  createdAt: 0,
  decidedAt: 1,
  decidedSource: 'mobile'
}

describe('running a confirmed proposal', () => {
  beforeEach(() => {
    fixture.claim.mockReset()
    fixture.execute.mockReset()
    fixture.recordResults.mockReset()
    fixture.list.mockResolvedValue({ proposals: [] })
    localTaskProposalsStore.setState(localTaskProposalsStore.getInitialState(), true)
  })

  it('runs nothing when another window already claimed it', async () => {
    fixture.claim.mockResolvedValue({ ok: false, code: 'stale', detail: 'executing' })

    await runLocalTaskProposal(proposal)

    expect(fixture.execute).not.toHaveBeenCalled()
  })

  it('runs the proposal as the claim returned it', async () => {
    const claimed = { ...proposal, status: 'executing' as const, executionActive: true }
    fixture.claim.mockResolvedValue({ ok: true, proposal: claimed })
    fixture.execute.mockResolvedValue([])

    await runLocalTaskProposal(proposal)

    expect(fixture.execute).toHaveBeenCalledWith(claimed)
  })

  it('does not run side effects when a host cannot report an execution owner', async () => {
    fixture.claim.mockResolvedValue({ ok: true, proposal: { ...proposal, status: 'executing' } })

    await runLocalTaskProposal(proposal)

    expect(fixture.execute).not.toHaveBeenCalled()
  })

  it.each([true, undefined])('refuses manual finish when executionActive is %s', async (active) => {
    localTaskProposalsStore.setState({
      claimed: [{ ...proposal, status: 'executing', executionActive: active }]
    })

    await finishInterruptedLocalTaskProposal(proposal.id)

    expect(fixture.recordResults).not.toHaveBeenCalled()
  })

  it('finishes a retired execution without replacing its recorded outcomes', async () => {
    localTaskProposalsStore.setState({
      claimed: [{ ...proposal, status: 'executing', executionActive: false }]
    })
    fixture.recordResults.mockResolvedValue({ ok: true, proposal })

    await finishInterruptedLocalTaskProposal(proposal.id)

    expect(fixture.recordResults).toHaveBeenCalledWith(proposal.id, [], true)
    expect(fixture.execute).not.toHaveBeenCalled()
  })
})
