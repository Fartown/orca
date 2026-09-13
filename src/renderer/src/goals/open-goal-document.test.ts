// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { openGoalDocument } from './open-goal-document'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'

const { openFile } = vi.hoisted(() => ({ openFile: vi.fn() }))
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({ openFile, settings: { activeRuntimeEnvironmentId: 'remote' } })
  }
}))
vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorkspace: vi.fn(() => ({ primaryTabId: null }))
}))
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

it('authorizes the actual local file and uses the existing permanent Markdown preview tab', async () => {
  const authorizeExternalPath = vi.fn(async () => {})
  vi.stubGlobal('api', { fs: { authorizeExternalPath } })
  await openGoalDocument('/drafts/验收 文档.md', 'folder:local')
  expect(authorizeExternalPath).toHaveBeenCalledWith({ targetPath: '/drafts/验收 文档.md' })
  expect(activateAndRevealWorkspace).toHaveBeenCalledWith('folder:local', {
    providesInitialSurface: true,
    executionHostId: 'local'
  })
  expect(openFile).toHaveBeenCalledWith(
    {
      filePath: '/drafts/验收 文档.md',
      relativePath: '验收 文档.md',
      worktreeId: 'folder:local',
      language: 'markdown',
      mode: 'markdown-preview',
      readOnly: true,
      runtimeEnvironmentId: null
    },
    { preview: false, suppressActiveRuntimeFallback: true, forceContentReload: true }
  )
})

it('surfaces an authorization failure without opening an unusable tab', async () => {
  vi.stubGlobal('api', {
    fs: {
      authorizeExternalPath: vi.fn(async () => {
        throw new Error('missing')
      })
    }
  })
  await expect(openGoalDocument('/missing.md', 'folder:local')).rejects.toThrow('missing')
  expect(openFile).not.toHaveBeenCalled()
  expect(activateAndRevealWorkspace).not.toHaveBeenCalled()
})

it('keeps the editor available when its workspace cannot be activated', async () => {
  vi.stubGlobal('api', { fs: { authorizeExternalPath: vi.fn(async () => {}) } })
  vi.mocked(activateAndRevealWorkspace).mockReturnValueOnce(false)
  await expect(openGoalDocument('/drafts/acceptance.md', 'missing-workspace')).rejects.toThrow(
    'workspace could not be opened'
  )
  expect(openFile).not.toHaveBeenCalled()
})
