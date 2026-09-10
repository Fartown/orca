import { expect, it, vi } from 'vitest'
import {
  buildStoreState,
  FUTURE_PANE_KEY
} from '../hooks/ipc-events-agent-status-store-test-fixtures'
import { createAgentStatusEventApplicator } from '../hooks/ipc-events/agent-status-event-applicator'

const { observe, getState } = vi.hoisted(() => ({ observe: vi.fn(), getState: vi.fn() }))
vi.mock('@/store', () => ({ useAppStore: { getState } }))
vi.mock('@/hooks/agent-hook-completion-notifications', () => ({
  observeAgentHookCompletionForNotification: observe
}))
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }))

it('keeps accepted IPC session identity in the delayed notification snapshot, not private routing fields', () => {
  observe.mockClear()
  getState.mockReturnValue(
    buildStoreState({
      workspaceSessionReady: true,
      setAgentStatus: vi.fn(),
      tabsByWorktree: {
        'wt-1': [{ id: 'tab-future', ptyId: 'pty-1', worktreeId: 'wt-1', title: 'Codex' }]
      }
    })
  )
  const apply = createAgentStatusEventApplicator({
    pendingAgentStatusEvents: [],
    transientClearWatermarkByConnectionId: new Map(),
    enqueuePendingAgentStatus: vi.fn()
  })
  const providerSession = {
    key: 'session_id' as const,
    id: 'A',
    transcriptPath: '/provider/A.jsonl'
  }
  expect(
    apply({
      paneKey: FUTURE_PANE_KEY,
      connectionId: null,
      tabId: 'tab-future',
      worktreeId: 'wt-1',
      state: 'done',
      prompt: '继续',
      agentType: 'codex',
      receivedAt: 100,
      stateStartedAt: 100,
      providerSession,
      launchToken: 'private-launch-token'
    })
  ).toBe('applied')
  expect(observe).toHaveBeenCalledWith(
    expect.objectContaining({
      payload: expect.objectContaining({ providerSession, prompt: '继续', stateStartedAt: 100 })
    })
  )
  expect(observe.mock.calls[0][0].payload).not.toHaveProperty('launchToken')
})
