// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { localTaskPageStore } from '@/local-tasks/local-task-page-store'
import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import { localTasksClient } from '@/local-tasks/local-tasks-runtime-client'
import { launchLocalTaskSession } from '@/local-tasks/local-task-session-launch'
import type * as SessionLaunch from '@/local-tasks/local-task-session-launch'
import { useAppStore } from '@/store'
import { makeWorktree } from '@/store/slices/worktrees-slice-test-fixtures'
import type { LocalTaskWorkspaceLink } from '../../../../shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'
import { LocalTaskCreateDialog } from './LocalTaskCreateDialog'
import { useLocalTaskListModel } from './use-local-task-list-model'

// Why: the agent launch is the host boundary; this suite checks what the dialog hands it.
vi.mock('@/local-tasks/local-task-session-launch', async (importOriginal) => ({
  ...(await importOriginal<typeof SessionLaunch>()),
  launchLocalTaskSession: vi.fn(() => true)
}))

const project: LocalTaskProject = {
  id: 'project-1',
  repos: ['orca-1'],
  name: 'Orca',
  prefix: 'ORC',
  aliases: [],
  defaultRepoId: 'orca-1',
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: true, prMergedCompletes: false },
  statuses: [
    {
      id: 'todo',
      projectId: 'project-1',
      category: 'unstarted',
      name: 'Todo',
      color: 'gray',
      position: 0
    }
  ],
  createdAt: 1,
  updatedAt: 1,
  revision: 1
}

function task(number: number, title: string, parentId: string | null = null): LocalTask {
  return {
    id: `task-${number}`,
    projectId: project.id,
    number,
    ref: `ORC-${number}`,
    title,
    description: '',
    criteria: [],
    statusId: 'todo',
    priority: 0,
    labels: [],
    parentId,
    createdAt: 1,
    updatedAt: 1,
    revision: 1
  }
}

const owner = task(41, 'Terminal goes blank after reconnect')
const taken = makeWorktree({
  id: 'repo-1::/feat-reconnect',
  repoId: 'repo-1',
  projectId: 'orca-1',
  displayName: 'feat-reconnect'
})
const free = makeWorktree({
  id: 'repo-1::/docs-typo',
  repoId: 'repo-1',
  projectId: 'orca-1',
  displayName: 'docs-typo'
})
const ownerLink: LocalTaskWorkspaceLink = {
  taskId: owner.id,
  hostId: 'local',
  kind: 'git-worktree',
  instanceId: null,
  worktreeId: taken.id,
  folderWorkspaceId: null,
  repoId: 'repo-1',
  branchSnapshot: null,
  nameSnapshot: null,
  hostLabelSnapshot: null,
  linkedVia: 'start',
  linkedAt: 1
}

function Harness(): React.JSX.Element {
  return <LocalTaskCreateDialog model={useLocalTaskListModel()} />
}

function openDialog(): void {
  act(() => localTaskPageStore.getState().openCreate({ projectId: project.id }))
  render(
    <TooltipProvider>
      <Harness />
    </TooltipProvider>
  )
  fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
    target: { value: 'Drag to reorder workspaces' }
  })
}

beforeEach(() => {
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
  localTasksDomainStore.getState().openEndpoint('local')
  const library = localTasksDomainStore.getState().writer('local')
  library.setConnection('live')
  library.setHostState('ready', null)
  library.applyProjects([project])
  library.applyTasks([owner])
  library.applyLinks({ workspaces: [ownerLink], sessions: [] })
  localTaskPageStore.setState(localTaskPageStore.getInitialState())
  useAppStore.setState({
    repos: [{ id: 'repo-1', path: '/orca', displayName: 'orca', badgeColor: '#000', addedAt: 0 }],
    worktreesByRepo: { 'repo-1': [taken, free] },
    detectedAgentIds: ['claude', 'codex']
  })
  vi.mocked(launchLocalTaskSession).mockClear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('starts a task in a workspace another task owns as that task’s subtask, staying on the task view', async () => {
  const created = task(42, 'Drag to reorder workspaces', owner.id)
  const createTask = vi
    .spyOn(localTasksClient, 'createTask')
    .mockResolvedValue({ ok: true, task: created })
  const linkWorkspace = vi.spyOn(localTasksClient, 'linkWorkspace')
  openDialog()
  expect(screen.getByRole('button', { name: /Create and start/ }).hasAttribute('disabled')).toBe(
    true
  )
  expect(screen.getByText('Belongs to ORC-41 · becomes a subtask')).toBeTruthy()
  fireEvent.click(screen.getByRole('radio', { name: 'feat-reconnect' }))
  expect(screen.getByText('Opens a session in feat-reconnect')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Create and start/ }))

  await waitFor(() => expect(launchLocalTaskSession).toHaveBeenCalledOnce())
  expect(createTask.mock.calls[0]?.[0]).toMatchObject({
    projectId: project.id,
    title: 'Drag to reorder workspaces',
    parentId: owner.id
  })
  // It works in its owner's workspace, so that workspace keeps its single link.
  expect(linkWorkspace).not.toHaveBeenCalled()
  const launch = vi.mocked(launchLocalTaskSession).mock.calls[0]?.[0]
  expect(launch).toMatchObject({
    task: created,
    link: ownerLink,
    agent: 'claude',
    promptDelivery: 'auto-submit',
    reveal: false
  })
  expect(launch?.prompt?.startsWith('Start from the task description\n\nTask ORC-42:')).toBe(true)
  expect(localTaskPageStore.getState()).toMatchObject({
    detailTaskId: created.id,
    create: { open: false }
  })
})

it('keeps the task and stays on it when the picked workspace can’t be linked', async () => {
  const created = task(42, 'Drag to reorder workspaces')
  vi.spyOn(localTasksClient, 'createTask').mockResolvedValue({ ok: true, task: created })
  const linkWorkspace = vi
    .spyOn(localTasksClient, 'linkWorkspace')
    .mockResolvedValue({ ok: false, code: 'workspace_already_linked', detail: 'ORC-9' })
  openDialog()
  fireEvent.click(screen.getByRole('radio', { name: 'docs-typo' }))
  fireEvent.click(screen.getByRole('button', { name: /Create and start/ }))

  await waitFor(() => expect(linkWorkspace).toHaveBeenCalledOnce())
  expect(linkWorkspace.mock.calls[0]?.[0]).toMatchObject({
    taskId: created.id,
    worktreeId: free.id
  })
  expect(launchLocalTaskSession).not.toHaveBeenCalled()
  expect(localTaskPageStore.getState().detailTaskId).toBe(created.id)
})

it('keeps Create another for a task whose workspace is decided later', async () => {
  const createTask = vi
    .spyOn(localTasksClient, 'createTask')
    .mockResolvedValue({ ok: true, task: task(42, 'Drag to reorder workspaces') })
  openDialog()
  fireEvent.click(screen.getByRole('radio', { name: /Decide later/ }))
  fireEvent.click(screen.getByRole('switch'))
  fireEvent.click(screen.getByRole('button', { name: /^Create/ }))

  await waitFor(() => expect(createTask).toHaveBeenCalledOnce())
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveProperty('value', '')
  )
  expect(localTaskPageStore.getState().create.open).toBe(true)
  expect(launchLocalTaskSession).not.toHaveBeenCalled()
})
