// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as Proposals from '@/local-tasks/local-task-dispatcher-proposals'

const decide = vi.hoisted(() => vi.fn(async () => undefined))
const run = vi.hoisted(() => vi.fn(async () => undefined))
const finish = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('@/store', async () => {
  const { createTestStore } = await import('@/store/slices/store-test-helpers')
  return { useAppStore: createTestStore() }
})
vi.mock('@/local-tasks/local-task-dispatcher-proposals', async (importOriginal) => {
  const actual = await importOriginal<typeof Proposals>()
  return {
    ...actual,
    decideLocalTaskProposal: decide,
    runLocalTaskProposal: run,
    finishInterruptedLocalTaskProposal: finish
  }
})

import { localTaskProposalsStore } from '@/local-tasks/local-task-dispatcher-proposals'
import type { LocalTaskProposalNames } from '@/local-tasks/local-task-proposal-copy'
import type { LocalTaskProposal } from '../../../../shared/local-tasks/local-task-dispatcher-types'
import { LocalTaskProposalCard } from './LocalTaskProposalCard'

const names: LocalTaskProposalNames = {
  taskRef: (taskId) => taskId,
  workspace: (worktreeId) => worktreeId,
  repo: (repoId) => repoId
}

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
  localTaskProposalsStore.setState(localTaskProposalsStore.getInitialState(), true)
  decide.mockClear()
  run.mockClear()
  finish.mockClear()
})

describe('LocalTaskProposalCard', () => {
  it('confirms only the steps the person kept', () => {
    render(<LocalTaskProposalCard proposal={proposal({})} names={names} now={0} />)

    expect(screen.getByText('New task “CSV export” in repo1::/w')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Stop the session on t-9' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 1' }))

    expect(decide).toHaveBeenCalledWith('p-1', 'confirmed', [0])
  })

  it('offers to run a proposal confirmed elsewhere instead of deciding it again', () => {
    const confirmed = proposal({ status: 'confirmed', decidedSource: 'mobile' })
    render(<LocalTaskProposalCard proposal={confirmed} names={names} now={0} />)

    expect(screen.queryByRole('checkbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))

    expect(run).toHaveBeenCalledWith(confirmed)
    expect(decide).not.toHaveBeenCalled()
  })
})

it('shows an active execution in another window without offering manual finish', () => {
  render(
    <LocalTaskProposalCard
      proposal={proposal({ status: 'executing', executionActive: true })}
      names={names}
      now={0}
    />
  )

  expect(screen.getByText('Running…')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Mark as finished' })).toBeNull()
})

it('offers only finish after the execution connection retires, without a Run action', () => {
  render(
    <LocalTaskProposalCard
      proposal={proposal({ status: 'executing', executionActive: false })}
      names={names}
      now={0}
    />
  )

  fireEvent.click(screen.getByRole('button', { name: 'Mark as finished' }))

  expect(finish).toHaveBeenCalledWith('p-1')
  expect(screen.queryByRole('button', { name: 'Run' })).toBeNull()
  expect(screen.getByText(/Recorded results are kept/)).toBeTruthy()
})

it('does not interpret an unknown owner on an older host as a retired window', () => {
  render(
    <LocalTaskProposalCard proposal={proposal({ status: 'executing' })} names={names} now={0} />
  )

  expect(screen.getByText(/Execution cannot be verified/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Mark as finished' })).toBeNull()
})

it('keeps finish unavailable while this window runs despite a stale inactive snapshot', () => {
  localTaskProposalsStore.setState({ running: ['p-1'] })
  render(
    <LocalTaskProposalCard
      proposal={proposal({ status: 'executing', executionActive: false })}
      names={names}
      now={0}
    />
  )

  expect(screen.getByText('Running…')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Mark as finished' })).toBeNull()
})
