// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import type { LocalTaskSessionLink } from '../../../../shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'

const contact = vi.hoisted(() => ({ inContact: true }))
vi.mock('@/local-tasks/local-task-host-contact', () => ({
  useLocalTaskHostInContact: () => contact.inContact
}))

import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import { localTaskSessionPanelStore } from '@/local-tasks/local-task-session-panel-store'
import { LocalTaskSessionList } from './LocalTaskSessionList'

const task: LocalTask = {
  id: 'task-1',
  projectId: 'project-1',
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
const session: LocalTaskSessionLink = {
  id: 'session-1',
  taskId: task.id,
  hostId: 'ssh:box',
  worktreeId: 'repo::/remote',
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
const index: LocalTaskIndex = {
  projectsById: new Map(),
  statusesById: new Map(),
  tasksById: new Map([[task.id, task]]),
  childrenByParentId: new Map()
}

beforeEach(() => {
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState(), true)
  localTasksDomainStore.setState({ links: { workspaces: [], sessions: [session] } })
  localTaskSessionPanelStore.getState().close()
})
afterEach(() => {
  cleanup()
  localTaskSessionPanelStore.getState().close()
})

it('peeks a session on a host in contact, beside the task instead of leaving it', () => {
  contact.inContact = true
  render(
    <LocalTaskSessionList task={task} workspace={null} index={index} writable showEmpty={false} />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Peek' }))
  expect(localTaskSessionPanelStore.getState()).toMatchObject({
    mode: 'narrow',
    sessionLinkId: session.id
  })
})

it('says why a session on a host out of contact cannot be peeked, and offers no way in', () => {
  contact.inContact = false
  render(
    <LocalTaskSessionList task={task} workspace={null} index={index} writable showEmpty={false} />
  )
  expect(screen.queryByRole('button', { name: 'Peek' })).toBeNull()
  expect(screen.getByText(/^Peek unavailable · .+ is not connected$/)).toBeTruthy()
  fireEvent.click(screen.getByText('Claude'))
  expect(localTaskSessionPanelStore.getState().mode).toBe('closed')
})
