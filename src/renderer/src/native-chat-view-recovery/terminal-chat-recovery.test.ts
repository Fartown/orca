import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  registerTerminalPaneRecoveryInstance,
  requestTerminalPaneRecovery
} from '../components/terminal-pane/render-health/recovery/terminal-pane-recovery'
import {
  recoveryLedgerMocks as mocks,
  resetRecoveryLedgerStore,
  setTerminalTabs
} from '../components/terminal-pane/render-health/recovery/terminal-recovery-ledger-test-store'

vi.mock('@/store', async () => {
  const store =
    await import('../components/terminal-pane/render-health/recovery/terminal-recovery-ledger-test-store')
  return { useAppStore: { getState: () => store.recoveryLedgerStoreState() } }
})

// Why: the ledger store reaches this module through store lookups, so importing the store here would cycle.
vi.mock('@/diagnostics/crash-reporting/crash-breadcrumb-recorder', () => ({
  recordRendererCrashBreadcrumb: vi.fn()
}))

const releases: (() => void)[] = []

beforeEach(() => {
  resetRecoveryLedgerStore()
  setTerminalTabs([{ id: 'tab-1', viewMode: 'chat' }])
  mocks.getTab.mockReturnValue({ viewMode: 'chat' })
  vi.stubGlobal('window', { api: { pty: { hasPty: mocks.hasPty } } })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  releases.splice(0).forEach((release) => release())
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function registerView(tabId = 'tab-1') {
  const view = { visible: true, terminalBacked: true }
  const instance = registerTerminalPaneRecoveryInstance(
    tabId,
    () => view.visible && view.terminalBacked
  )
  releases.push(instance.unregister)
  return { view, instance }
}

describe('terminal-backed chat recovery admission', () => {
  it.each(['local@@pty-1', 'ssh:host@@pty-1', 'remote:host@@terminal-1'])(
    'recovers the current visible chat after its owner rejects input: %s',
    async (ptyId) => {
      const { instance } = registerView()
      expect(
        await requestTerminalPaneRecovery({
          tabId: 'tab-1',
          ptyId,
          reason: 'input-rejected-by-host',
          terminalRecoveryInstanceId: instance.id
        })
      ).toBe(true)
      expect(mocks.remountTerminalTabForRecovery).toHaveBeenCalledOnce()
      expect(mocks.hasPty).not.toHaveBeenCalled()
    }
  )

  it('admits an unbound chat without requiring a terminal view toggle', async () => {
    const { instance } = registerView()
    expect(
      await requestTerminalPaneRecovery({
        tabId: 'tab-1',
        ptyId: null,
        reason: 'spawn-left-pane-unbound',
        terminalRecoveryInstanceId: instance.id
      })
    ).toBe(true)
    expect(mocks.hasPty).not.toHaveBeenCalled()
  })

  it('uses the same admission for a folder workspace', async () => {
    mocks.state.tabsByWorktree = { 'folder:fixture': [{ id: 'tab-1', viewMode: 'chat' }] }
    const { instance } = registerView()
    expect(
      await requestTerminalPaneRecovery({
        tabId: 'tab-1',
        ptyId: null,
        reason: 'spawn-left-pane-unbound',
        terminalRecoveryInstanceId: instance.id
      })
    ).toBe(true)
    expect(mocks.remountTerminalTabForRecovery).toHaveBeenCalledOnce()
  })

  it.each(['visible', 'terminalBacked'] as const)(
    'refuses recovery after the current view loses %s',
    async (field) => {
      const { view, instance } = registerView()
      view[field] = false
      expect(
        await requestTerminalPaneRecovery({
          tabId: 'tab-1',
          ptyId: null,
          reason: 'spawn-left-pane-unbound',
          terminalRecoveryInstanceId: instance.id
        })
      ).toBe(false)
      expect(mocks.remountTerminalTabForRecovery).not.toHaveBeenCalled()
    }
  )

  it('rejects a disposed instance and an instance belonging to another tab', async () => {
    const { instance } = registerView()
    instance.unregister()
    const other = registerView('tab-2').instance
    for (const id of [instance.id, other.id]) {
      expect(
        await requestTerminalPaneRecovery({
          tabId: 'tab-1',
          ptyId: null,
          reason: 'spawn-left-pane-unbound',
          terminalRecoveryInstanceId: id
        })
      ).toBe(false)
    }
    expect(mocks.remountTerminalTabForRecovery).not.toHaveBeenCalled()
  })

  it('retains the ownership guard for chat requests without a mounted terminal view', async () => {
    expect(
      await requestTerminalPaneRecovery({
        tabId: 'tab-1',
        ptyId: null,
        reason: 'spawn-left-pane-unbound'
      })
    ).toBe(false)
    expect(mocks.remountTerminalTabForRecovery).not.toHaveBeenCalled()
  })

  it('rechecks the chat owner after awaiting terminal liveness', async () => {
    const { view, instance } = registerView()
    const liveness = Promise.withResolvers<boolean>()
    mocks.hasPty.mockReturnValueOnce(liveness.promise)
    const recovery = requestTerminalPaneRecovery({
      tabId: 'tab-1',
      ptyId: 'local@@pty-1',
      reason: 'input-undeliverable',
      terminalRecoveryInstanceId: instance.id
    })
    expect(mocks.hasPty).toHaveBeenCalledOnce()
    view.visible = false
    liveness.resolve(true)
    expect(await recovery).toBe(false)
    expect(mocks.remountTerminalTabForRecovery).not.toHaveBeenCalled()
  })
})
