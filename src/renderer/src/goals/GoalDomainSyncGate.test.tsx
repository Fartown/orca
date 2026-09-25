// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { SshConnectionStatus } from '../../../shared/ssh-types'
import type { GoalEditorDraftDemand } from './goal-editor-drafts-sync'

type Harness = {
  ssh: SshConnectionStatus
  calls: string[]
  demand: GoalEditorDraftDemand | null
}
const harness = vi.hoisted((): Harness => ({ ssh: 'disconnected', calls: [], demand: null }))

vi.mock('../store', () => ({
  useAppStore: (select: (state: unknown) => unknown) =>
    select({
      activeWorkspaceKey: null,
      activeWorktreeId: 'worktree-1',
      rightSidebarOpen: true,
      rightSidebarTab: 'goals',
      sshConnectionStates: new Map([['box', { status: harness.ssh }]])
    })
}))
vi.mock('../lib/worktree-runtime-owner', () => ({
  getExecutionHostIdForWorktree: () => 'ssh:box'
}))
vi.mock('./goal-runtime-client', () => ({
  GoalRuntimeClient: class {
    constructor(readonly routeExecutionHostId: string) {}
    async status() {
      harness.calls.push('status')
      return { status: 'ready', reason: null }
    }
    async list() {
      harness.calls.push('list')
      return { items: [], observedAt: 1 }
    }
  },
  GoalRuntimeUnsupportedError: class extends Error {},
  getGoalRuntimeClient: () => null
}))
vi.mock('./goal-editor-drafts-sync', () => ({
  useGoalEditorDraftSync: (_client: unknown, demand: GoalEditorDraftDemand) => {
    harness.demand = demand
  }
}))
vi.mock('./GoalNoticeWatcher', () => ({ GoalNoticeWatcher: () => null }))

import { GoalDomainSyncGate } from './GoalDomainSyncGate'
import { goalDomainStore } from './goals-domain-store'

beforeEach(() => {
  vi.useFakeTimers()
  Object.assign(harness, { ssh: 'disconnected', calls: [], demand: null })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('sends nothing to a host out of contact and reads it as soon as it is back', async () => {
  const view = render(<GoalDomainSyncGate />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000)
  })
  expect(harness.calls).toEqual([])
  expect(goalDomainStore.getState().status).toBe('offline')
  expect(harness.demand).toEqual({ inContact: false, panelVisible: true })

  harness.ssh = 'connected'
  view.rerender(<GoalDomainSyncGate />)
  await act(async () => {})
  expect(harness.calls).toEqual(['status', 'list'])
  expect(harness.demand).toEqual({ inContact: true, panelVisible: true })
})
