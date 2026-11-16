import { beforeEach, expect, it, vi } from 'vitest'
import type { LocalTaskSessionLink } from '../../../shared/local-tasks/local-task-link-types'

const fixture = vi.hoisted(() => ({
  hostId: 'local',
  openTaskPage: vi.fn()
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => ({}) } }))
vi.mock('@/lib/worktree-runtime-owner', () => ({
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
  localTasksDomainStore.setState({ links: { workspaces: [], sessions: [link] } })
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
