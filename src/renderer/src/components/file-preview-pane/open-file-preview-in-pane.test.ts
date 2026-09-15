import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openFilePreviewInSourcePane } from './open-file-preview-in-pane'

const mocks = vi.hoisted(() => {
  const state: {
    browserAvailability:
      | { state: 'enabled'; provider: 'local-client' | 'paired-runtime' }
      | { state: 'hidden'; reason: string }
    createBrowserTab: ReturnType<typeof vi.fn>
    createEmptySplitGroup: ReturnType<typeof vi.fn>
    setActiveBrowserTab: ReturnType<typeof vi.fn>
    activateTab: ReturnType<typeof vi.fn>
    focusGroup: ReturnType<typeof vi.fn>
    environmentId: string | null
    connectionId: string | null
    activeGroupIdByWorktree: Record<string, string>
    groupsByWorktree: Record<string, { id: string }[]>
    browserTabsByWorktree: Record<string, unknown[]>
    toastError: ReturnType<typeof vi.fn>
  } = {
    browserAvailability: { state: 'enabled', provider: 'local-client' },
    createBrowserTab: vi.fn(),
    createEmptySplitGroup: vi.fn(() => 'group-right'),
    setActiveBrowserTab: vi.fn(),
    activateTab: vi.fn(),
    focusGroup: vi.fn(),
    environmentId: null,
    connectionId: null,
    activeGroupIdByWorktree: {},
    groupsByWorktree: {},
    browserTabsByWorktree: {},
    toastError: vi.fn()
  }
  return state
})

vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))

vi.mock('@/lib/client-creation-action-policy', () => ({
  getClientCreationActionPolicy: () => ({ 'managed-browser': mocks.browserAvailability })
}))

vi.mock('@/lib/worktree-runtime-owner', () => ({
  getRuntimeEnvironmentIdForWorktree: () => mocks.environmentId
}))

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      createBrowserTab: mocks.createBrowserTab,
      createEmptySplitGroup: mocks.createEmptySplitGroup,
      setActiveBrowserTab: mocks.setActiveBrowserTab,
      activateTab: mocks.activateTab,
      focusGroup: mocks.focusGroup,
      activeWorktreeId: 'wt-1',
      activeGroupIdByWorktree: mocks.activeGroupIdByWorktree,
      groupsByWorktree: mocks.groupsByWorktree,
      browserTabsByWorktree: mocks.browserTabsByWorktree,
      browserPagesByWorkspace: {},
      unifiedTabsByWorktree: {},
      layoutByWorktree: {},
      getKnownWorktreeById: () => ({ id: 'wt-1', path: '/repo' }),
      repos: [{ id: 'repo-1', connectionId: mocks.connectionId }],
      worktreesByRepo: { 'repo-1': [{ id: 'wt-1', repoId: 'repo-1' }] }
    })
  }
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.browserAvailability = { state: 'enabled', provider: 'local-client' }
  mocks.environmentId = null
  mocks.connectionId = null
  mocks.activeGroupIdByWorktree = {}
  mocks.groupsByWorktree = {}
  mocks.browserTabsByWorktree = {}
})

const htmlPreview = {
  language: 'html',
  filePath: '/repo/report.html',
  worktreeId: 'wt-1'
}

describe('openFilePreviewInSourcePane', () => {
  it('opens the preview in the calling pane and switches to it, without splitting', () => {
    openFilePreviewInSourcePane({ ...htmlPreview, sourceGroupId: 'group-1' })

    expect(mocks.createEmptySplitGroup).not.toHaveBeenCalled()
    expect(mocks.createBrowserTab).toHaveBeenCalledWith('wt-1', 'file:///repo/report.html', {
      title: 'report.html',
      targetGroupId: 'group-1',
      activate: true
    })
  })

  it('falls back to the pane the reader is in when the caller cannot name its group', () => {
    mocks.activeGroupIdByWorktree = { 'wt-1': 'group-active' }

    openFilePreviewInSourcePane({ ...htmlPreview, sourceGroupId: null })

    expect(mocks.createBrowserTab).toHaveBeenCalledWith(
      'wt-1',
      'file:///repo/report.html',
      expect.objectContaining({ targetGroupId: 'group-active' })
    )
  })

  it('keeps a remote workspace on the locally rendered document tab, still in the calling pane', () => {
    mocks.connectionId = 'ssh-1'

    openFilePreviewInSourcePane({ ...htmlPreview, sourceGroupId: 'group-1' })

    expect(mocks.createBrowserTab).toHaveBeenCalledWith(
      'wt-1',
      'data:text/html,',
      expect.objectContaining({
        docLocation: { kind: 'workspace-doc', worktreeId: 'wt-1', filePath: '/repo/report.html' },
        targetGroupId: 'group-1',
        browserRuntimeEnvironmentId: null,
        activate: true
      })
    )
  })

  it('reports why a preview is impossible instead of opening an empty tab', () => {
    mocks.browserAvailability = { state: 'hidden', reason: 'Managed browser is off.' }

    openFilePreviewInSourcePane({ ...htmlPreview, sourceGroupId: 'group-1' })

    expect(mocks.toastError).toHaveBeenCalledWith('Managed browser is off.')
    expect(mocks.createBrowserTab).not.toHaveBeenCalled()
  })

  it('ignores languages that have no rendered form', () => {
    openFilePreviewInSourcePane({
      ...htmlPreview,
      language: 'typescript',
      filePath: '/repo/index.ts',
      sourceGroupId: 'group-1'
    })

    expect(mocks.createBrowserTab).not.toHaveBeenCalled()
    expect(mocks.toastError).not.toHaveBeenCalled()
  })
})
