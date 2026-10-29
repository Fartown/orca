// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { addAppKeyListener, removeAppKeyListener } from '@/lib/app-keyboard-router'
import { installLocalTaskPageKeyRouter } from '@/local-tasks/local-task-page-keys'
import { localTaskPageStore } from '@/local-tasks/local-task-page-store'
import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import { localTaskLinkDialogStore } from '@/local-tasks/local-task-link-dialog-store'
import { useAppStore } from '@/store'
import { makeWorktree } from '@/store/slices/worktrees-slice-test-fixtures'
import type { LocalTask, LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'
import { LocalTaskPage } from './LocalTaskPage'
import { LocalTaskSessionChip } from './LocalTaskSessionChip'
import { LocalTaskSidebarGroupByToggle } from './LocalTaskSidebarGroupByToggle'

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

const linkedWorkspace = {
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
} as const

it.each([
  ['pick-workspace', 'Use an existing workspace for ONE-1'],
  ['session', 'Open session · ONE-1']
] as const)('closes only the %s dialog on Esc, keeping the detail and the page', (kind, name) => {
  localTasksDomainStore
    .getState()
    .writer('local')
    .applyLinks({ workspaces: [linkedWorkspace], sessions: [] })
  // Stands in for the upstream task page's Esc owner, which would close the whole page.
  const upstreamEscape = vi.fn()
  const onUpstreamKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      upstreamEscape()
    }
  }
  const uninstall = installLocalTaskPageKeyRouter()
  addAppKeyListener('keydown', onUpstreamKey)
  try {
    render(
      <TooltipProvider>
        <LocalTaskPage sourceBar={null} />
      </TooltipProvider>
    )
    act(() => localTaskLinkDialogStore.getState().open({ kind, taskId: task.id }))
    fireEvent.keyDown(screen.getByRole('dialog', { name }), { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name })).toBeNull()
    expect(localTaskPageStore.getState().detailTaskId).toBe(task.id)
    expect(upstreamEscape).not.toHaveBeenCalled()
  } finally {
    removeAppKeyListener('keydown', onUpstreamKey)
    uninstall()
  }
})

it('renders the real session dialog when Open session selects a linked task', () => {
  localTasksDomainStore
    .getState()
    .writer('local')
    .applyLinks({ workspaces: [linkedWorkspace], sessions: [] })
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
  library.applyLinks({ workspaces: [linkedWorkspace], sessions: [] })
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

it.each([
  ['ready', false],
  ['read-only', true]
] as const)(
  'greys a Needs you row’s actions unless its library takes writes (%s)',
  (state, off) => {
    const library = localTasksDomainStore.getState().writer('local')
    library.setHostState(state, null)
    library.applyLinks({
      workspaces: [linkedWorkspace],
      sessions: [
        {
          id: 'session-1',
          taskId: task.id,
          hostId: 'local',
          worktreeId: linkedWorkspace.worktreeId,
          instanceId: null,
          surface: 'terminal',
          tabId: 'tab-1',
          paneKey: null,
          sessionId: null,
          providerSession: null,
          agent: 'claude',
          linkedVia: 'start',
          openedAt: 1
        }
      ]
    })
    library.applyProgress({
      observedAt: 1,
      sessions: [],
      items: [
        {
          key: 'tab-1@5',
          taskId: task.id,
          taskSessionId: 'session-1',
          kind: 'unread-done',
          agent: 'claude',
          lastMessage: null,
          since: 5,
          replyable: false
        }
      ]
    })
    localTaskPageStore.setState({ detailTaskId: null, view: 'needs-you' })
    render(
      <TooltipProvider>
        <LocalTaskPage sourceBar={null} />
      </TooltipProvider>
    )
    expect(screen.getByRole('button', { name: /Mark as seen/ })).toHaveProperty('disabled', off)
    expect(screen.getByRole('button', { name: /Snooze/ })).toHaveProperty('disabled', off)
  }
)

it('scrolls the list to a cursor the keyboard moved, never to a row under the pointer', () => {
  localTasksDomainStore
    .getState()
    .writer('local')
    .applyTasks([task, { ...task, id: 'task-2', number: 2, ref: 'ONE-2', title: 'Second' }])
  localTaskPageStore.setState({ detailTaskId: null, cursorTaskId: null })
  const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {})
  try {
    render(
      <TooltipProvider>
        <LocalTaskPage sourceBar={null} />
      </TooltipProvider>
    )
    const [first] = document.querySelectorAll('[data-local-task-row]')
    if (!first) {
      throw new Error('Expected list rows')
    }
    fireEvent.mouseMove(first)
    expect(localTaskPageStore.getState().cursorTaskId).not.toBeNull()
    expect(scroll).not.toHaveBeenCalled()
    act(() => localTaskPageStore.getState().setCursor('task-2'))
    expect(scroll).toHaveBeenCalledOnce()
  } finally {
    scroll.mockRestore()
  }
})

it('finds a session’s workspace link the way the sidebar card does, by instance first', () => {
  const renamed = 'repo-1::/repo-1/renamed'
  const previous = useAppStore.getState()
  useAppStore.setState({
    repos: [{ id: 'repo-1', path: '/repo-1', displayName: 'Repo', badgeColor: '#000', addedAt: 0 }],
    worktreesByRepo: {
      'repo-1': [makeWorktree({ id: renamed, repoId: 'repo-1', instanceId: 'instance-1' })]
    }
  })
  try {
    localTasksDomainStore
      .getState()
      .writer('local')
      .applyLinks({ workspaces: [{ ...linkedWorkspace, instanceId: 'instance-1' }], sessions: [] })
    render(<LocalTaskSessionChip pane={{ worktreeId: renamed, paneKey: 'tab-9:leaf-9' }} />)
    expect(screen.getByRole('button', { name: 'Link to task…' })).toBeTruthy()
  } finally {
    useAppStore.setState({ repos: previous.repos, worktreesByRepo: previous.worktreesByRepo })
  }
})

it('puts the Task grouping inside the upstream toggle, styled like its other choices', () => {
  render(<LocalTaskSidebarGroupByToggle groupBy="none" setGroupBy={() => {}} />)
  const none = screen.getByRole('radio', { name: 'None' })
  const byTask = screen.getByRole('radio', { name: 'Task' })
  expect(byTask.className).toBe(none.className)
  expect(byTask.parentElement).toBe(none.parentElement)
})
