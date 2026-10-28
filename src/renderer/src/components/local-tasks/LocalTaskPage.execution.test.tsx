// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { localTaskPageStore } from '@/local-tasks/local-task-page-store'
import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import { localTaskLinkDialogStore } from '@/local-tasks/local-task-link-dialog-store'
import type { LocalTask, LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'
import { LocalTaskPage } from './LocalTaskPage'

const project: LocalTaskProject = {
  id: 'project-1',
  repos: ['orca-1'],
  name: 'Project',
  prefix: 'ONE',
  aliases: [],
  defaultRepoId: null,
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: true, prMergedCompletes: true },
  statuses: [
    {
      id: 'status-1',
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
const task: LocalTask = {
  id: 'task-1',
  projectId: project.id,
  number: 1,
  ref: 'ONE-1',
  title: 'Task',
  description: '',
  criteria: [],
  statusId: 'status-1',
  priority: 0,
  labels: [],
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  revision: 1
}

beforeEach(() => {
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
  localTasksDomainStore.getState().openEndpoint('local')
  const library = localTasksDomainStore.getState().writer('local')
  library.setConnection('live')
  library.setHostState('ready', null)
  library.applyProjects([project])
  library.applyTasks([task])
  library.applyLinks({ workspaces: [], sessions: [] })
  localTaskPageStore.setState({ ...localTaskPageStore.getInitialState(), detailTaskId: task.id })
  localTaskLinkDialogStore.getState().close()
})
afterEach(cleanup)

it('renders Start, workspace linking and sessions in the actual task detail page', () => {
  render(
    <TooltipProvider>
      <LocalTaskPage sourceBar={null} />
    </TooltipProvider>
  )
  expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Use existing workspace' })).toBeTruthy()
  expect(screen.getByText('Sessions')).toBeTruthy()
})

it('renders the real workspace picker when the detail action opens its dialog', () => {
  render(
    <TooltipProvider>
      <LocalTaskPage sourceBar={null} />
    </TooltipProvider>
  )
  act(() => localTaskLinkDialogStore.getState().open({ kind: 'pick-workspace', taskId: task.id }))
  expect(screen.getByRole('dialog', { name: 'Use an existing workspace for ONE-1' })).toBeTruthy()
})

it('renders the real session dialog when Open session selects a linked task', () => {
  localTasksDomainStore
    .getState()
    .writer('local')
    .applyLinks({
      workspaces: [
        {
          taskId: task.id,
          hostId: 'local',
          kind: 'git-worktree',
          instanceId: null,
          worktreeId: 'repo-1/worktree-1',
          folderWorkspaceId: null,
          repoId: 'repo-1',
          branchSnapshot: null,
          nameSnapshot: 'Workspace',
          hostLabelSnapshot: null,
          linkedVia: 'manual',
          linkedAt: 1
        }
      ],
      sessions: []
    })
  render(
    <TooltipProvider>
      <LocalTaskPage sourceBar={null} />
    </TooltipProvider>
  )
  act(() => localTaskLinkDialogStore.getState().open({ kind: 'session', taskId: task.id }))
  expect(screen.getByRole('dialog', { name: 'Open session · ONE-1' })).toBeTruthy()
})

function child(number: number, parentId: string): LocalTask {
  return { ...task, id: `task-${number}`, number, ref: `ONE-${number}`, parentId }
}

it('shows a deep subtask working in its root’s workspace, with its path and its own Start', () => {
  const library = localTasksDomainStore.getState().writer('local')
  library.applyTasks([task, child(2, task.id), child(3, 'task-2')])
  library.applyLinks({
    workspaces: [
      {
        taskId: task.id,
        hostId: 'local',
        kind: 'git-worktree',
        instanceId: null,
        worktreeId: 'repo-1/worktree-1',
        folderWorkspaceId: null,
        repoId: 'repo-1',
        branchSnapshot: null,
        nameSnapshot: 'Workspace',
        hostLabelSnapshot: null,
        linkedVia: 'manual',
        linkedAt: 1
      }
    ],
    sessions: []
  })
  localTaskPageStore.setState({ detailTaskId: 'task-3' })
  render(
    <TooltipProvider>
      <LocalTaskPage sourceBar={null} />
    </TooltipProvider>
  )
  expect(screen.getByRole('button', { name: 'ONE-1' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'ONE-2' })).toBeTruthy()
  expect(screen.getByText('Uses the workspace of ONE-1')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Start separately' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Use existing workspace' })).toBeTruthy()
})

it('counts every level below a task in its delete confirmation', () => {
  localTasksDomainStore
    .getState()
    .writer('local')
    .applyTasks([task, child(2, task.id), child(3, 'task-2'), child(4, 'task-3')])
  render(
    <TooltipProvider>
      <LocalTaskPage sourceBar={null} />
    </TooltipProvider>
  )
  const actions = screen.getByRole('button', { name: 'Task actions' })
  fireEvent.pointerDown(actions, { button: 0, ctrlKey: false })
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete task…' }))
  expect(screen.getByRole('dialog', { name: 'Delete ONE-1?' }).textContent).toContain('(3)')
})
