import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type {
  LocalTaskAttentionItem,
  LocalTaskSessionLink
} from '../../../shared/local-tasks/local-task-link-types'

const fixture = vi.hoisted(() => ({ acknowledgeAttention: vi.fn() }))

vi.mock('@/store', async () => {
  const { createTestStore } = await import('@/store/slices/store-test-helpers')
  return { useAppStore: createTestStore() }
})
vi.mock('./local-tasks-runtime-client', () => ({
  localTasksClient: { acknowledgeAttention: fixture.acknowledgeAttention }
}))

import { useAppStore } from '@/store'
import { localTasksDomainStore } from './local-tasks-domain-store'
import {
  acknowledgeLocalTaskItemOnce,
  bindLocalTaskSeenForwarding
} from './local-task-seen-forwarding'

const SERVER = 'runtime:env-1'

function session(id: string, paneKey: string): LocalTaskSessionLink {
  return {
    id,
    taskId: `${id}-task`,
    hostId: 'local',
    worktreeId: 'repo::/w',
    instanceId: null,
    surface: 'terminal',
    tabId: null,
    paneKey,
    sessionId: null,
    providerSession: null,
    agent: 'claude',
    linkedVia: 'start',
    openedAt: 1
  }
}

function item(taskSessionId: string, key: string, since: number): LocalTaskAttentionItem {
  return {
    key,
    taskId: `${taskSessionId}-task`,
    taskSessionId,
    kind: 'unread-done',
    agent: 'claude',
    lastMessage: null,
    since,
    replyable: true
  }
}

let unbind: () => void = () => {}

beforeEach(() => {
  fixture.acknowledgeAttention.mockResolvedValue({ ok: true })
  useAppStore.setState({ acknowledgedAgentsByPaneKey: {} })
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
  const domain = localTasksDomainStore.getState()
  domain.openEndpoint('local')
  domain.openEndpoint(SERVER)
  const own = domain.writer('local')
  own.setConnection('live')
  own.setHostState('ready', null)
  own.applyLinks({ workspaces: [], sessions: [session('s1', 'tab-1:leaf-1')] })
  own.applyProgress({ observedAt: 1, sessions: [], items: [item('s1', 'tab-1:leaf-1@100', 100)] })
  // The server's terminal reads in this window's mirrored spelling; its item key stays the host's.
  const server = domain.writer(SERVER)
  server.setConnection('live')
  server.setHostState('read-only', null)
  server.applyLinks({
    workspaces: [],
    sessions: [session(`${SERVER}/s2`, 'web-terminal-tab-2:leaf-2')]
  })
  server.applyProgress({
    observedAt: 1,
    sessions: [],
    items: [item(`${SERVER}/s2`, 'tab-2:leaf-2@200', 200)]
  })
  unbind = bindLocalTaskSeenForwarding()
})

afterEach(() => {
  unbind()
  fixture.acknowledgeAttention.mockReset()
})

it('marks an item seen in its library once the user saw its turn anywhere in this window', () => {
  expect(fixture.acknowledgeAttention).not.toHaveBeenCalled()
  // An acknowledgement of an earlier turn says nothing about this one.
  useAppStore.setState({ acknowledgedAgentsByPaneKey: { 'tab-1:leaf-1': 99 } })
  expect(fixture.acknowledgeAttention).not.toHaveBeenCalled()
  useAppStore.setState({ acknowledgedAgentsByPaneKey: { 'tab-1:leaf-1': 100 } })
  expect(fixture.acknowledgeAttention).toHaveBeenCalledOnce()
  expect(fixture.acknowledgeAttention).toHaveBeenCalledWith('tab-1:leaf-1@100', 's1')
  useAppStore.setState({ workspaceHostScope: 'local' })
  expect(fixture.acknowledgeAttention).toHaveBeenCalledOnce()
})

it('leaves a library that takes no writes alone, and asks again only after the host answers anew', async () => {
  useAppStore.setState({ acknowledgedAgentsByPaneKey: { 'web-terminal-tab-2:leaf-2': 250 } })
  expect(fixture.acknowledgeAttention).not.toHaveBeenCalled()

  fixture.acknowledgeAttention.mockResolvedValueOnce({ ok: false, code: 'read_only' })
  useAppStore.setState({ acknowledgedAgentsByPaneKey: { 'tab-1:leaf-1': 100 } })
  await vi.waitFor(() => expect(fixture.acknowledgeAttention).toHaveBeenCalledOnce())
  await Promise.resolve()
  useAppStore.setState({ workspaceHostScope: 'local' })
  expect(fixture.acknowledgeAttention).toHaveBeenCalledOnce()
  localTasksDomainStore
    .getState()
    .writer('local')
    .applyProgress({ observedAt: 2, sessions: [], items: [item('s1', 'tab-1:leaf-1@100', 100)] })
  expect(fixture.acknowledgeAttention).toHaveBeenCalledTimes(2)
})

it('marks an item seen once when opening its session also acknowledges its pane', () => {
  acknowledgeLocalTaskItemOnce(item('s1', 'tab-1:leaf-1@100', 100))
  expect(fixture.acknowledgeAttention).toHaveBeenCalledOnce()
  useAppStore.setState({ acknowledgedAgentsByPaneKey: { 'tab-1:leaf-1': 100 } })
  expect(fixture.acknowledgeAttention).toHaveBeenCalledOnce()
})
