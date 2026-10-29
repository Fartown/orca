import { beforeEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  reveal: vi.fn(() => true),
  acknowledge: vi.fn(async () => ({ ok: true }))
}))
vi.mock('@/store', () => ({
  useAppStore: { getState: () => ({ unifiedTabsByWorktree: {} }) }
}))
vi.mock('@/lib/reveal-terminal-pane', () => ({ revealTerminalPane: fixture.reveal }))
vi.mock('@/lib/worktree-activation', () => ({ activateAndRevealWorkspace: () => true }))
vi.mock('@/lib/structured-agent-session-tab-activation', () => ({
  activateStructuredAgentSessionTab: () => true
}))
vi.mock('./local-tasks-runtime-client', () => ({
  localTasksClient: { acknowledgeAttention: fixture.acknowledge }
}))

import type {
  LocalTaskAttentionItem,
  LocalTaskSessionLink
} from '../../../shared/local-tasks/local-task-link-types'
import { localTasksDomainStore } from './local-tasks-domain-store'
import { openLocalTaskSession } from './local-task-session-reveal'

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

it('marks what an opened session waited for as seen, in its own library', () => {
  expect(openLocalTaskSession(link)).toBe(true)
  expect(fixture.reveal).toHaveBeenCalledWith(
    expect.objectContaining({ tabId: 'web-terminal-tab-1', leafId: LEAF })
  )
  expect(fixture.acknowledge.mock.calls).toEqual([[`tab-1:${LEAF}@5`, SESSION]])
})

it('marks nothing seen when the session could not be shown', () => {
  fixture.reveal.mockReturnValueOnce(false)
  expect(openLocalTaskSession(link)).toBe(false)
  expect(fixture.acknowledge).not.toHaveBeenCalled()
})
