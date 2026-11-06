import { beforeEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  contact: true,
  task: { id: 'task-1', ref: 'TASK-1', projectId: 'project-1' },
  link: {
    id: 'session-1',
    taskId: 'task-1',
    hostId: 'local',
    worktreeId: 'worktree-1',
    surface: 'terminal',
    tabId: 'tab-1',
    paneKey: 'tab-1:11111111-1111-4111-8111-111111111111'
  },
  findTerminal: vi.fn(),
  closeTab: vi.fn(),
  rpc: vi.fn()
}))

const LEAF = '11111111-1111-4111-8111-111111111111'

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      terminalLayoutsByTabId: { 'tab-1': { root: { type: 'leaf', leafId: LEAF } } },
      closeTab: fixture.closeTab
    })
  }
}))
vi.mock('@/lib/active-agent-note-target', () => ({
  findActiveRuntimeTerminal: fixture.findTerminal
}))
vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: fixture.rpc }))
vi.mock('./local-task-host-contact', () => ({
  isLocalTaskHostInContact: () => fixture.contact
}))
vi.mock('./local-tasks-domain-store', () => ({
  localTasksDomainStore: {
    getState: () => ({ tasks: [fixture.task], projects: [], links: { sessions: [fixture.link] } })
  }
}))
vi.mock('./local-task-needs-you-actions', () => ({ sendLocalTaskReply: vi.fn() }))

import { runStopItem } from './local-task-proposal-session-items'

const item = {
  kind: 'stop' as const,
  taskId: fixture.task.id,
  sessionLinkId: fixture.link.id,
  reason: 'Superseded'
}

beforeEach(() => {
  fixture.contact = true
  fixture.link.hostId = 'local'
  fixture.findTerminal.mockReset().mockResolvedValue({ handle: 'handle-1' })
  fixture.closeTab.mockReset()
  fixture.rpc.mockReset().mockResolvedValue({
    close: { handle: 'handle-1', tabId: 'tab-1', ptyKilled: true }
  })
})

it('records stopped only after the host confirms the matching PTY was killed', async () => {
  expect(await runStopItem(item)).toMatchObject({ ok: true, detail: 'stopped' })
  expect(fixture.rpc).toHaveBeenCalledWith({ kind: 'local' }, 'terminal.close', {
    terminal: 'handle-1'
  })
  expect(fixture.closeTab).toHaveBeenCalledWith('tab-1', {
    captureRecentlyClosed: true,
    remoteCloseOwnedByHost: true
  })
})

it.each([
  [{ close: { handle: 'handle-1', tabId: 'tab-1', ptyKilled: false } }],
  [{ close: { handle: 'other', tabId: 'tab-1', ptyKilled: true } }],
  [null]
])('does not claim stop when owner response lacks kill proof: %s', async (result) => {
  fixture.rpc.mockResolvedValueOnce(result)
  expect(await runStopItem(item)).toMatchObject({ ok: false })
  expect(fixture.closeTab).not.toHaveBeenCalled()
})

it('keeps the tab when the close becomes unverifiable', async () => {
  fixture.rpc.mockRejectedValueOnce(new Error('host lost'))
  expect(await runStopItem(item)).toMatchObject({ ok: false })
  expect(fixture.closeTab).not.toHaveBeenCalled()
})

it('does not read or close a host that is out of contact', async () => {
  fixture.contact = false
  expect(await runStopItem(item)).toMatchObject({ ok: false })
  expect(fixture.findTerminal).not.toHaveBeenCalled()
  expect(fixture.rpc).not.toHaveBeenCalled()
})

it.each([
  ['ssh:host-1', { kind: 'local' }],
  ['runtime:env-1', { kind: 'environment', environmentId: 'env-1' }]
])('asks the owner host to stop a %s session before closing its mirror', async (hostId, target) => {
  fixture.link.hostId = hostId
  expect(await runStopItem(item)).toMatchObject({ ok: true })
  expect(fixture.rpc).toHaveBeenCalledWith(target, 'terminal.close', {
    terminal: 'handle-1'
  })
  expect(fixture.closeTab).toHaveBeenCalledOnce()
})
