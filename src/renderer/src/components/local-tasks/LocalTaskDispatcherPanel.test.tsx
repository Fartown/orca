// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as Proposals from '@/local-tasks/local-task-dispatcher-proposals'

const decide = vi.hoisted(() => vi.fn(async () => undefined))
const run = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('@/store', async () => {
  const { createTestStore } = await import('@/store/slices/store-test-helpers')
  return { useAppStore: createTestStore() }
})
vi.mock('@/local-tasks/local-task-dispatcher-proposals', async (importOriginal) => {
  const actual = await importOriginal<typeof Proposals>()
  return { ...actual, decideLocalTaskProposal: decide, runLocalTaskProposal: run }
})

import { localTaskProposalsStore } from '@/local-tasks/local-task-dispatcher-proposals'
import type { LocalTaskProposal } from '../../../../shared/local-tasks/local-task-dispatcher-types'
import { LocalTaskDispatcherPanel } from './LocalTaskDispatcherPanel'

function proposal(overrides: Partial<LocalTaskProposal>): LocalTaskProposal {
  return {
    id: 'p-1',
    conversationId: 'c-1',
    summary: 'Ship the export',
    items: [
      {
        kind: 'start',
        title: 'CSV export',
        prompt: 'Add a CSV download to the orders page',
        target: { worktreeId: 'repo1::/w' }
      },
      { kind: 'stop', taskId: 't-9', sessionLinkId: 's-9', reason: 'Superseded by the export' }
    ],
    status: 'pending',
    keptItemIndexes: null,
    results: null,
    createdAt: 0,
    decidedAt: null,
    decidedSource: null,
    ...overrides
  }
}

afterEach(() => {
  cleanup()
  localTaskProposalsStore.setState({ pending: [], unrun: [], running: [] })
  decide.mockClear()
  run.mockClear()
})

describe('LocalTaskDispatcherPanel', () => {
  it('confirms only the steps the person kept', () => {
    localTaskProposalsStore.setState({ pending: [proposal({})] })
    render(<LocalTaskDispatcherPanel />)

    expect(screen.getByText('New task “CSV export” in repo1::/w')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Stop the session on t-9' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 1' }))

    expect(decide).toHaveBeenCalledWith('p-1', 'confirmed', [0])
  })

  it('offers to run a proposal confirmed elsewhere instead of deciding it again', () => {
    const confirmed = proposal({ status: 'confirmed', decidedSource: 'mobile' })
    localTaskProposalsStore.setState({ unrun: [confirmed] })
    render(<LocalTaskDispatcherPanel />)

    expect(screen.queryByRole('checkbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))

    expect(run).toHaveBeenCalledWith(confirmed)
    expect(decide).not.toHaveBeenCalled()
  })
})
