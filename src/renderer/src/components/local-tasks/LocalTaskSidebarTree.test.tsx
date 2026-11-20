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
import { getReachableRuntimeEnvironmentIds } from '@/hooks/ipc-events/runtime-events/runtime-environment-subscription-selection'
import {
  toClientLocalTask,
  toClientLocalTaskLinks,
  toClientLocalTaskProgress,
  toClientLocalTaskProject
} from '@/local-tasks/local-task-client-rows'
import { localTaskEnvironmentEndpoint } from '@/local-tasks/local-task-endpoints'
import {
  runtimeEnvironmentStatusFromSnapshot,
  type RuntimeHostStatusSnapshot
} from '../../../../shared/remote-runtime/host-status/runtime-host-status'
import { useAppStore } from '@/store'
import { makeWorktree } from '@/store/slices/worktrees/worktree.test-fixture'
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
    mode: 'wide',
    sessionLinkId: working.id,
    taskId: reconnect.id
  })
})

it('keeps a paired owner task and session reachable beside an offline SSH host with the same name and worktree id', () => {
  const environmentId = 'mini-env'
  const endpoint = localTaskEnvironmentEndpoint(environmentId)
  const pairedStatus = {
    runtimeId: 'mini-runtime',
    rendererGraphEpoch: 1,
    graphStatus: 'ready' as const,
    authoritativeWindowId: 1,
    liveTabCount: 1,
    liveLeafCount: 1
  }
  const remoteTask = toClientLocalTask(endpoint, reconnect)
  const remoteLinks = toClientLocalTaskLinks(endpoint, {
    workspaces: [
      {
        taskId: reconnect.id,
        hostId: 'local',
        kind: 'git-worktree',
        instanceId: null,
        worktreeId: 'repo::/feat',
        folderWorkspaceId: null,
        repoId: 'repo',
        branchSnapshot: 'feat',
        nameSnapshot: 'feat',
        hostLabelSnapshot: 'mini',
        linkedVia: 'start',
        linkedAt: 1
      }
    ],
    sessions: [working]
  })
  const remoteWorktree = makeWorktree({
    id: 'repo::/feat',
    repoId: 'repo',
    hostId: endpoint,
    displayName: 'Paired mini worktree'
  })
  const sshWorktree = makeWorktree({
    id: 'repo::/feat',
    repoId: 'repo',
    hostId: 'ssh:mini',
    displayName: 'Disconnected SSH worktree'
  })
  useAppStore.setState({
    runtimeEnvironments: [
      {
        id: environmentId,
        name: 'mini',
        createdAt: 1,
        updatedAt: 1,
        lastUsedAt: null,
        runtimeId: 'mini-runtime',
        endpoints: [
          { id: 'mini-endpoint', kind: 'websocket', label: 'mini', endpoint: 'ws://mini:1234' }
        ],
        preferredEndpointId: 'mini-endpoint'
      }
    ],
    runtimeStatusByEnvironmentId: new Map([
      [
        environmentId,
        {
          checkedAt: 1,
          status: pairedStatus
        }
      ]
    ]),
    sshConnectionStates: new Map([
      ['mini', { targetId: 'mini', status: 'disconnected', error: null, reconnectAttempt: 0 }]
    ]),
    sshTargetLabels: new Map([['mini', 'mini']]),
    worktreesByRepo: { repo: [sshWorktree, remoteWorktree] }
  })
  localTasksDomainStore.getState().closeEndpoint('local')
  localTasksDomainStore.getState().openEndpoint(endpoint)
  const library = localTasksDomainStore.getState().writer(endpoint)
  library.setConnection('live')
  library.setHostState('ready', null)
  library.applyProjects([toClientLocalTaskProject(endpoint, project)])
  library.applyTasks([remoteTask])
  library.applyLinks(remoteLinks)
  library.applyProgress(
    toClientLocalTaskProgress(endpoint, {
      observedAt: 10,
      sessions: [
        {
          taskSessionId: working.id,
          state: 'working',
          lastMessage: 'Editing paired mini worktree',
          stateSince: 5,
          unread: false
        }
      ],
      items: []
    })
  )

  expect(remoteLinks.workspaces[0].hostId).toBe(endpoint)
  expect(remoteLinks.sessions[0].hostId).toBe(endpoint)
  expect(getReachableRuntimeEnvironmentIds(useAppStore.getState())).toContain(environmentId)
  expect(useAppStore.getState().getKnownWorktreeById('repo::/feat', endpoint)).toBe(remoteWorktree)
  renderTree()
  const taskRow = row('Reconnect blank terminal ORC-41')
  expect(taskRow.textContent).not.toContain('not connected')
  fireEvent.keyDown(taskRow, { key: 'ArrowRight' })
  const sessionRow = row('Claude · Working')
  expect(sessionRow.getAttribute('aria-disabled')).not.toBe('true')
  expect(sessionRow.textContent).not.toContain('not connected')
  fireEvent.click(sessionRow)
  expect(navigation.openLocalTaskPage).toHaveBeenCalledWith({ taskId: remoteTask.id })
  expect(localTaskSessionPanelStore.getState()).toMatchObject({
    mode: 'wide',
    sessionLinkId: remoteLinks.sessions[0].id,
    taskId: remoteTask.id
  })

  act(() => library.setConnection('failed', 'RPC unavailable'))
  expect(getReachableRuntimeEnvironmentIds(useAppStore.getState())).toContain(environmentId)
  expect(row('Reconnect blank terminal ORC-41').textContent).not.toContain('not connected')
  expect(row('Claude · Working').getAttribute('aria-disabled')).not.toBe('true')

  const snapshot: RuntimeHostStatusSnapshot = {
    environmentId,
    pairingRevision: 1,
    sequence: 2,
    checkedAt: 2,
    status: pairedStatus,
    verification: 'unavailable',
    transport: 'disconnected'
  }
  act(() => {
    useAppStore.setState({
      runtimeStatusByEnvironmentId: new Map([
        [environmentId, runtimeEnvironmentStatusFromSnapshot(snapshot)]
      ])
    })
  })
  expect(getReachableRuntimeEnvironmentIds(useAppStore.getState())).not.toContain(environmentId)
  expect(row('Reconnect blank terminal ORC-41').textContent).toContain('mini is not connected')
  const unavailableSession = row('Claude · Can’t confirm')
  expect(unavailableSession.getAttribute('aria-disabled')).toBe('true')
  expect(unavailableSession.textContent).toContain('mini is not connected')

  act(() => {
    useAppStore.setState({
      runtimeStatusByEnvironmentId: new Map([
        [
          environmentId,
          runtimeEnvironmentStatusFromSnapshot({
            ...snapshot,
            sequence: 3,
            checkedAt: 3,
            verification: 'verified',
            transport: 'ready'
          })
        ]
      ])
    })
  })
  expect(getReachableRuntimeEnvironmentIds(useAppStore.getState())).toContain(environmentId)
  expect(row('Reconnect blank terminal ORC-41').textContent).not.toContain('not connected')
  expect(row('Claude · Working').getAttribute('aria-disabled')).not.toBe('true')
  expect(row('Claude · Working').textContent).not.toContain('not connected')
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
