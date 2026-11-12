import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalTaskProposal } from '../../../shared/local-tasks/local-task-dispatcher-types'

const fixture = vi.hoisted(() => ({
  claim: vi.fn(),
  list: vi.fn(),
  execute: vi.fn(),
  recordResults: vi.fn(),
  release: vi.fn(),
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() }
}))

vi.mock('sonner', () => ({ toast: fixture.toast }))
vi.mock('./local-task-dispatcher-client', () => ({
  localTaskDispatcherClient: {
    claim: fixture.claim,
    list: fixture.list,
    recordResults: fixture.recordResults,
    release: fixture.release
  }
}))
vi.mock('./local-task-proposal-execution', () => ({ executeLocalTaskProposal: fixture.execute }))

import {
  finishInterruptedLocalTaskProposal,
  localTaskProposalsStore,
  runLocalTaskProposal
} from './local-task-dispatcher-proposals'
import {
  applyLocalTaskProposalItemDraft,
  localTaskProposalEditsStore,
  setLocalTaskProposalItemEdit
} from './local-task-proposal-edits'

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
    fixture.release.mockReset()
    for (const show of Object.values(fixture.toast)) {
      show.mockReset()
    }
    fixture.list.mockResolvedValue({ proposals: [] })
    localTaskProposalsStore.setState(localTaskProposalsStore.getInitialState(), true)
    localTaskProposalEditsStore.setState(localTaskProposalEditsStore.getInitialState(), true)
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

  it('runs the items as the person edited them, leaving the rest as proposed', async () => {
    const stored = {
      ...proposal,
      items: [
        { kind: 'append' as const, taskId: 't-1', text: 'Check the CSV' },
        { kind: 'stop' as const, taskId: 't-2', reason: 'Superseded' }
      ]
    }
    const claimed = { ...stored, status: 'executing' as const, executionActive: true }
    fixture.claim.mockResolvedValue({ ok: true, proposal: claimed })
    fixture.execute.mockResolvedValue([])
    const edited = applyLocalTaskProposalItemDraft(stored.items[0], { text: 'Check the XLSX too' })
    setLocalTaskProposalItemEdit(stored.id, 0, edited)

    await runLocalTaskProposal(stored)

    expect(fixture.execute).toHaveBeenCalledWith({
      ...claimed,
      items: [{ ...stored.items[0], text: 'Check the XLSX too' }, stored.items[1]]
    })
  })

  it('refuses an edit that would not be a valid item', () => {
    const item = { kind: 'stop' as const, taskId: 't-2', reason: 'Superseded' }
    expect(applyLocalTaskProposalItemDraft(item, { reason: '   ' })).toBeNull()
    expect(applyLocalTaskProposalItemDraft(item, { text: 'not a stop field' })).toEqual(item)
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

  it('tells a claim request that got no answer from a claim taken elsewhere', async () => {
    fixture.claim.mockRejectedValueOnce(new Error('host unreachable'))
    await runLocalTaskProposal(proposal)
    expect(fixture.toast.error).toHaveBeenCalledWith(
      'Couldn’t reach the task library, so nothing ran. Try again.'
    )
    expect(fixture.toast.info).not.toHaveBeenCalled()

    fixture.claim.mockResolvedValueOnce({ ok: false, code: 'stale', detail: 'executing' })
    await runLocalTaskProposal(proposal)
    expect(fixture.toast.info).toHaveBeenCalledWith('This proposal is already running or has run.')
    expect(fixture.execute).not.toHaveBeenCalled()
  })

  it('gives up a run whose result could not be recorded, so the person can finish it', async () => {
    fixture.claim.mockResolvedValue({
      ok: true,
      proposal: { ...proposal, status: 'executing', executionActive: true }
    })
    fixture.execute.mockResolvedValue(null)
    fixture.release.mockResolvedValue({ ok: true, proposal })
    fixture.recordResults.mockResolvedValue({ ok: true, proposal })

    await runLocalTaskProposal(proposal)
    expect(fixture.release).toHaveBeenCalledWith(proposal.id)
    expect(localTaskProposalsStore.getState()).toMatchObject({ running: [], abandoned: ['p-1'] })

    // The host may still list this window as running it; the person can finish it anyway.
    localTaskProposalsStore.setState({
      claimed: [{ ...proposal, status: 'executing', executionActive: true }]
    })
    await finishInterruptedLocalTaskProposal(proposal.id)
    expect(fixture.release).toHaveBeenCalledTimes(2)
    expect(fixture.recordResults).toHaveBeenCalledWith(proposal.id, [], true)
    expect(localTaskProposalsStore.getState().abandoned).toEqual([])
  })
})
