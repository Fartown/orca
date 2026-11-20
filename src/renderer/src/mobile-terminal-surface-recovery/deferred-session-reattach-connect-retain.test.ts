import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectPanePtySession } from '@/components/terminal-pane/pty-connection/connect-pane-pty-session'
import { startDeferredSessionReattach } from '@/components/terminal-pane/pty-connection/reattach/deferred-session-reattach-connect'

// A paired host's restored pane that cannot be reached keeps its binding; only a host-proven exit replaces it.

vi.mock('@/components/terminal-pane/layout/reconciliation/terminal-lifecycle-diagnostics', () => ({
  warnTerminalLifecycleAnomaly: vi.fn()
}))
vi.mock(
  '@/components/terminal-pane/pty-connection/instrumentation/pty-connect-diagnostics',
  () => ({
    recordPtyConnectDiagnostic: vi.fn()
  })
)

const PTY_ID = 'remote:env-1@@term_1'

function createSession(connect: () => Promise<unknown>) {
  const transport = { connect: vi.fn(connect), getPtyId: () => null }
  const fixture = {
    pane: { id: 1, leafId: 'leaf' },
    transport,
    disposed: false,
    transportStreamGeneration: 1,
    runtimeEnvironmentId: 'env-1',
    paneStartup: null,
    waitTeardowns: new Array<() => void>(),
    deps: {
      tabId: 'tab',
      worktreeId: 'wt',
      paneTransportsRef: { current: new Map([[1, transport]]) },
      isVisibleRef: { current: true },
      clearTabPtyId: vi.fn()
    },
    buildColdRestoreAgentResumeStartup: () => null,
    captureTransportOutputCallbacks: (reportError: (message: string) => void) => ({
      generation: 1,
      callbacks: { onError: reportError }
    }),
    beginReattachLiveDataDeferral: vi.fn(),
    finishReattachLiveDataDeferral: vi.fn(),
    shouldDeclareHiddenAtSpawn: () => false,
    mergeStartupEnvWithPaneIdentity: (env: Record<string, string>) => env,
    handleReattachResult: vi.fn().mockResolvedValue(true),
    clearExitedPanePtyLayoutBinding: vi.fn(),
    startFreshColdRestoreAgentResume: vi.fn().mockResolvedValue('fresh-pty'),
    startFreshSpawn: vi.fn(),
    reportError: vi.fn(),
    settlePaneAttachAttempt: vi.fn(),
    cols: 80,
    rows: 24,
    cacheKey: 'tab:leaf'
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: This fixture provides every session field the remote reattach reads.
  return { fixture, session: fixture as unknown as ConnectPanePtySession }
}

function expectRetained(fixture: ReturnType<typeof createSession>['fixture']): void {
  expect(fixture.startFreshColdRestoreAgentResume).not.toHaveBeenCalled()
  expect(fixture.startFreshSpawn).not.toHaveBeenCalled()
  expect(fixture.deps.clearTabPtyId).not.toHaveBeenCalled()
  expect(fixture.clearExitedPanePtyLayoutBinding).not.toHaveBeenCalled()
  expect(fixture.handleReattachResult).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('restored pane reattach without proof of exit', () => {
  it('retains the pane when reattach throws without proving an exit', async () => {
    const { fixture, session } = createSession(async () => {
      throw new Error('connection interrupted')
    })

    startDeferredSessionReattach(session, PTY_ID)

    await vi.waitFor(() => expect(fixture.settlePaneAttachAttempt).toHaveBeenCalledWith('failed'))
    expect(fixture.reportError).toHaveBeenCalledWith('connection interrupted')
    expectRetained(fixture)
  })

  it('retains the pane when reattach returns no reply and no PTY', async () => {
    const { fixture, session } = createSession(async () => undefined)

    startDeferredSessionReattach(session, PTY_ID)

    await vi.waitFor(() => expect(fixture.settlePaneAttachAttempt).toHaveBeenCalledWith('failed'))
    expectRetained(fixture)
  })
})
