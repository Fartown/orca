import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'

const mocks = vi.hoisted(() => ({
  target: null as null | { paneKey: string; worktreeId: string; tabId: string; leafId: string },
  activateWorktree: vi.fn(),
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
  activateAndRevealWorktree: mocks.activateWorktree
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
  mocks.activateWorktree.mockReturnValue(true)
})

describe('jumpToAiVaultOriginalPane', () => {
  it('preserves the native worktree activation and exact pane focus sequence', () => {
    mocks.target = {
      paneKey: 'tab-1:leaf-1',
      worktreeId: 'worktree-1',
      tabId: 'tab-1',
      leafId: 'leaf-1'
    }

    expect(jumpToAiVaultOriginalPane(session())).toBe('focused')
    expect(mocks.activateWorktree).toHaveBeenCalledWith('worktree-1')
    expect(mocks.setActiveTabType).toHaveBeenCalledWith('terminal')
    expect(mocks.focusPane).toHaveBeenCalledWith('tab-1', 'leaf-1', {
      flashFocusedPane: true,
      scrollToBottomIfOutputSinceLastView: true
    })
  })

  it('allows Issue lookup to suppress only the native missing-pane toast', () => {
    expect(jumpToAiVaultOriginalPane(session(), { notifyWhenMissing: false })).toBe('missing')
    expect(mocks.toastError).not.toHaveBeenCalled()

    expect(jumpToAiVaultOriginalPane(session())).toBe('missing')
    expect(mocks.toastError).toHaveBeenCalledWith('Original pane is no longer available.')
  })

  it('keeps the native unavailable-Workspace error and does not focus the pane', () => {
    mocks.target = {
      paneKey: 'tab-1:leaf-1',
      worktreeId: 'worktree-1',
      tabId: 'tab-1',
      leafId: 'leaf-1'
    }
    mocks.activateWorktree.mockReturnValue(false)

    expect(jumpToAiVaultOriginalPane(session())).toBe('workspace-unavailable')
    expect(mocks.toastError).toHaveBeenCalledWith('Worktree is no longer available.')
    expect(mocks.focusPane).not.toHaveBeenCalled()
  })
})

function session(): AiVaultSession {
  return {
    id: 'local:codex:session-1',
    executionHostId: 'local',
    agent: 'codex',
    sessionId: 'session-1',
    title: 'Session',
    cwd: '/workspace',
    branch: null,
    model: null,
    filePath: '/sessions/session-1.jsonl',
    codexHome: null,
    createdAt: null,
    updatedAt: null,
    modifiedAt: '2026-08-29T00:00:00.000Z',
    messageCount: 2,
    totalTokens: 1,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: 'codex resume session-1',
    subagent: null
  }
}
