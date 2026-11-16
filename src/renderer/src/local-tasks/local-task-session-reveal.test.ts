import { beforeEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => {
  const activeWorktreeId = new Map<string, string>().get('active') ?? null
  const visibleTargets: { worktreeId: string; tabId: string }[] = []
  return {
    reveal: vi.fn(() => true),
    acknowledge: vi.fn(async () => ({ ok: true })),
    openTaskPage: vi.fn(),
    activeView: 'tasks',
    activeWorktreeId,
    visibleTargets
  }
})
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      unifiedTabsByWorktree: {},
      activeView: fixture.activeView,
      activeWorktreeId: fixture.activeWorktreeId
    })
  }
}))
vi.mock('@/hooks/agent-auto-ack-targets', () => ({
  resolveAutoAckTabTargets: () => fixture.visibleTargets
}))
vi.mock('@/lib/reveal-terminal-pane', () => ({ revealTerminalPane: fixture.reveal }))
vi.mock('@/lib/worktree-activation', () => ({ activateAndRevealWorkspace: () => true }))
vi.mock('@/lib/structured-agent-session-tab-activation', () => ({
  activateStructuredAgentSessionTab: () => true
}))
vi.mock('./local-task-navigation', () => ({ openLocalTaskPage: fixture.openTaskPage }))
vi.mock('./local-tasks-runtime-client', () => ({
  localTasksClient: { acknowledgeAttention: fixture.acknowledge }
}))

import type {
  LocalTaskAttentionItem,
  LocalTaskSessionLink
} from '../../../shared/local-tasks/local-task-link-types'
import { localTasksDomainStore } from './local-tasks-domain-store'
import { acknowledgeLocalTaskSessionItems, openLocalTaskSession } from './local-task-session-reveal'
import { localTaskSessionPanelStore } from './local-task-session-panel-store'
import { localTaskPageStore } from './local-task-page-store'

const LEAF = '11111111-1111-4111-8111-111111111111'
const SESSION = 'runtime:env-1/s-1'

const link: LocalTaskSessionLink = {
  id: SESSION,
  taskId: 'runtime:env-1/t-1',
  hostId: 'runtime:env-1',
  worktreeId: 'repo::/w',
  instanceId: null,
  surface: 'terminal',
  tabId: 'web-terminal-tab-1',
  paneKey: `web-terminal-tab-1:${LEAF}`,
  sessionId: null,
  providerSession: null,
  agent: 'claude',
  linkedVia: 'start',
  openedAt: 1
}

function item(taskSessionId: string, key: string): LocalTaskAttentionItem {
  return {
    key,
    taskId: 'runtime:env-1/t-1',
    taskSessionId,
    kind: 'unread-done',
    agent: 'claude',
    lastMessage: null,
    since: 5,
    replyable: true
  }
}

beforeEach(() => {
  fixture.reveal.mockClear()
  fixture.acknowledge.mockClear()
  fixture.openTaskPage.mockClear()
  fixture.activeView = 'tasks'
  fixture.activeWorktreeId = null
  fixture.visibleTargets = []
  localTaskSessionPanelStore.getState().close()
  localTaskPageStore.setState(localTaskPageStore.getInitialState(), true)
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
  localTasksDomainStore.getState().openEndpoint('runtime:env-1')
  const library = localTasksDomainStore.getState().writer('runtime:env-1')
  library.setConnection('live')
  library.setHostState('ready', null)
  library.applyProgress({
    observedAt: 5,
    sessions: [],
    items: [item(SESSION, `tab-1:${LEAF}@5`), item('runtime:env-1/s-2', 'other@5')]
  })
})

it('opens a preview without acknowledging before its surface is ready', () => {
  localTaskPageStore.getState().setPreviewOpen(true)
  expect(openLocalTaskSession(link)).toBe(true)
  expect(localTaskPageStore.getState().previewOpen).toBe(false)
  expect(fixture.openTaskPage).toHaveBeenCalledWith({ taskId: link.taskId })
  expect(localTaskSessionPanelStore.getState()).toMatchObject({
    mode: 'narrow',
    sessionLinkId: SESSION,
    taskId: link.taskId
  })
  expect(fixture.reveal).not.toHaveBeenCalled()
  expect(fixture.acknowledge).not.toHaveBeenCalled()
  acknowledgeLocalTaskSessionItems(SESSION)
  expect(fixture.acknowledge.mock.calls).toEqual([[`tab-1:${LEAF}@5`, SESSION]])
})

it('keeps the local task list behind a session preview', () => {
  localTaskPageStore.getState().setLocalActive(true)
  localTaskPageStore.getState().setPreviewOpen(true)
  expect(openLocalTaskSession(link)).toBe(true)
  expect(fixture.openTaskPage).not.toHaveBeenCalled()
  expect(localTaskPageStore.getState()).toMatchObject({ detailTaskId: null, previewOpen: false })
  expect(localTaskSessionPanelStore.getState().sessionLinkId).toBe(link.id)
})

it('keeps an existing detail behind its session preview', () => {
  localTaskPageStore.getState().setLocalActive(true)
  localTaskPageStore.getState().openDetail(link.taskId)
  expect(openLocalTaskSession(link)).toBe(true)
  expect(fixture.openTaskPage).not.toHaveBeenCalled()
  expect(localTaskPageStore.getState().detailTaskId).toBe(link.taskId)
})

it('reveals an already visible terminal tab without creating a second session surface', () => {
  fixture.activeView = 'terminal'
  fixture.activeWorktreeId = link.worktreeId
  fixture.visibleTargets = [{ worktreeId: link.worktreeId!, tabId: link.tabId! }]
  expect(openLocalTaskSession(link)).toBe(true)
  expect(fixture.reveal).toHaveBeenCalledOnce()
  expect(fixture.openTaskPage).not.toHaveBeenCalled()
  expect(localTaskSessionPanelStore.getState().mode).toBe('closed')
  expect(fixture.acknowledge).not.toHaveBeenCalled()
})

it('leaves a question the opened session still waits on in Needs you (REQ-014)', () => {
  localTasksDomainStore
    .getState()
    .writer('runtime:env-1')
    .applyProgress({
      observedAt: 6,
      sessions: [],
      items: [{ ...item(SESSION, `tab-1:${LEAF}@6`), kind: 'question', replyable: false }]
    })
  expect(openLocalTaskSession(link)).toBe(true)
  expect(fixture.acknowledge).not.toHaveBeenCalled()
})

it('marks nothing seen when the session could not be shown', () => {
  expect(openLocalTaskSession({ ...link, worktreeId: null })).toBe(false)
  expect(localTaskSessionPanelStore.getState().mode).toBe('closed')
  expect(fixture.acknowledge).not.toHaveBeenCalled()
})
