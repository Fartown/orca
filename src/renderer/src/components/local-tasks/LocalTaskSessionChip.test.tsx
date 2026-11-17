// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => {
  const calls: string[] = []
  return {
    calls,
    unlinkSession: vi.fn(async (id: string) => {
      calls.push(`unlink ${id}`)
      return { ok: true as const }
    }),
    recordSession: vi.fn(async (input: { taskId: string }) => {
      calls.push(`record ${input.taskId}`)
      return { ok: true as const, session: {} }
    })
  }
})
vi.mock('@/local-tasks/local-tasks-runtime-client', () => ({
  localTasksClient: {
    unlinkSession: client.unlinkSession,
    recordSession: client.recordSession,
    setPreference: vi.fn(async () => ({ ok: true as const }))
  }
}))

import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import type { LocalTask, LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'
import { LocalTaskSessionChip, findLocalTaskSessionForPane } from './LocalTaskSessionChip'
import { localTaskPageStore } from '@/local-tasks/local-task-page-store'
import { localTaskSessionPanelStore } from '@/local-tasks/local-task-session-panel-store'

const project: LocalTaskProject = {
  id: 'project-1',
  repos: [],
  name: 'Orca',
  prefix: 'ORC',
  aliases: [],
  defaultRepoId: null,
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: true, prMergedCompletes: true },
  statuses: [
    {
      id: 'doing',
      projectId: 'project-1',
      category: 'started',
      name: 'Doing',
      color: 'yellow',
      position: 0
    }
  ],
  createdAt: 1,
  updatedAt: 1,
  revision: 1
}
const owner: LocalTask = {
  id: 'task-41',
  projectId: project.id,
  number: 41,
  ref: 'ORC-41',
  title: 'Reconnect blank terminal',
  description: '',
  criteria: [],
  statusId: 'doing',
  priority: 2,
  labels: [],
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  revision: 1
}
const subtask: LocalTask = {
  ...owner,
  id: 'task-42',
  number: 42,
  ref: 'ORC-42',
  title: 'Find the 3 second delay',
  parentId: owner.id
}
const WORKTREE = 'repo-1::/feat-reconnect'
const PANE = 'tab-1:11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  client.calls.length = 0
  localTaskSessionPanelStore.getState().close()
  useAppStore.setState(useAppStore.getInitialState(), true)
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
  localTasksDomainStore.getState().openEndpoint('local')
  const library = localTasksDomainStore.getState().writer('local')
  library.setConnection('live')
  library.setHostState('ready', null)
  library.applyProjects([project])
  library.applyTasks([owner, subtask])
  library.applyLinks({
    workspaces: [
      {
        taskId: owner.id,
        hostId: 'local',
        kind: 'git-worktree',
        instanceId: null,
        worktreeId: WORKTREE,
        folderWorkspaceId: null,
        repoId: 'repo-1',
        branchSnapshot: 'feat-reconnect',
        nameSnapshot: 'feat-reconnect',
        hostLabelSnapshot: null,
        linkedVia: 'start',
        linkedAt: 1
      }
    ],
    sessions: [
      {
        id: 'session-1',
        taskId: owner.id,
        hostId: 'local',
        worktreeId: WORKTREE,
        instanceId: null,
        surface: 'terminal',
        tabId: 'tab-1',
        paneKey: PANE,
        sessionId: null,
        providerSession: null,
        agent: 'claude',
        linkedVia: 'start',
        openedAt: 1
      }
    ]
  })
})
afterEach(cleanup)

function pairedTaskLibrary(installationId: string | undefined): void {
  const domain = localTasksDomainStore.getState()
  domain.writer('local').applyLinks({ workspaces: [], sessions: [] })
  domain.writer('local').applyStatus({
    taskHost: true,
    state: 'ready',
    reason: null,
    revision: 1,
    taskHostId: 'self-library',
    installationId: '11111111-1111-4111-8111-111111111111'
  })
  domain.openEndpoint('runtime:mini')
  const remote = domain.writer('runtime:mini')
  remote.setConnection('live')
  remote.applyStatus({
    taskHost: true,
    state: 'ready',
    reason: null,
    revision: 1,
    taskHostId: 'mini-library',
    installationId
  })
  remote.applyProjects([{ ...project, id: 'runtime:mini/project-1' }])
  remote.applyTasks([{ ...owner, id: 'runtime:mini/task-41', projectId: 'runtime:mini/project-1' }])
  remote.applyLinks({ workspaces: [], sessions: [] })
}

it('links an existing local pane to a paired task without taking over its workspace', async () => {
  pairedTaskLibrary('22222222-2222-4222-8222-222222222222')
  render(
    <TooltipProvider>
      <LocalTaskSessionChip pane={{ worktreeId: WORKTREE, paneKey: PANE }} />
    </TooltipProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Link to task…' }))
  const choice = await screen.findByRole('button', { name: /ORC-41.*Reconnect blank terminal/ })
  expect(choice).toHaveProperty('disabled', false)
  fireEvent.click(choice)
  await waitFor(() =>
    expect(client.recordSession).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'runtime:mini/task-41',
        hostId: 'foreign:11111111-1111-4111-8111-111111111111/local',
        worktreeId: WORKTREE,
        tabId: 'tab-1',
        paneKey: PANE,
        executionOrigin: {
          installationId: '11111111-1111-4111-8111-111111111111',
          hostId: 'local',
          hostLabel: 'This machine'
        }
      })
    )
  )
  expect(client.calls).toEqual(['record runtime:mini/task-41'])
  expect(localTasksDomainStore.getState().links.workspaces).toEqual([])
})

it('keeps an older task library visible while refusing an unsupported cross-host link', async () => {
  pairedTaskLibrary(undefined)
  render(
    <TooltipProvider>
      <LocalTaskSessionChip pane={{ worktreeId: WORKTREE, paneKey: PANE }} />
    </TooltipProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Link to task…' }))
  const choice = await screen.findByRole('button', { name: /ORC-41.*Reconnect blank terminal/ })
  expect(choice).toHaveProperty('disabled', true)
  expect(choice.title).toMatch(/Update the task library/)
  expect(client.calls).toEqual([])
})

it('does not adopt a different execution host’s identically named pane', () => {
  const links = localTasksDomainStore.getState().links
  expect(
    findLocalTaskSessionForPane(links, {
      worktreeId: WORKTREE,
      paneKey: PANE,
      hostId: 'runtime:mini'
    })
  ).toBeNull()
})

it('relinks a session atomically, offering only the other tasks in its workspace', async () => {
  render(
    <TooltipProvider>
      <LocalTaskSessionChip pane={{ worktreeId: WORKTREE, paneKey: PANE }} />
    </TooltipProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Reconnect blank terminal · ORC-41' }))
  expect(await screen.findByText('ORC-41 · This session belongs to it')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Link to another task/ }))
  const choices = within(screen.getByRole('dialog'))
    .getAllByRole('button')
    .filter((button) => button.textContent?.includes('ORC-'))
  expect(choices.map((button) => button.textContent)).toEqual(['ORC-42Find the 3 second delay'])
  fireEvent.click(choices[0])
  await waitFor(() => expect(client.calls).toEqual(['record task-42']))
  expect(client.recordSession).toHaveBeenLastCalledWith(
    expect.objectContaining({
      taskId: subtask.id,
      replacingSessionLinkId: 'session-1'
    })
  )
})

it('keeps the existing link when a same-library replacement cannot be saved', async () => {
  client.recordSession.mockRejectedValueOnce(new Error('connection lost'))
  render(
    <TooltipProvider>
      <LocalTaskSessionChip pane={{ worktreeId: WORKTREE, paneKey: PANE }} />
    </TooltipProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Reconnect blank terminal · ORC-41' }))
  fireEvent.click(await screen.findByRole('button', { name: /Link to another task/ }))
  fireEvent.click(await screen.findByRole('button', { name: /ORC-42/ }))
  await waitFor(() =>
    expect(client.recordSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ replacingSessionLinkId: 'session-1' })
    )
  )
  expect(client.calls).toEqual([])
  expect(localTasksDomainStore.getState().links.sessions[0].id).toBe('session-1')
})

it('retains the new cross-library link if the old unlink commits but its response is lost', async () => {
  const previous = localTasksDomainStore.getState().links
  pairedTaskLibrary('22222222-2222-4222-8222-222222222222')
  localTasksDomainStore.getState().writer('local').applyLinks(previous)
  client.recordSession.mockImplementationOnce(async (input) => {
    client.calls.push(`record ${input.taskId}`)
    return { ok: true, session: { id: 'runtime:mini/new-session' } }
  })
  client.unlinkSession.mockImplementationOnce(async (id) => {
    client.calls.push(`unlink ${id}`)
    localTasksDomainStore
      .getState()
      .writer('local')
      .applyLinks({ ...previous, sessions: [] })
    throw new Error('response lost after commit')
  })
  render(
    <TooltipProvider>
      <LocalTaskSessionChip pane={{ worktreeId: WORKTREE, paneKey: PANE }} />
    </TooltipProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Reconnect blank terminal · ORC-41' }))
  fireEvent.click(await screen.findByRole('button', { name: /Link to another task/ }))
  const choice = screen
    .getAllByRole('button')
    .find((button) => button.textContent?.startsWith('ORC-41'))
  expect(choice).toBeDefined()
  fireEvent.click(choice!)
  await waitFor(() =>
    expect(client.calls).toEqual(['record runtime:mini/task-41', 'unlink session-1'])
  )
  expect(client.calls).not.toContain('unlink runtime:mini/new-session')
})

it('goes back from a full-size session to its task, with the session in the wide panel', () => {
  render(
    <TooltipProvider>
      <LocalTaskSessionChip pane={{ worktreeId: WORKTREE, paneKey: PANE }} />
    </TooltipProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Back to side' }))
  expect(localTaskPageStore.getState().detailTaskId).toBe(owner.id)
  expect(localTaskSessionPanelStore.getState()).toMatchObject({
    mode: 'wide',
    sessionLinkId: 'session-1'
  })
})

it('hides the duplicate task chip inside the task page session preview', () => {
  useAppStore.setState({ activeView: 'tasks' })
  const session = localTasksDomainStore.getState().links.sessions[0]
  localTaskSessionPanelStore.getState().open(session, 'wide')
  render(
    <TooltipProvider>
      <LocalTaskSessionChip pane={{ worktreeId: WORKTREE, paneKey: PANE }} />
    </TooltipProvider>
  )
  expect(screen.queryByRole('button', { name: 'Back to side' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Reconnect blank terminal · ORC-41' })).toBeNull()
})

it('keeps the task chip in the full session even while its preview state is open', () => {
  useAppStore.setState({ activeView: 'terminal' })
  const session = localTasksDomainStore.getState().links.sessions[0]
  localTaskSessionPanelStore.getState().open(session, 'wide')
  render(
    <TooltipProvider>
      <LocalTaskSessionChip pane={{ worktreeId: WORKTREE, paneKey: PANE }} />
    </TooltipProvider>
  )
  expect(screen.getByRole('button', { name: 'Reconnect blank terminal · ORC-41' })).toBeTruthy()
})
