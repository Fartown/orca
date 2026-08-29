import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  target: null as null | { paneKey: string; worktreeId: string; tabId: string; leafId: string },
  activateWorkspace: vi.fn(),
  focusPane: vi.fn(),
  setActiveTabType: vi.fn(),
  toastError: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(vi.fn(), {
    getState: () => ({ setActiveTabType: mocks.setActiveTabType })
  })
}))
vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorkspace: mocks.activateWorkspace
}))
vi.mock('@/lib/activate-tab-and-focus-pane', () => ({
  activateTabAndFocusPane: mocks.focusPane
}))
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))
vi.mock('./ai-vault-original-pane', () => ({
  findOriginalAiVaultSessionPane: () => mocks.target
}))

import { jumpToAiVaultOriginalPane } from './ai-vault-original-pane-actions'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.target = null
  mocks.activateWorkspace.mockReturnValue({ primaryTabId: null })
})

describe('jumpToAiVaultOriginalPane', () => {
  it('uses the shared workspace activator and exact tab/leaf focus path', () => {
    mocks.target = {
      paneKey: 'tab-1:leaf-1',
      worktreeId: 'folder:folder-1',
      tabId: 'tab-1',
      leafId: 'leaf-1'
    }

    expect(
      jumpToAiVaultOriginalPane({
        agent: 'codex',
        sessionId: 'session-1',
        executionHostId: 'ssh:build'
      })
    ).toBe('focused')

    expect(mocks.activateWorkspace).toHaveBeenCalledWith('folder:folder-1', {
      executionHostId: 'ssh:build'
    })
    expect(mocks.setActiveTabType).toHaveBeenCalledWith('terminal')
    expect(mocks.focusPane).toHaveBeenCalledWith('tab-1', 'leaf-1', {
      flashFocusedPane: true,
      scrollToBottomIfOutputSinceLastView: true
    })
  })

  it('allows a caller to probe without showing the right-sidebar missing-pane toast', () => {
    expect(
      jumpToAiVaultOriginalPane(
        { agent: 'codex', sessionId: 'session-1' },
        { notifyWhenMissing: false }
      )
    ).toBe('missing')
    expect(mocks.toastError).not.toHaveBeenCalled()
    expect(mocks.activateWorkspace).not.toHaveBeenCalled()
  })
})
