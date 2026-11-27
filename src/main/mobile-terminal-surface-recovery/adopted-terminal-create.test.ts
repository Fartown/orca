import { expect, it, vi } from 'vitest'
import '../../fork-test-support/main/runtime/construction/test-context/orca-runtime-test-lifecycle.spec'
import '../../fork-test-support/main/runtime/construction/test-context/runtime-test-module-registration.spec'
import { OrcaRuntimeService } from '../runtime/orca-runtime'
import { electronMocks } from '../../fork-test-support/main/runtime/orca-runtime-test-mocks/setup.spec'
import {
  TEST_WORKTREE_ID,
  store
} from '../../fork-test-support/main/runtime/construction/test-context/orca-runtime-test-fixtures.spec'

it.each(['background', 'adopted', 'replaced'] as const)(
  'publishes only the created incarnation after reveal: %s',
  async (timing) => {
    const runtime = new OrcaRuntimeService(store)
    const tabId = '78118dfd-fbc3-40ef-80f3-7db5f04ef380'
    const leafId = '542613c1-68f2-4536-b459-6a1f7df209fd'
    const ptyId = `${TEST_WORKTREE_ID}@@adopt`
    electronMocks.BrowserWindow.fromId.mockReturnValue({
      isDestroyed: () => false,
      webContents: { send: vi.fn() }
    })
    runtime.attachWindow(1)
    runtime.syncWindowGraph(1, { tabs: [], leaves: [] })
    const spawn = vi.fn().mockResolvedValue({ id: ptyId, incarnationId: 'first' })
    runtime.setPtyController({
      spawn,
      write: () => true,
      kill: () => true,
      getForegroundProcess: async () => null
    })
    runtime.setNotifier({
      worktreesChanged: vi.fn(),
      reposChanged: vi.fn(),
      activateWorktree: vi.fn(),
      createTerminal: vi.fn(),
      splitTerminal: vi.fn(),
      renameTerminal: vi.fn(),
      focusTerminal: vi.fn(),
      closeTerminal: vi.fn(),
      terminalFitOverrideChanged: vi.fn(),
      terminalDriverChanged: vi.fn(),
      revealTerminalSession: async () => {
        if (timing !== 'background') {
          runtime.syncWindowGraph(1, {
            tabs: [
              {
                tabId,
                worktreeId: TEST_WORKTREE_ID,
                title: 'Restored',
                activeLeafId: leafId,
                layout: null
              }
            ],
            leaves: [{ tabId, leafId, worktreeId: TEST_WORKTREE_ID, paneRuntimeId: 1, ptyId }]
          })
        }
        return { tabId }
      }
    })
    const created = runtime['createRuntimeOwnedMobileSessionTerminal'](
      TEST_WORKTREE_ID,
      false,
      undefined,
      {
        identity: { tabId, leafId, sessionId: ptyId },
        command: 'echo restored',
        onPtyCreated: () => {
          if (timing === 'replaced') {
            runtime.registerPty(ptyId, TEST_WORKTREE_ID, null, {
              tabId,
              leafId,
              incarnationId: 'replacement'
            })
          }
        }
      }
    )
    if (timing === 'replaced') {
      await expect(created).rejects.toThrow('terminal_handle_stale')
      expect(spawn).toHaveBeenCalledTimes(1)
      return
    }
    const result = await created
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(result.tab).toMatchObject({ parentTabId: tabId, leafId })
    expect(await runtime.showTerminal(result.tab.terminal!)).toMatchObject({
      ptyId,
      connected: true,
      writable: true
    })
  }
)
