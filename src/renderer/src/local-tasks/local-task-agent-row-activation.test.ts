import { beforeEach, expect, it, vi } from 'vitest'
import type { LocalTaskSessionLink } from '../../../shared/local-tasks/local-task-link-types'
import { LOCAL_TASK_SOURCE_HIDDEN_PREFERENCE_KEY } from '../../../shared/local-tasks/local-task-source-visibility'

const fixture = vi.hoisted(() => ({
  hostId: 'local',
  openTaskPage: vi.fn()
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => ({}) } }))
vi.mock('@/lib/workspace/ownership/worktree-runtime-owner', () => ({
  getKnownExecutionHostIdForWorktree: () => fixture.hostId
}))
vi.mock('./local-task-navigation', () => ({ openLocalTaskPage: fixture.openTaskPage }))

import { localTasksDomainStore } from './local-tasks-domain-store'
import { localTaskSessionPanelStore } from './local-task-session-panel-store'
import { openLocalTaskSessionFromAgentRow } from './local-task-agent-row-activation'

const paneKey = 'tab-1:11111111-1111-4111-8111-111111111111'
const link: LocalTaskSessionLink = {
  id: 'linked-session',
  taskId: 'task-1',
  hostId: 'local',
  worktreeId: 'repo::/work',
  instanceId: null,
  surface: 'terminal',
  tabId: 'tab-1',
  paneKey,
  sessionId: null,
  providerSession: null,
  agent: 'claude',
  linkedVia: 'manual',
  openedAt: 1
}

beforeEach(() => {
  fixture.hostId = 'local'
  fixture.openTaskPage.mockClear()
  localTaskSessionPanelStore.getState().close()
  localTasksDomainStore.setState({
    preferences: { sidebarTaskMode: '1' },
    links: { workspaces: [], sessions: [link] }
  })
})

it('opens the exact linked pane beside its task with a wide session', () => {
  expect(openLocalTaskSessionFromAgentRow('repo::/work', 'tab-1', paneKey)).toBe(true)
  expect(fixture.openTaskPage).toHaveBeenCalledWith({ taskId: 'task-1' })
  expect(localTaskSessionPanelStore.getState()).toMatchObject({
    sessionLinkId: link.id,
    mode: 'wide'
  })
})

it('keeps the original activation for a different host, workspace, pane, or ambiguous link', () => {
  fixture.hostId = 'ssh:other'
  expect(openLocalTaskSessionFromAgentRow('repo::/work', 'tab-1', paneKey)).toBe(false)
  fixture.hostId = 'local'
  expect(openLocalTaskSessionFromAgentRow('repo::/other', 'tab-1', paneKey)).toBe(false)
  expect(
    openLocalTaskSessionFromAgentRow(
      'repo::/work',
      'tab-1',
      'tab-1:22222222-2222-4222-8222-222222222222'
    )
  ).toBe(false)
  localTasksDomainStore.setState({
    links: { workspaces: [], sessions: [link, { ...link, id: 'duplicate' }] }
  })
  expect(openLocalTaskSessionFromAgentRow('repo::/work', 'tab-1', paneKey)).toBe(false)
  expect(fixture.openTaskPage).not.toHaveBeenCalled()
})

it.each([undefined, null, '0'])(
  'keeps the original session navigation in project mode (%s)',
  (value) => {
    localTasksDomainStore.setState({
      preferences: value === undefined ? {} : { sidebarTaskMode: value }
    })
    expect(openLocalTaskSessionFromAgentRow('repo::/work', 'tab-1', paneKey)).toBe(false)
    expect(fixture.openTaskPage).not.toHaveBeenCalled()
    expect(localTaskSessionPanelStore.getState().mode).toBe('closed')
  }
)

it('does not route to a task when its source is hidden even if task mode was saved', () => {
  localTasksDomainStore.setState({
    preferences: { sidebarTaskMode: '1', [LOCAL_TASK_SOURCE_HIDDEN_PREFERENCE_KEY]: '1' }
  })
  expect(openLocalTaskSessionFromAgentRow('repo::/work', 'tab-1', paneKey)).toBe(false)
  expect(fixture.openTaskPage).not.toHaveBeenCalled()
  expect(localTaskSessionPanelStore.getState().mode).toBe('closed')
})

it('reads the current mode on every click without waiting for the row to render again', () => {
  expect(openLocalTaskSessionFromAgentRow('repo::/work', 'tab-1', paneKey)).toBe(true)
  fixture.openTaskPage.mockClear()
  localTasksDomainStore.setState({ preferences: {} })
  expect(openLocalTaskSessionFromAgentRow('repo::/work', 'tab-1', paneKey)).toBe(false)
  expect(fixture.openTaskPage).not.toHaveBeenCalled()
  expect(localTaskSessionPanelStore.getState().mode).toBe('closed')
  localTasksDomainStore.setState({ preferences: { sidebarTaskMode: '1' } })
  expect(openLocalTaskSessionFromAgentRow('repo::/work', 'tab-1', paneKey)).toBe(true)
  expect(fixture.openTaskPage).toHaveBeenCalledOnce()
})

it.each(['wide', 'narrow'] as const)(
  'closes the previous %s task preview before the original project activation',
  (mode) => {
    localTaskSessionPanelStore.getState().open(link, mode)
    localTasksDomainStore.setState({ preferences: {} })
    expect(openLocalTaskSessionFromAgentRow('repo::/work', 'tab-1', paneKey)).toBe(false)
    expect(fixture.openTaskPage).not.toHaveBeenCalled()
    expect(localTaskSessionPanelStore.getState()).toMatchObject({
      mode: 'closed',
      sessionLinkId: null,
      taskId: null,
      requestToken: null
    })
  }
)

it.each(['ssh:mini', 'runtime:mini'])(
  'keeps task-mode navigation on the exact %s owner',
  (hostId) => {
    fixture.hostId = hostId
    localTasksDomainStore.setState({
      links: { workspaces: [], sessions: [{ ...link, hostId }] }
    })
    expect(openLocalTaskSessionFromAgentRow('repo::/work', 'tab-1', paneKey)).toBe(true)
    expect(fixture.openTaskPage).toHaveBeenCalledWith({ taskId: link.taskId })
    expect(localTaskSessionPanelStore.getState().sessionLinkId).toBe(link.id)
  }
)
