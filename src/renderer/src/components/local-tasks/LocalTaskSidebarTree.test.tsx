// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const navigation = vi.hoisted(() => ({ openLocalTaskPage: vi.fn() }))
// Why: the real one also opens upstream's task page, whose provider warm-up has no host in tests.
vi.mock('@/local-tasks/local-task-navigation', () => ({
  openLocalTaskPage: navigation.openLocalTaskPage,
  openLocalTasksSettings: vi.fn()
}))

import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { localTaskPageStore } from '@/local-tasks/local-task-page-store'
import { localTaskSessionPanelStore } from '@/local-tasks/local-task-session-panel-store'
import { localTaskSidebarTreeStore } from '@/local-tasks/local-task-sidebar-tree'
import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import type { LocalTaskSessionLink } from '../../../../shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'
import { LocalTaskSidebarTree } from './LocalTaskSidebarTree'

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
    },
    {
      id: 'review',
      projectId: 'project-1',
      category: 'review',
      name: 'Review',
      color: 'green',
      position: 1
    }
  ],
  createdAt: 1,
  updatedAt: 1,
  revision: 1
}

function task(number: number, title: string, statusId: string): LocalTask {
  return {
    id: `task-${number}`,
    projectId: project.id,
    number,
    ref: `ORC-${number}`,
    title,
    description: '',
    criteria: [],
    statusId,
    priority: 0,
    labels: [],
    parentId: null,
    createdAt: number,
    updatedAt: number,
    revision: 1
  }
}

const reconnect = task(41, 'Reconnect blank terminal', 'doing')
const grouping = task(38, 'Group sidebar by task', 'doing')
const exportCsv = task(12, 'Export orders as CSV', 'review')

function session(id: string, taskId: string, hostId: string): LocalTaskSessionLink {
  return {
    id,
    taskId,
    hostId,
    worktreeId: 'repo::/feat',
    instanceId: null,
    surface: 'terminal',
    tabId: `tab-${id}`,
    paneKey: null,
    sessionId: null,
    providerSession: null,
    agent: 'claude',
    linkedVia: 'start',
    openedAt: 1
  }
}

const working = session('session-working', reconnect.id, 'local')
const asking = session('session-asking', grouping.id, 'local')

function renderTree(): void {
  render(
    <TooltipProvider>
      <LocalTaskSidebarTree />
    </TooltipProvider>
  )
}

function row(name: string): HTMLElement {
  return screen.getAllByRole('treeitem', { name })[0]
}

beforeEach(() => {
  navigation.openLocalTaskPage.mockClear()
  useAppStore.setState(useAppStore.getInitialState(), true)
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
  localTasksDomainStore.getState().openEndpoint('local')
  const library = localTasksDomainStore.getState().writer('local')
  library.setConnection('live')
  library.setHostState('ready', null)
  library.applyProjects([project])
  library.applyTasks([reconnect, grouping, exportCsv])
  library.applyLinks({ workspaces: [], sessions: [working, asking] })
  library.applyProgress({
    observedAt: 10,
    sessions: [
      {
        taskSessionId: working.id,
        state: 'working',
        lastMessage: 'Editing use-terminal-attach.ts',
        stateSince: 5,
        unread: false
      },
      {
        taskSessionId: asking.id,
        state: 'waiting',
        lastMessage: null,
        stateSince: 5,
        unread: false
      }
    ],
    items: [
      {
        key: 'asking@5',
        taskId: grouping.id,
        taskSessionId: asking.id,
        kind: 'question',
        agent: 'claude',
        lastMessage: 'Top or bottom?',
        since: 5,
        replyable: false
      }
    ]
  })
  localTaskPageStore.setState(localTaskPageStore.getInitialState())
  localTaskSidebarTreeStore.setState(localTaskSidebarTreeStore.getInitialState())
  localTaskSessionPanelStore.getState().close()
})
afterEach(cleanup)

it('groups by view, with what waits on you and why at the top', () => {
  renderTree()
  const needsYou = row('Needs you')
  expect(needsYou.textContent).toContain('2')
  expect(row('Group sidebar by task ORC-38').textContent).toContain(
    'Claude: Waiting for your answer'
  )
  expect(row('Export orders as CSV ORC-12').textContent).toContain('Ready for acceptance')
  // In Progress opens by default and lists both started tasks.
  expect(row('In Progress').getAttribute('aria-expanded')).toBe('true')
  expect(screen.getAllByRole('treeitem', { name: 'Reconnect blank terminal ORC-41' })).toHaveLength(
    1
  )
})

it('opens a session from the tree as the task overview plus its preview', () => {
  renderTree()
  const taskRow = row('Reconnect blank terminal ORC-41')
  fireEvent.keyDown(taskRow, { key: 'ArrowRight' })
  const sessionRow = row('Claude · Working')
  // Rows are siblings: the task's own text never carries its sessions'.
  expect(taskRow.textContent).not.toContain('Editing use-terminal-attach.ts')
  expect(sessionRow.textContent).toContain('Editing use-terminal-attach.ts')
  fireEvent.click(sessionRow)
  expect(navigation.openLocalTaskPage).toHaveBeenCalledWith({ taskId: reconnect.id })
  expect(localTaskSessionPanelStore.getState()).toMatchObject({
    mode: 'narrow',
    sessionLinkId: working.id,
    taskId: reconnect.id
  })
})

it('greys a session whose SSH host is out of contact and opens nothing', () => {
  localTasksDomainStore
    .getState()
    .writer('local')
    .applyLinks({ workspaces: [], sessions: [{ ...working, hostId: 'ssh:dbox' }, asking] })
  renderTree()
  fireEvent.keyDown(row('Reconnect blank terminal ORC-41'), { key: 'ArrowRight' })
  const sessionRow = screen
    .getAllByRole('treeitem')
    .find((candidate) => candidate.getAttribute('data-local-task-tree-node') === 'session')
  expect(sessionRow?.getAttribute('aria-disabled')).toBe('true')
  expect(sessionRow?.textContent).toContain('not connected')
  act(() => {
    sessionRow?.click()
  })
  expect(localTaskSessionPanelStore.getState().mode).toBe('closed')
})

it('selecting a view filters the page without opening a task', () => {
  localTaskPageStore.setState({ detailTaskId: reconnect.id })
  renderTree()
  fireEvent.click(within(row('Needs you')).getByText('Needs you'))
  expect(localTaskPageStore.getState()).toMatchObject({ view: 'needs-you', detailTaskId: null })
  expect(navigation.openLocalTaskPage).toHaveBeenCalledWith()
})
