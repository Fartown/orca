// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from 'vitest'
import type { sendMessageToAgent } from '@/lib/agent-session/messaging/agent-message-send'
import { useAppStore } from '@/store'
import { makeFolderWorkspace } from '@/store/folder-workspaces/folder-workspace.test-fixture'
import { makeWorktree } from '@/store/slices/worktrees/worktree.test-fixture'
import { TEST_REPO } from '@/store/repos/repo.test-fixture'
import type { LocalTaskSessionLink } from '../../../shared/local-tasks/local-task-link-types'
import type { ExecutionHostId } from '../../../shared/execution-host/execution-host'
import type { Tab } from '../../../shared/workspace-layout/tab-groups/tab-types'
import { localTasksDomainStore } from './local-tasks-domain-store'
import { sendLocalTaskReply } from './local-task-needs-you-actions'
import { crossHostLocalTaskSessionInput } from './local-task-cross-host-session-link'
import {
  findLocalTaskSessionChatTab,
  isLocalTaskSessionTerminalSurfaceCurrent
} from './local-task-session-execution-contact'

const send = vi.hoisted(() =>
  vi.fn(async (_input: Parameters<typeof sendMessageToAgent>[0]) => ({ status: 'sent' as const }))
)
vi.mock('@/lib/agent-session/messaging/agent-message-send', () => ({ sendMessageToAgent: send }))

const SELF = '11111111-1111-4111-8111-111111111111'
const SOURCE = '22222222-2222-4222-8222-222222222222'
const WORKTREE = 'repo1::/source'
const link: LocalTaskSessionLink = {
  id: 'library/session',
  taskId: 'library/task',
  hostId: 'runtime:mini',
  executionOrigin: { installationId: SOURCE, hostId: 'local', hostLabel: 'mini' },
  worktreeId: WORKTREE,
  instanceId: null,
  surface: 'terminal',
  tabId: 'web-terminal-source-tab',
  paneKey: 'web-terminal-source-tab:33333333-3333-4333-8333-333333333333',
  sessionId: null,
  providerSession: null,
  agent: 'codex',
  linkedVia: 'manual',
  openedAt: 1
}

beforeEach(() => {
  send.mockClear()
  useAppStore.setState(useAppStore.getInitialState(), true)
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState(), true)
  const domain = localTasksDomainStore.getState()
  domain.openEndpoint('local')
  domain.writer('local').applyStatus({
    taskHost: true,
    state: 'ready',
    reason: null,
    revision: 1,
    taskHostId: 'self-library',
    installationId: SELF
  })
  useAppStore.setState({
    runtimeStatusByEnvironmentId: new Map([
      [
        'mini',
        {
          checkedAt: 1,
          status: {
            runtimeId: 'source-runtime',
            rendererGraphEpoch: 1,
            graphStatus: 'ready',
            authoritativeWindowId: 1,
            liveTabCount: 1,
            liveLeafCount: 1,
            hostDescriptor: { installationId: SOURCE }
          }
        }
      ]
    ])
  })
})

function publishWorkspace(hostId: ExecutionHostId): void {
  useAppStore.setState({
    repos: [{ ...TEST_REPO, executionHostId: hostId }],
    worktreesByRepo: { repo1: [makeWorktree({ id: WORKTREE, repoId: 'repo1', hostId })] }
  })
}

it('refuses a remote source before the workspace catalog arrives instead of querying local terminals', async () => {
  expect(await sendLocalTaskReply(link, 'continue')).toMatchObject({ status: 'status-unavailable' })
  expect(send).not.toHaveBeenCalled()
  publishWorkspace('local')
  expect(await sendLocalTaskReply(link, 'continue')).toMatchObject({ status: 'status-unavailable' })
  expect(send).not.toHaveBeenCalled()
})

it('sends only while both the source identity and the upstream delivery route agree', async () => {
  publishWorkspace('runtime:mini')
  expect(await sendLocalTaskReply(link, 'continue')).toEqual({ status: 'sent' })
  expect(send).toHaveBeenCalledOnce()
  const guard = send.mock.calls[0][0].beforeTerminalSend
  expect(guard?.('paste')).toBe(true)
  publishWorkspace('local')
  expect(guard?.('submit')).toBe(false)
})

it('refuses a same-id structured session owned by another host', async () => {
  const chat: LocalTaskSessionLink = { ...link, surface: 'chat', sessionId: 'source-chat' }
  const tab: Tab = {
    id: 'chat-tab',
    entityId: 'source-chat',
    worktreeId: WORKTREE,
    groupId: 'group',
    executionHostId: 'local',
    contentType: 'agent-session' as const,
    label: 'Source',
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 0
  }
  useAppStore.setState({ unifiedTabsByWorktree: { [WORKTREE]: [tab] } })
  expect(findLocalTaskSessionChatTab(useAppStore.getState(), chat)).toBeNull()
  expect(await sendLocalTaskReply(chat, 'continue')).toMatchObject({ status: 'status-unavailable' })
  expect(send).not.toHaveBeenCalled()
  useAppStore.setState({
    unifiedTabsByWorktree: { [WORKTREE]: [{ ...tab, executionHostId: 'runtime:mini' }] }
  })
  expect(findLocalTaskSessionChatTab(useAppStore.getState(), chat)?.id).toBe(tab.id)
  expect(await sendLocalTaskReply(chat, 'continue')).toEqual({ status: 'sent' })
  useAppStore.setState({
    unifiedTabsByWorktree: {
      [WORKTREE]: [
        { ...tab, executionHostId: 'runtime:mini' },
        { ...tab, id: 'duplicate-tab', executionHostId: 'runtime:mini' }
      ]
    }
  })
  expect(findLocalTaskSessionChatTab(useAppStore.getState(), chat)).toBeNull()
})

it('mounts an external terminal only when its unique published tab belongs to the source host', () => {
  publishWorkspace('runtime:mini')
  const tab: Tab = {
    id: link.tabId!,
    entityId: link.tabId!,
    worktreeId: WORKTREE,
    groupId: 'group',
    executionHostId: 'local',
    contentType: 'terminal',
    label: 'Source',
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 0
  }
  useAppStore.setState({ unifiedTabsByWorktree: { [WORKTREE]: [tab] } })
  expect(isLocalTaskSessionTerminalSurfaceCurrent(useAppStore.getState(), link)).toBe(false)
  useAppStore.setState({
    unifiedTabsByWorktree: { [WORKTREE]: [{ ...tab, executionHostId: 'runtime:mini' }] }
  })
  expect(isLocalTaskSessionTerminalSurfaceCurrent(useAppStore.getState(), link)).toBe(true)
  useAppStore.setState({
    unifiedTabsByWorktree: { [WORKTREE]: [tab, { ...tab, executionHostId: 'runtime:mini' }] }
  })
  expect(isLocalTaskSessionTerminalSurfaceCurrent(useAppStore.getState(), link)).toBe(false)
})

it('does not mount a cached external chat when its source loses contact or identity', () => {
  const chat: LocalTaskSessionLink = { ...link, surface: 'chat', sessionId: 'source-chat' }
  const tab: Tab = {
    id: 'chat-tab',
    entityId: 'source-chat',
    worktreeId: WORKTREE,
    groupId: 'group',
    executionHostId: 'runtime:mini',
    contentType: 'agent-session',
    label: 'Source',
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 0
  }
  useAppStore.setState({ unifiedTabsByWorktree: { [WORKTREE]: [tab] } })
  expect(findLocalTaskSessionChatTab(useAppStore.getState(), chat)).toBe(tab)
  useAppStore.setState({ runtimeStatusByEnvironmentId: new Map() })
  expect(findLocalTaskSessionChatTab(useAppStore.getState(), chat)).toBeNull()
})

it('keeps the ordinary native send payload unchanged', async () => {
  const { executionOrigin: _origin, ...native } = link
  await sendLocalTaskReply({ ...native, hostId: 'local' }, 'continue')
  expect(send).toHaveBeenCalledWith({
    worktreeId: WORKTREE,
    target: { kind: 'terminal', tabId: link.tabId, leafId: '33333333-3333-4333-8333-333333333333' },
    prompt: 'continue'
  })
})

it('preserves the nested SSH owner of a paired folder workspace when linking it', () => {
  useAppStore.setState({
    folderWorkspaces: [
      makeFolderWorkspace({
        id: 'source-folder',
        executionHostId: 'runtime:mini',
        connectionId: 'builder'
      })
    ],
    sshStateByEnvironment: new Map([
      [
        'mini',
        {
          targetsHydrated: true,
          targetLabels: new Map(),
          removedTargetLabels: new Map(),
          targetGenerations: new Map(),
          connectionStates: new Map([
            [
              'builder',
              { targetId: 'builder', status: 'connected', error: null, reconnectAttempt: 0 }
            ]
          ])
        }
      ]
    ])
  })
  expect(
    crossHostLocalTaskSessionInput({
      taskId: 'local-task',
      hostId: 'runtime:mini',
      worktreeId: 'folder:source-folder',
      surface: 'terminal',
      tabId: link.tabId!,
      paneKey: link.paneKey!,
      linkedVia: 'manual'
    })
  ).toMatchObject({
    hostId: `foreign:${SOURCE}/ssh%3Abuilder`,
    tabId: 'source-tab',
    executionOrigin: { installationId: SOURCE, hostId: 'ssh:builder' }
  })
})

it('refuses to send to a different SSH location on the same source Orca', async () => {
  const nested: LocalTaskSessionLink = {
    ...link,
    executionOrigin: { installationId: SOURCE, hostId: 'ssh:builder', hostLabel: 'builder' }
  }
  publishWorkspace('runtime:mini')
  useAppStore.setState({
    sshStateByEnvironment: new Map([
      [
        'mini',
        {
          targetsHydrated: true,
          targetLabels: new Map(),
          removedTargetLabels: new Map(),
          targetGenerations: new Map(),
          connectionStates: new Map([
            [
              'builder',
              { targetId: 'builder', status: 'connected', error: null, reconnectAttempt: 0 }
            ]
          ])
        }
      ]
    ])
  })
  expect(await sendLocalTaskReply(nested, 'continue')).toMatchObject({
    status: 'status-unavailable'
  })
  expect(send).not.toHaveBeenCalled()
  useAppStore.setState({
    repos: [{ ...TEST_REPO, executionHostId: 'runtime:mini', connectionId: 'builder' }]
  })
  expect(await sendLocalTaskReply(nested, 'continue')).toEqual({ status: 'sent' })
})
