import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bindHandleReattachResult } from '@/components/terminal-pane/pty-connection/reattach/reattach-result-handler'
import type { ConnectPanePtySession } from '@/components/terminal-pane/pty-connection/connect-pane-pty-session'

// An absent attach reply is not proof of exit; only a host-reported expiry may replace the terminal.
const mocks = vi.hoisted(() => ({
  state: {
    tabsByWorktree: {},
    terminalLayoutsByTabId: {},
    agentLaunchConfigByPaneKey: {},
    agentStatusByPaneKey: new Map()
  }
}))

vi.mock('@/store/index', () => ({
  useAppStore: { getState: () => mocks.state }
}))
vi.mock('@/lib/agent-session/accounts/codex/codex-stale-pane-sweep', () => ({
  notifyCodexPaneBoundForStaleSweep: vi.fn()
}))
vi.mock('@/runtime/sync-runtime-graph/graph-sync-scheduler', () => ({
  scheduleRuntimeGraphSync: vi.fn()
}))

function buildSession(ptyId: string | null = 'pty-1'): ConnectPanePtySession {
  const transport = {
    getPtyId: () => ptyId,
    disconnect: vi.fn(),
    serializeBuffer: vi.fn()
  }
  const session = {
    settlePaneAttachAttempt: vi.fn(),
    transport,
    disposed: false,
    transportStreamGeneration: 0,
    authoritativeReattachGeneration: 0,
    cacheKey: 'tab-1:leaf-1',
    paneStartup: null,
    pane: { id: 'pane-1', leafId: 'leaf-1', terminal: {} },
    deps: {
      tabId: 'tab-1',
      worktreeId: 'wt-1',
      paneTransportsRef: { current: new Map([['pane-1', transport]]) },
      isVisibleRef: { current: true },
      clearTabPtyId: vi.fn(),
      updateTabPtyId: vi.fn(),
      restoredLeafId: null
    },
    registerEffectiveLaunchConfig: vi.fn(),
    cancelSavedResumeStartup: vi.fn(),
    clearExitedPanePtyLayoutBinding: vi.fn(),
    syncPanePtyLayoutBinding: vi.fn(),
    startFreshColdRestoreAgentResume: vi.fn(),
    setPanePtyFitBinding: vi.fn(),
    reportPanePtyVisibility: vi.fn(),
    registerSideEffectFactConsumerForPty: vi.fn(),
    syncHiddenRendererPtyDelivery: vi.fn()
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test bag covers every member handleReattachResult reads on these paths.
  const bag = session as unknown as ConnectPanePtySession
  bindHandleReattachResult(bag)
  return bag
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('handleReattachResult recovery settle', () => {
  it('retains the recorded terminal when the reattach returned no PTY id', async () => {
    const session = buildSession(null)

    await expect(session.handleReattachResult(undefined, null)).resolves.toBe(false)

    expect(session.settlePaneAttachAttempt).not.toHaveBeenCalledWith('success')
    expect(session.startFreshColdRestoreAgentResume).not.toHaveBeenCalled()
    expect(session.deps.clearTabPtyId).not.toHaveBeenCalled()
    expect(session.syncPanePtyLayoutBinding).not.toHaveBeenCalledWith(null)
    expect(session.settlePaneAttachAttempt).toHaveBeenCalledWith('failed')
  })

  it('replaces the terminal only after the host reports the session expired', async () => {
    const session = buildSession()

    await expect(
      session.handleReattachResult({ id: 'pty-1', sessionExpired: true }, 'pty-old')
    ).resolves.toBe(false)

    expect(session.clearExitedPanePtyLayoutBinding).toHaveBeenCalledWith('pty-old')
    expect(session.deps.clearTabPtyId).toHaveBeenCalledWith('tab-1', 'pty-old')
    expect(session.startFreshColdRestoreAgentResume).toHaveBeenCalledOnce()
    expect(session.settlePaneAttachAttempt).not.toHaveBeenCalledWith('success')
  })
})
