// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { LocalTaskDispatchReceipt as Receipt } from '@/local-tasks/local-task-dispatch-launch'

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  finish: vi.fn(),
  reveal: vi.fn()
}))

vi.mock('@/local-tasks/local-task-dispatch-launch', () => ({ dispatchLocalTask: mocks.dispatch }))
vi.mock('@/local-tasks/local-task-dispatch-record', () => ({
  finishLocalTaskDispatchRecord: mocks.finish,
  revealDispatchedSession: mocks.reveal
}))
vi.mock('@/local-tasks/local-task-dispatch-undo', () => ({ offerLocalTaskDispatchUndo: vi.fn() }))
vi.mock('@/local-tasks/local-tasks-runtime-client', () => ({
  localTasksClient: { removeTask: vi.fn() }
}))
vi.mock('@/local-tasks/local-tasks-domain-store', () => ({
  localTasksDomainStore: { getState: () => ({ tasks: [] }) }
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
