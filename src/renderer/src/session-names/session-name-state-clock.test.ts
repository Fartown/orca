import { afterEach, expect, it, vi } from 'vitest'
import { createTestStore } from '@/store/testing/app-store-test-fixture'
import type { AgentStatusTiming } from '@/store/slices/agent-status/contracts/agent-status-contract'
import { makePaneKey } from '../../../shared/workspace-layout/stable-pane-id'

// Fork (session-names): moved from agent-status-row-order-origin.test.ts, which upstream #43403 removed.
const pane = makePaneKey('tab-order', '11111111-1111-4111-8111-111111111111')

afterEach(() => {
  vi.useRealTimers()
})

it('starts a replacement session on its own clock while keeping its observed origin', () => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
  const store = createTestStore()
  const write = (at: number, session: string, timing: Omit<AgentStatusTiming, 'updatedAt'> = {}) =>
    store
      .getState()
      .setAgentStatus(
        pane,
        { state: 'working', prompt: 'task', agentType: 'claude' },
        undefined,
        { ...timing, updatedAt: at },
        { worktreeId: 'wt-order' },
        { providerSession: { key: 'session_id', id: session } }
      )
  write(1000, 'A')
  write(7000, 'B', { stateStartedAt: 1000, evidenceObservedAt: 6000 })
  // B does not inherit A's state clock; ordering still uses B's origin.
  expect(store.getState().agentStatusByPaneKey.get(pane)).toMatchObject({
    providerSession: { id: 'B' },
    stateStartedAt: 7000,
    firstStateStartedAt: 6000,
    updatedAt: 7000,
    evidenceObservedAt: 6000
  })
})
