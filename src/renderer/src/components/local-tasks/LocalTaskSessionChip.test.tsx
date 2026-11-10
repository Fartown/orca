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
import { LocalTaskSessionChip } from './LocalTaskSessionChip'
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

it('relinks a session by unlinking it first, offering only the other tasks in its workspace', async () => {
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
  await waitFor(() => expect(client.calls).toEqual(['unlink session-1', 'record task-42']))
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

it('leaves out back to side while the task page panel already shows the session', () => {
  useAppStore.setState({ activeView: 'tasks' })
  const session = localTasksDomainStore.getState().links.sessions[0]
  localTaskSessionPanelStore.getState().open(session, 'wide')
  render(
    <TooltipProvider>
      <LocalTaskSessionChip pane={{ worktreeId: WORKTREE, paneKey: PANE }} />
    </TooltipProvider>
  )
  expect(screen.queryByRole('button', { name: 'Back to side' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Reconnect blank terminal · ORC-41' })).toBeTruthy()
})
