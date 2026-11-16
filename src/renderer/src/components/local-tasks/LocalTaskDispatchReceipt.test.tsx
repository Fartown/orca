// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { LocalTaskDispatchReceipt as Receipt } from '@/local-tasks/local-task-dispatch-launch'

const mocks = vi.hoisted(() => {
  const links: unknown[] = []
  const tasks: unknown[] = []
  return {
    dispatch: vi.fn(),
    finish: vi.fn(),
    reveal: vi.fn(),
    previewTask: vi.fn(),
    openSession: vi.fn(),
    revealSession: vi.fn(),
    links,
    tasks
  }
})

vi.mock('@/local-tasks/local-task-dispatch-launch', () => ({ dispatchLocalTask: mocks.dispatch }))
vi.mock('@/local-tasks/local-task-dispatch-record', () => ({
  finishLocalTaskDispatchRecord: mocks.finish,
  revealDispatchedSession: mocks.reveal,
  dispatchedSessionIds: () => ({ surface: 'terminal', paneKey: 'tab:leaf', tabId: 'tab' })
}))
vi.mock('@/local-tasks/local-task-receipt-preview', () => ({
  openLocalTaskReceiptPreview: mocks.previewTask
}))
vi.mock('@/local-tasks/local-task-session-reveal', () => ({
  openLocalTaskSession: mocks.openSession,
  revealLocalTaskSession: mocks.revealSession
}))
vi.mock('@/local-tasks/local-task-dispatch-undo', () => ({ offerLocalTaskDispatchUndo: vi.fn() }))
vi.mock('@/local-tasks/local-tasks-runtime-client', () => ({
  localTasksClient: { removeTask: vi.fn() }
}))
vi.mock('@/local-tasks/local-tasks-domain-store', () => ({
  localTasksDomainStore: {
    getState: () => ({ tasks: mocks.tasks, links: { sessions: mocks.links } })
  },
  useLocalTasksDomain: (selector: (state: { tasks: unknown[] }) => unknown) =>
    selector({ tasks: mocks.tasks })
}))

import { LocalTaskDispatchReceipt } from './LocalTaskDispatchReceipt'

const unrecorded: Receipt = {
  kind: 'unrecorded',
  taskId: 'task-1',
  createdTaskIds: ['task-1'],
  target: {
    kind: 'host',
    id: 'host:local',
    label: 'Local',
    detail: '',
    hostId: 'local',
    available: true
  },
  text: 'Fix the README links',
  message: 'Session started but could not be linked',
  record: {
    workspace: null,
    session: {
      taskId: 'task-1',
      hostId: 'local',
      worktreeId: 'wt',
      instanceId: null,
      agent: 'claude',
      linkedVia: 'start'
    },
    ids: { surface: 'terminal', tabId: 'tab' }
  }
}

afterEach(cleanup)
beforeEach(() => {
  mocks.tasks = []
  mocks.links = []
  mocks.openSession.mockClear()
  mocks.dispatch.mockClear()
})

it('uses the receipt task and already recorded session for both follow-up actions', () => {
  mocks.tasks = [{ id: 'task-1', title: 'Fix the README links', ref: 'SHOP-19' }]
  const link = {
    id: 'session-1',
    taskId: 'task-1',
    hostId: 'local',
    worktreeId: 'wt',
    paneKey: 'tab:leaf',
    tabId: 'tab',
    sessionId: null
  }
  mocks.links = [link]
  const receipt: Receipt = {
    ...unrecorded,
    kind: 'launched',
    message: null,
    record: undefined,
    launch: {
      hostId: 'local',
      worktreeId: 'wt',
      outcome: { kind: 'terminal', paneKey: 'tab:leaf', handle: 'handle' }
    }
  }
  render(<LocalTaskDispatchReceipt receipt={receipt} agent="claude" onChange={vi.fn()} />)
  expect(screen.getByText('Fix the README links').className).toContain('font-medium')
  expect(screen.getByText('SHOP-19').className).toContain('text-muted-foreground')
  fireEvent.click(screen.getByRole('button', { name: 'Preview task' }))
  expect(mocks.previewTask).toHaveBeenCalledWith(mocks.tasks[0])
  fireEvent.click(screen.getByRole('button', { name: 'Preview session' }))
  expect(mocks.openSession).toHaveBeenCalledWith(link)
  expect(mocks.dispatch).not.toHaveBeenCalled()
})

it('opens the exact acknowledged SSH session after an append, without launching another one', () => {
  mocks.tasks = [{ id: 'task-1', title: 'Fix the README links', ref: 'SHOP-19' }]
  const sent = {
    id: 'session-remote',
    taskId: 'child',
    hostId: 'ssh:tag',
    worktreeId: 'remote-wt',
    instanceId: null,
    surface: 'terminal',
    tabId: 'remote-tab',
    paneKey: null,
    sessionId: null,
    providerSession: null,
    agent: 'claude',
    linkedVia: 'start',
    openedAt: 0
  } as const
  const receipt: Receipt = {
    ...unrecorded,
    kind: 'appended',
    message: null,
    record: undefined,
    appendedSession: sent
  }
  render(<LocalTaskDispatchReceipt receipt={receipt} agent="claude" onChange={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Preview session' }))
  expect(mocks.openSession).toHaveBeenCalledWith(sent)
  expect(mocks.dispatch).not.toHaveBeenCalled()
})

it('offers to record or open a started session, never to launch it again', async () => {
  mocks.finish.mockResolvedValue({ ...unrecorded, kind: 'launched', message: null })
  const onChange = vi.fn()
  render(<LocalTaskDispatchReceipt receipt={unrecorded} agent="claude" onChange={onChange} />)
  expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Delete task' })).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Open session' }))
  expect(mocks.reveal).toHaveBeenCalledWith(unrecorded)

  fireEvent.click(screen.getByRole('button', { name: 'Record again' }))
  await waitFor(() =>
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'launched' }))
  )
  expect(mocks.finish).toHaveBeenCalledWith(unrecorded)
  expect(mocks.dispatch).not.toHaveBeenCalled()
})
