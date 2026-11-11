import { beforeEach, expect, it } from 'vitest'
import type { LocalTaskSessionLink } from '../../../shared/local-tasks/local-task-link-types'
import { localTaskSessionPanelStore } from './local-task-session-panel-store'

const first: LocalTaskSessionLink = {
  id: 'session-1',
  taskId: 'task-1',
  hostId: 'local',
  worktreeId: 'workspace-1',
  instanceId: null,
  surface: 'terminal',
  tabId: 'tab-1',
  paneKey: null,
  sessionId: null,
  providerSession: null,
  agent: null,
  linkedVia: 'start',
  openedAt: 1
}

beforeEach(() => localTaskSessionPanelStore.getState().close())

it('keeps the same session and portal request while changing width', () => {
  localTaskSessionPanelStore.getState().open(first)
  const token = localTaskSessionPanelStore.getState().requestToken
  localTaskSessionPanelStore.getState().setMode('wide')
  expect(localTaskSessionPanelStore.getState()).toMatchObject({
    mode: 'wide',
    sessionLinkId: first.id,
    requestToken: token
  })
  localTaskSessionPanelStore.getState().setMode('narrow')
  expect(localTaskSessionPanelStore.getState().requestToken).toBe(token)
})

it('changes the portal request when switching sessions and keeps the root task', () => {
  localTaskSessionPanelStore.getState().open(first)
  const token = localTaskSessionPanelStore.getState().requestToken
  localTaskSessionPanelStore
    .getState()
    .switchSession({ ...first, id: 'session-2', taskId: 'child-1' })
  expect(localTaskSessionPanelStore.getState()).toMatchObject({
    mode: 'narrow',
    sessionLinkId: 'session-2',
    taskId: first.taskId
  })
  expect(localTaskSessionPanelStore.getState().requestToken).not.toBe(token)
  localTaskSessionPanelStore.getState().close()
  expect(localTaskSessionPanelStore.getState()).toMatchObject({
    mode: 'closed',
    sessionLinkId: null,
    requestToken: null
  })
})
