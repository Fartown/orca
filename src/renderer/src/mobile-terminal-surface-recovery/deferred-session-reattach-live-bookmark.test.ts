import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectPanePtySession } from '@/components/terminal-pane/pty-connection/connect-pane-pty-session'
import { runDeferredSessionReattachChoice } from '@/components/terminal-pane/pty-connection/reattach/deferred-session-reattach-choice'

// A mirrored remote pane whose attach throws keeps its recorded PTY: loss of contact is not proof of exit.

const TAB_ID = 'web-terminal-tab-1'
const LEAF_ID = 'leaf-1'
const ENV_ID = 'env-1'
const REMOTE_PTY_ID = `remote:${ENV_ID}@@term_1`
const WORKTREE_ID = 'repo-1::/workspaces/wt-1'

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  startDeferredSessionReattach: vi.fn()
}))

vi.mock('@/store/index', () => ({
  useAppStore: { getState: () => mocks.state }
}))
vi.mock('@/runtime/sync-runtime-graph/graph-sync-scheduler', () => ({
  scheduleRuntimeGraphSync: vi.fn()
}))
vi.mock('@/components/terminal-pane/pty-transport/delivery/pty-dispatcher', () => ({
  getEagerPtyBufferHandle: () => null
}))
vi.mock('@/components/terminal-pane/pty-connection/spawn/hidden-agent-resume-deferral', () => ({
  startDeferredSessionReattachUnlessHiddenAgentResume: mocks.startDeferredSessionReattach
}))

function setStore(): void {
  mocks.state = {
    tabsByWorktree: { [WORKTREE_ID]: [{ id: TAB_ID, ptyId: REMOTE_PTY_ID }] },
    ptyIdsByTabId: { [TAB_ID]: [REMOTE_PTY_ID] },
    sleepingAgentSessionsByPaneKey: {},
    runtimeStatusByEnvironmentId: new Map()
  }
}

function buildSession(): ConnectPanePtySession {
  const paneKey = `${TAB_ID}:${LEAF_ID}`
  const transport = {
    attach: vi.fn(() => {
      throw new Error('connection interrupted')
    }),
    getPtyId: () => null
  }
  const session = {
    pane: { id: 1, leafId: LEAF_ID },
    cacheKey: paneKey,
    pendingSpawnKey: paneKey,
    tabGeneration: 0,
    transport,
    transportStreamGeneration: 0,
    cols: 80,
    rows: 24,
    disposed: false,
    hadExistingPaneTransportAtConnect: false,
    mountFollowsTerminalPark: false,
    runtimeEnvironmentId: ENV_ID,
    connectionId: null,
    allowInitialIdleCacheSeed: true,
    deps: {
      tabId: TAB_ID,
      worktreeId: WORKTREE_ID,
      restoredLeafId: LEAF_ID,
      restoredPtyIdByLeafId: { [LEAF_ID]: REMOTE_PTY_ID },
      paneTransportsRef: { current: new Map([[1, transport]]) },
      clearTabPtyId: vi.fn()
    },
    getSleepingRecordForPane: () => null,
    buildColdRestoreAgentResumeStartup: vi.fn(() => null),
    syncPanePtyLayoutBinding: vi.fn(),
    clearPaneMode2031State: vi.fn(),
    clearHiddenOutputRestoreState: vi.fn(),
    captureTransportOutputCallbacks: vi.fn(() => ({ callbacks: {}, generation: 0 })),
    bindActivePanePty: vi.fn(),
    registerPaneSerializerFor: vi.fn(),
    reportError: vi.fn(),
    settlePaneAttachAttempt: vi.fn(),
    startFreshSpawn: vi.fn(),
    startFreshColdRestoreAgentResume: vi.fn()
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test bag covers every member runDeferredSessionReattachChoice reads.
  return session as unknown as ConnectPanePtySession
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('deferred reattach choice: attach failure without proof of exit', () => {
  it('retains a live binding when transport attachment throws', () => {
    setStore()
    const session = buildSession()

    runDeferredSessionReattachChoice(session)

    expect(session.transport.attach).toHaveBeenCalledWith(
      expect.objectContaining({ existingPtyId: REMOTE_PTY_ID })
    )
    expect(session.reportError).toHaveBeenCalledWith('connection interrupted')
    expect(session.deps.clearTabPtyId).not.toHaveBeenCalled()
    expect(session.startFreshSpawn).not.toHaveBeenCalled()
    expect(session.startFreshColdRestoreAgentResume).not.toHaveBeenCalled()
    expect(session.settlePaneAttachAttempt).toHaveBeenCalledWith('failed')
    expect(mocks.startDeferredSessionReattach).not.toHaveBeenCalled()
  })
})
