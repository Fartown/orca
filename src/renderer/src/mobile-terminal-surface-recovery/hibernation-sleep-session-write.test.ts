import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getHibernationPtyBindingFirstSeenAtByPaneKey,
  observeHibernationPtyBindings,
  resetHibernationPaneAgeForTests
} from '@/lib/agent-session/hibernation/agent-hibernation-pane-age'
import { DEFAULT_AGENT_HIBERNATION_IDLE_MS } from '@/lib/agent-session/hibernation/agent-hibernation-planner'
import { windowAcknowledgedSessionEntries } from '@/lib/workspace/persistence/workspace-session-acknowledged-entries'
import { makeWorktree } from '@/store/slices/worktrees/worktree.test-fixture'
import { makeTab } from '@/store/terminals/testing/terminal-tab.test-fixture'
import { createTestStore, seedStore } from '@/store/testing/app-store-test-fixture'

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() }
}))
vi.mock('@/components/terminal-pane/pty-transport/delivery/pty-dispatcher', () => ({}))
vi.mock('@/components/terminal-pane/pty-transport/shutdown/pty-shutdown-data-suspension', () => ({
  restorePtyDataHandlersAfterFailedShutdown: vi.fn(),
  unregisterPtyDataHandlers: vi.fn(() => [])
}))

const WORKTREE = 'repo1::/path/wt1'
const TAB_ID = 'tab-1'
const LEAF_ID = '11111111-1111-4111-8111-111111111111'
const PANE_KEY = `${TAB_ID}:${LEAF_ID}`
const PTY_ID = `${WORKTREE}@@a1b2c3d4`

function seedDoneAgentStore(opts?: {
  worktreeId?: string
  repoId?: string
  connectionId?: string
}) {
  const repoId = opts?.repoId ?? 'repo1'
  const worktreeId = opts?.worktreeId ?? WORKTREE
  const ptyId = `${worktreeId}@@a1b2c3d4`
  const store = createTestStore()
  seedStore(store, {
    workspaceSessionReady: true,
    hydrationSucceeded: true,
    repos: [
      {
        id: repoId,
        path: '/path/wt1',
        displayName: 'repo1',
        badgeColor: '#000',
        addedAt: 1,
        ...(opts?.connectionId ? { connectionId: opts.connectionId } : {})
      }
    ],
    worktreesByRepo: {
      [repoId]: [makeWorktree({ id: worktreeId, repoId, path: '/path/wt1' })]
    },
    tabsByWorktree: {
      [worktreeId]: [makeTab({ id: TAB_ID, worktreeId, title: 'Claude', ptyId })]
    },
    terminalLayoutsByTabId: {
      [TAB_ID]: {
        root: { type: 'leaf', leafId: LEAF_ID },
        activeLeafId: LEAF_ID,
        expandedLeafId: null,
        ptyIdsByLeafId: { [LEAF_ID]: ptyId }
      }
    },
    ptyIdsByTabId: { [TAB_ID]: [ptyId] }
  })
  store
    .getState()
    .setAgentStatus(
      PANE_KEY,
      { state: 'done', prompt: 'finish task', agentType: 'claude', lastAssistantMessage: 'done' },
      'Claude',
      { updatedAt: 2_000, stateStartedAt: 1_000 },
      { tabId: TAB_ID, worktreeId },
      { providerSession: { key: 'session_id', id: 'claude-session-1' } }
    )
  return { store, worktreeId, ptyId }
}

describe('hibernation sleep session write and pane age reset', () => {
  let ptyKill: ReturnType<typeof vi.fn>
  let patchEntries: ReturnType<typeof vi.fn>
  let sessionPatch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    resetHibernationPaneAgeForTests()
    windowAcknowledgedSessionEntries.forget()
    ptyKill = vi.fn().mockResolvedValue(undefined)
    patchEntries = vi.fn().mockResolvedValue({ status: 'applied' })
    sessionPatch = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('window', {
      api: {
        pty: { kill: ptyKill },
        session: {
          patch: sessionPatch,
          patchEntries,
          set: vi.fn().mockResolvedValue(undefined),
          flush: vi.fn().mockResolvedValue(undefined)
        }
      }
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('flushes worktree-sleep via patchEntries before pty.kill and skips sleeping panes across 60s coordinator ticks', async () => {
    const order: string[] = []
    patchEntries.mockImplementation(async (patch: Record<string, unknown>) => {
      order.push('session.patchEntries')
      expect(patch).toMatchObject({
        fields: {
          sleepingAgentSessionsByPaneKey: {
            [PANE_KEY]: { origin: 'worktree-sleep' }
          }
        }
      })
      return { status: 'applied' }
    })
    ptyKill.mockImplementation(async () => {
      order.push('pty.kill')
    })

    const { store } = seedDoneAgentStore()
    const initialSeenAt = 10_000
    observeHibernationPtyBindings({
      tabsByWorktree: store.getState().tabsByWorktree,
      terminalLayoutsByTabId: store.getState().terminalLayoutsByTabId,
      sleepingAgentSessionsByPaneKey: store.getState().sleepingAgentSessionsByPaneKey,
      now: initialSeenAt,
      idleMs: DEFAULT_AGENT_HIBERNATION_IDLE_MS
    })
    expect(getHibernationPtyBindingFirstSeenAtByPaneKey()[PANE_KEY]).toBe(initialSeenAt)

    await store.getState().shutdownCompletedAgentPaneForHibernation(WORKTREE, {
      paneKey: PANE_KEY,
      tabId: TAB_ID,
      leafId: LEAF_ID,
      ptyId: PTY_ID
    })

    expect(order).toEqual(['session.patchEntries', 'pty.kill'])
    expect(getHibernationPtyBindingFirstSeenAtByPaneKey()[PANE_KEY]).toBeUndefined()

    // 60s ticks while still asleep must NOT re-insert the retained ptyIdsByLeafId binding.
    observeHibernationPtyBindings({
      tabsByWorktree: store.getState().tabsByWorktree,
      terminalLayoutsByTabId: store.getState().terminalLayoutsByTabId,
      sleepingAgentSessionsByPaneKey: store.getState().sleepingAgentSessionsByPaneKey,
      now: initialSeenAt + 60_000,
      idleMs: DEFAULT_AGENT_HIBERNATION_IDLE_MS
    })
    expect(getHibernationPtyBindingFirstSeenAtByPaneKey()[PANE_KEY]).toBeUndefined()

    // Once woken (sleeping record removed), the reused PTY id starts a fresh grace window.
    store.setState({ sleepingAgentSessionsByPaneKey: {} })
    const wakeSeenAt = initialSeenAt + DEFAULT_AGENT_HIBERNATION_IDLE_MS + 120_000
    observeHibernationPtyBindings({
      tabsByWorktree: store.getState().tabsByWorktree,
      terminalLayoutsByTabId: store.getState().terminalLayoutsByTabId,
      sleepingAgentSessionsByPaneKey: store.getState().sleepingAgentSessionsByPaneKey,
      now: wakeSeenAt,
      idleMs: DEFAULT_AGENT_HIBERNATION_IDLE_MS
    })
    expect(getHibernationPtyBindingFirstSeenAtByPaneKey()[PANE_KEY]).toBe(wakeSeenAt)
  })

  it('aborts and rolls back main without killing if user input arrives while the pre-flush IPC is in flight', async () => {
    const { store } = seedDoneAgentStore()
    const deferred: { release?: () => void; markEntered?: () => void } = {}
    const flushStarted = new Promise<void>((resolve) => {
      deferred.markEntered = resolve
    })
    patchEntries.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          deferred.release = () => resolve({ status: 'applied' })
          deferred.markEntered?.()
        })
    )

    const hibernation = store.getState().shutdownCompletedAgentPaneForHibernation(WORKTREE, {
      paneKey: PANE_KEY,
      tabId: TAB_ID,
      leafId: LEAF_ID,
      ptyId: PTY_ID
    })

    await flushStarted
    // While pre-flush is pending, renderer exit guards are not armed yet and user types into the pane.
    expect(store.getState().suppressedPtyExitIds[PTY_ID]).toBeUndefined()
    store.setState({ lastTerminalInputAtByPaneKey: { [PANE_KEY]: 999_999 } })
    deferred.release?.()

    await expect(hibernation).rejects.toThrow('agent_hibernation_state_changed_during_flush')
    expect(ptyKill).not.toHaveBeenCalled()
    expect(store.getState().suppressedPtyExitIds[PTY_ID]).toBeUndefined()
    expect(store.getState().sleepingAgentSessionsByPaneKey[PANE_KEY]?.origin).toBe('live')
    // Second patchEntries call rolls main back from worktree-sleep to the live anchor record.
    expect(patchEntries).toHaveBeenCalledTimes(2)
    expect(patchEntries.mock.calls[1]?.[0]).toMatchObject({
      entries: {
        sleepingAgentSessionsByPaneKey: {
          set: { [PANE_KEY]: { origin: 'live' } }
        }
      }
    })
  })

  it('fails closed without killing the PTY when main returns status skipped', async () => {
    patchEntries.mockResolvedValueOnce({ status: 'skipped' })
    const { store } = seedDoneAgentStore()

    await expect(
      store.getState().shutdownCompletedAgentPaneForHibernation(WORKTREE, {
        paneKey: PANE_KEY,
        tabId: TAB_ID,
        leafId: LEAF_ID,
        ptyId: PTY_ID
      })
    ).rejects.toThrow('sleeping_agent_session_write_skipped')

    expect(ptyKill).not.toHaveBeenCalled()
    expect(store.getState().sleepingAgentSessionsByPaneKey[PANE_KEY]?.origin).toBe('live')
  })

  it('clears the last worktree-sleep record on an SSH host partition when pty.kill fails and rolls back', async () => {
    const sshWorktree = 'ssh-repo::/remote/wt1'
    const { store, ptyId } = seedDoneAgentStore({
      repoId: 'ssh-repo',
      worktreeId: sshWorktree,
      connectionId: 'devbox'
    })
    // Start with no prior sleeping records on the SSH host partition so rollback empties it completely.
    store.setState({ sleepingAgentSessionsByPaneKey: {} })
    ptyKill.mockRejectedValueOnce(new Error('kill_failed'))

    await expect(
      store.getState().shutdownCompletedAgentPaneForHibernation(sshWorktree, {
        paneKey: PANE_KEY,
        tabId: TAB_ID,
        leafId: LEAF_ID,
        ptyId
      })
    ).rejects.toThrow('kill_failed')

    expect(patchEntries).toHaveBeenCalledTimes(2)
    expect(patchEntries.mock.calls[0]?.[1]).toBe('ssh:devbox')
    expect(patchEntries.mock.calls[1]?.[1]).toBe('ssh:devbox')
    expect(patchEntries.mock.calls[1]?.[0]).toMatchObject({
      entries: {
        sleepingAgentSessionsByPaneKey: { remove: [PANE_KEY] }
      }
    })
    expect(store.getState().sleepingAgentSessionsByPaneKey[PANE_KEY]).toBeUndefined()
  })
})
