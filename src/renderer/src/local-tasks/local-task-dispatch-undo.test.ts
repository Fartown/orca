import { beforeEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => {
  const unifiedTabsByWorktree: Record<string, { id: string }[]> = {}
  const events: string[] = []
  return {
    rpc: vi.fn(),
    removeTask: vi.fn(),
    closeStructured: vi.fn(),
    closeUnifiedTab: vi.fn(),
    unifiedTabsByWorktree,
    events,
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    toastWarning: vi.fn()
  }
})

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      unifiedTabsByWorktree: fixture.unifiedTabsByWorktree,
      closeUnifiedTab: fixture.closeUnifiedTab
    })
  }
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: fixture.rpc }))
vi.mock('@/runtime/structured-agent-session-close', () => ({
  closeStructuredAgentSession: fixture.closeStructured
}))
vi.mock('sonner', () => ({
  toast: { error: fixture.toastError, success: fixture.toastSuccess, warning: fixture.toastWarning }
}))
vi.mock('./local-task-host-contact', () => ({ isLocalTaskHostInContact: () => true }))
vi.mock('./local-tasks-domain-store', () => ({
  isLocalTaskRowWritable: () => true,
  localTasksDomainStore: { getState: () => ({}) }
}))
vi.mock('./local-tasks-runtime-client', () => ({
  localTasksClient: { removeTask: fixture.removeTask }
}))

import type { LocalTaskDispatchReceipt } from './local-task-dispatch-launch'
import {
  offerLocalTaskDispatchUndo,
  undoLocalTaskDispatch,
  undoLocalTaskDispatchBatch
} from './local-task-dispatch-undo'

function receipt(id: string): LocalTaskDispatchReceipt {
  return {
    kind: 'launched',
    taskId: id,
    createdTaskIds: [id],
    target: {
      kind: 'host',
      id: 'host:local',
      label: 'Local',
      detail: '',
      hostId: 'local',
      available: true
    },
    text: 'do work',
    message: null,
    launch: {
      hostId: 'local',
      worktreeId: 'workspace',
      outcome: { kind: 'terminal', handle: `terminal-${id}`, paneKey: undefined }
    }
  }
}

beforeEach(() => {
  fixture.events = []
  fixture.unifiedTabsByWorktree = {}
  fixture.rpc.mockReset().mockImplementation(async (_target, _method, params) => {
    fixture.events.push('stop')
    return { close: { handle: params.terminal, tabId: 'tab', ptyKilled: true } }
  })
  fixture.closeStructured.mockReset().mockResolvedValue('closed')
  fixture.closeUnifiedTab.mockReset().mockReturnValue({ closedTabId: 'tab', wasLastTab: false })
  fixture.removeTask.mockReset().mockImplementation(async () => {
    fixture.events.push('remove')
    return { ok: true }
  })
  fixture.toastError.mockReset()
  fixture.toastSuccess.mockReset()
  fixture.toastWarning.mockReset()
})

it('shows a partial-success warning and retains Undo when the session starts without its prompt', () => {
  const launched = { ...receipt('task-1'), message: 'Session started but prompt was not delivered' }
  offerLocalTaskDispatchUndo(launched)
  expect(fixture.toastSuccess).not.toHaveBeenCalled()
  expect(fixture.toastWarning).toHaveBeenCalledWith(
    'Session started',
    expect.objectContaining({
      description: launched.message,
      action: expect.objectContaining({ label: 'Undo', onClick: expect.any(Function) })
    })
  )
})

it('retains the task when the host did not confirm the session stopped', async () => {
  fixture.rpc.mockRejectedValueOnce(new Error('disconnected'))
  expect(await undoLocalTaskDispatch(receipt('task-1'))).toBe(false)
  expect(fixture.removeTask).not.toHaveBeenCalled()
})

it.each([null, { close: { handle: 'terminal-task-1', tabId: 'tab', ptyKilled: false } }])(
  'retains the task when terminal.close has no confirmed PTY kill: %s',
  async (result) => {
    fixture.rpc.mockResolvedValueOnce(result)
    expect(await undoLocalTaskDispatch(receipt('task-1'))).toBe(false)
    expect(fixture.removeTask).not.toHaveBeenCalled()
  }
)

it('stops every batch session before deleting each child and the parent', async () => {
  const batch = {
    parentTaskId: 'parent',
    receipts: [receipt('child-1'), receipt('child-2')],
    message: null
  }
  expect(await undoLocalTaskDispatchBatch(batch)).toBe(true)
  expect(fixture.rpc.mock.calls.map((call) => call[2])).toEqual([
    { terminal: 'terminal-child-2' },
    { terminal: 'terminal-child-1' }
  ])
  expect(fixture.removeTask.mock.calls.map((call) => call[0])).toEqual([
    'child-2',
    'child-1',
    'parent'
  ])
  expect(fixture.events).toEqual(['stop', 'stop', 'remove', 'remove', 'remove'])
})

it('retains the task if the mirror refuses to close after the host stop', async () => {
  fixture.unifiedTabsByWorktree = { workspace: [{ id: 'tab-1' }] }
  fixture.closeUnifiedTab.mockReturnValue(null)
  const launched = receipt('task-1')
  launched.launch!.outcome = {
    kind: 'terminal',
    handle: 'terminal-task-1',
    paneKey: 'tab-1:11111111-1111-4111-8111-111111111111'
  }
  expect(await undoLocalTaskDispatch(launched)).toBe(false)
  expect(fixture.removeTask).not.toHaveBeenCalled()
})
