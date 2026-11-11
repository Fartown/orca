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

import userEvent from '@testing-library/user-event'
import { useAppStore } from '@/store'
import { localTaskProposalsStore } from '@/local-tasks/local-task-dispatcher-proposals'
import type { LocalTaskProposalNames } from '@/local-tasks/local-task-proposal-copy'
import {
  localTaskProposalEditsStore,
  withLocalTaskProposalEdits
} from '@/local-tasks/local-task-proposal-edits'
import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import type { LocalTaskProposal } from '../../../../shared/local-tasks/local-task-dispatcher-types'
import type { LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'
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
  localTaskProposalEditsStore.setState(localTaskProposalEditsStore.getInitialState(), true)
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
  useAppStore.setState({ repos: [], projectHostSetups: [] })
  decide.mockClear()
  run.mockClear()
  finish.mockClear()
})

describe('LocalTaskProposalCard', () => {
  it('confirms only the steps the person kept', () => {
    const record = {
      kind: 'record' as const,
      title: 'Track the hotfix',
      target: { worktreeId: 'repo1::/hotfix' }
    }
    const items = [proposal({}).items[0], record]
    render(<LocalTaskProposalCard proposal={proposal({ items })} names={names} now={0} />)

    expect(screen.getByText('New task “CSV export” in repo1::/w')).toBeTruthy()
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Record the work in repo1::/hotfix as task “Track the hotfix”'
      })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 1' }))

    expect(decide).toHaveBeenCalledWith('p-1', 'confirmed', [0])
  })

  it('locks a stop whose session this window cannot find, and leaves it out', () => {
    render(<LocalTaskProposalCard proposal={proposal({})} names={names} now={0} />)

    const stop = screen.getByRole('checkbox', { name: 'Stop the session on t-9' })
    expect(stop).toHaveProperty('disabled', true)
    expect(screen.getByText('This session can’t be found here.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 1' }))

    expect(decide).toHaveBeenCalledWith('p-1', 'confirmed', [0])
  })

  it('holds a start back until the person picks one of the projects sharing its repository', async () => {
    const taskProject = (id: string, prefix: string): LocalTaskProject => ({
      id,
      name: id,
      prefix,
      aliases: [],
      repos: ['orca-shop'],
      defaultRepoId: 'orca-shop',
      lastExecutionHostId: null,
      rules: { startMovesToInProgress: true, prMergedCompletes: true },
      statuses: [],
      createdAt: 0,
      updatedAt: 0,
      revision: 1
    })
    useAppStore.setState({
      repos: [
        {
          id: 'shop',
          path: '/shop',
          displayName: 'shop',
          badgeColor: 'gray',
          addedAt: 0,
          executionHostId: 'local'
        }
      ],
      projectHostSetups: [
        {
          id: 'setup-shop',
          projectId: 'orca-shop',
          hostId: 'local',
          repoId: 'shop',
          path: '/shop',
          displayName: 'shop',
          kind: 'git',
          setupState: 'ready',
          setupMethod: 'legacy-repo',
          createdAt: 0,
          updatedAt: 0
        }
      ]
    })
    localTasksDomainStore.setState({
      projects: [taskProject('Shop', 'SHOP'), taskProject('Shop ops', 'OPS')]
    })
    const shared = proposal({
      items: [{ kind: 'start', title: 'CSV export', prompt: 'Add CSV', target: { repoId: 'shop' } }]
    })
    render(<LocalTaskProposalCard proposal={shared} names={names} now={0} />)

    const item = screen.getByRole('checkbox', { name: /CSV export/ })
    expect(item.hasAttribute('disabled')).toBe(true)
    expect(
      screen.getByText('This repository belongs to several projects. Pick one first.')
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Confirm 0' }).hasAttribute('disabled')).toBe(true)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Pick a project' }))
    await user.click(await screen.findByRole('menuitemradio', { name: /Shop ops/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm 1' }))

    expect(decide).toHaveBeenCalledWith('p-1', 'confirmed', undefined)
    expect(withLocalTaskProposalEdits(shared).items[0]).toMatchObject({ project: 'OPS' })
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
  expect(screen.getByText('The execution window is still open')).toBeTruthy()
  const finishButton = screen.getByRole('button', { name: 'Mark as finished' })
  expect(finishButton).toHaveProperty('disabled', true)
  fireEvent.click(finishButton)
  expect(finish).not.toHaveBeenCalled()
})

it('marks the step in flight when the window left as unknown, never as not run', () => {
  render(
    <LocalTaskProposalCard
      proposal={proposal({
        status: 'executing',
        executionActive: false,
        results: [{ index: 0, ok: true, taskId: 't-1', detail: 'started' }],
        items: [
          ...proposal({}).items,
          { kind: 'stop', taskId: 't-8', reason: 'Not needed any more' }
        ]
      })}
      names={names}
      now={0}
    />
  )

  expect(screen.getByText('Done')).toBeTruthy()
  expect(screen.getByText('Result unknown')).toBeTruthy()
  expect(screen.getByText('Not run')).toBeTruthy()
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
