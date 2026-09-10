import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import {
  applyWebSessionTabsSnapshot,
  applyWebSessionTabsStorePatch,
  decideWebSessionTabsSnapshot,
  resetWebSessionTabsSnapshotFreshnessForTests
} from '../runtime/web-session-tabs-sync'
import type { RuntimeMobileSessionTabsResult } from '../../../shared/runtime-types'
import { LEAF } from './session-name-binding-test-fixture'

const { observe } = vi.hoisted(() => ({ observe: vi.fn() }))
vi.mock('@/hooks/agent-hook-completion-notifications', () => ({
  observeAgentHookCompletionForNotification: observe
}))
const initial = useAppStore.getInitialState()
afterEach(() => {
  useAppStore.setState(initial, true)
  resetWebSessionTabsSnapshotFreshnessForTests()
})

it('keeps the paired host identity beside sanitized status in notification snapshots', () => {
  useAppStore.setState(initial, true)
  const providerSession = { key: 'session_id' as const, id: 'A', transcriptPath: '/host/A.jsonl' }
  const snapshot: RuntimeMobileSessionTabsResult = {
    worktree: 'wt-1',
    publicationEpoch: 'name-test',
    snapshotVersion: 1,
    activeGroupId: 'g',
    activeTabId: 't',
    activeTabType: 'terminal',
    tabs: [
      {
        type: 'terminal',
        id: `t::${LEAF}`,
        title: 'Codex',
        parentTabId: 't',
        leafId: LEAF,
        isActive: true,
        status: 'ready',
        terminal: 'terminal-1',
        agentStatus: {
          state: 'working',
          prompt: 'Task',
          agentType: 'codex',
          updatedAt: 100,
          stateStartedAt: 100,
          paneKey: `t:${LEAF}`,
          tabId: 't',
          worktreeId: 'wt-1',
          stateHistory: [],
          providerSession
        }
      }
    ]
  }
  const decision = decideWebSessionTabsSnapshot(snapshot, 'paired')
  applyWebSessionTabsStorePatch(
    (state) => applyWebSessionTabsSnapshot(state, snapshot, 'paired', 100),
    { frames: [{ environmentId: 'paired', worktreeId: snapshot.worktree, decision }] },
    snapshot,
    true
  )
  expect(observe).toHaveBeenCalledWith(
    expect.objectContaining({
      payload: expect.objectContaining({ providerSession })
    })
  )
})
