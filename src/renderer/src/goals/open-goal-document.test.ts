// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { openGoalDocument } from './open-goal-document'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { requestHostPathGrantForContext } from '@/runtime-host-path/host-path-file-client'
import { statRuntimePath } from '@/runtime/runtime-file-metadata-client'

type StubState = {
  openFile: (...args: never[]) => unknown
  settings: { activeRuntimeEnvironmentId: string | null }
  worktreesByRepo: Record<string, { id: string; path: string }[]>
}
const { openFile, state } = vi.hoisted(() => {
  const openFile = vi.fn()
  const state: StubState = {
    openFile,
    settings: { activeRuntimeEnvironmentId: null },
    worktreesByRepo: {}
  }
  return { openFile, state }
})
vi.mock('@/store', () => ({ useAppStore: { getState: () => state } }))
vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorkspace: vi.fn(() => ({ primaryTabId: null }))
}))
vi.mock('@/lib/connection-owner-resolution', () => ({
  getConnectionIdForFileFromState: vi.fn(() => undefined)
}))
vi.mock('@/runtime/runtime-file-metadata-client', () => ({
  statRuntimePath: vi.fn(async () => ({ size: 1, isDirectory: false, mtime: 0 }))
}))
vi.mock('@/runtime-host-path/host-path-file-client', () => ({
  requestHostPathGrantForContext: vi.fn(async (_context: unknown, absolutePath: string) => ({
    grantId: 'grant-1',
    absolutePath
  }))
}))

beforeEach(() => {
  state.settings.activeRuntimeEnvironmentId = null
  state.worktreesByRepo = {}
  vi.stubGlobal('api', { fs: { authorizeExternalPath: vi.fn(async () => {}) } })
})
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

it('authorizes the actual local file and addresses it by its absolute path', async () => {
  await openGoalDocument('/drafts/验收 文档.md', 'folder:local')
  expect(window.api.fs.authorizeExternalPath).toHaveBeenCalledWith({
    targetPath: '/drafts/验收 文档.md'
  })
  expect(activateAndRevealWorkspace).toHaveBeenCalledWith('folder:local', {
    providesInitialSurface: true,
    executionHostId: 'local'
  })
  expect(openFile).toHaveBeenCalledWith(
    {
      filePath: '/drafts/验收 文档.md',
      // Why not a basename: the editor's reader only treats `relativePath === filePath` as a path
      // outside the worktree. A basename is resolved against the workspace root instead.
      relativePath: '/drafts/验收 文档.md',
      worktreeId: 'folder:local',
      language: 'markdown',
      mode: 'markdown-preview',
      readOnly: true,
      runtimeEnvironmentId: null
    },
    { preview: false, suppressActiveRuntimeFallback: true, forceContentReload: true }
  )
  expect(requestHostPathGrantForContext).not.toHaveBeenCalled()
})

it('keeps a document inside the workspace on its worktree-relative path', async () => {
  state.worktreesByRepo = { repo: [{ id: 'repo::/work', path: '/work' }] }
  await openGoalDocument('/work/docs/acceptance.md', 'repo::/work')
  expect(openFile).toHaveBeenCalledWith(
    expect.objectContaining({ relativePath: 'docs/acceptance.md' }),
    expect.anything()
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
  vi.mocked(activateAndRevealWorkspace).mockReturnValueOnce(false)
  await expect(openGoalDocument('/drafts/acceptance.md', 'missing-workspace')).rejects.toThrow(
    'workspace could not be opened'
  )
  expect(openFile).not.toHaveBeenCalled()
})

it('opens the remote absolute document on SSH without authorizing a client-local path', async () => {
  await openGoalDocument('/same/path/document.md', 'folder:remote', 'ssh:server')
  expect(window.api.fs.authorizeExternalPath).not.toHaveBeenCalled()
  expect(openFile).toHaveBeenCalledWith(
    expect.objectContaining({
      filePath: '/same/path/document.md',
      relativePath: '/same/path/document.md',
      externalSshTargetId: 'server',
      runtimeEnvironmentId: null
    }),
    expect.anything()
  )
  expect(activateAndRevealWorkspace).toHaveBeenCalledWith('folder:remote', {
    providesInitialSurface: true,
    executionHostId: 'ssh:server'
  })
})

it('grants the host path for a paired runtime, whose files RPC cannot name it', async () => {
  state.settings.activeRuntimeEnvironmentId = 'peer'
  await openGoalDocument('/host/.orca-goal/document.md', 'remote-worktree', 'runtime:peer')
  expect(requestHostPathGrantForContext).toHaveBeenCalledWith(
    expect.objectContaining({ worktreeId: 'remote-worktree' }),
    '/host/.orca-goal/document.md'
  )
  expect(statRuntimePath).not.toHaveBeenCalled()
  expect(openFile).toHaveBeenCalledWith(
    expect.objectContaining({
      filePath: '/host/.orca-goal/document.md',
      relativePath: '/host/.orca-goal/document.md',
      runtimeEnvironmentId: 'peer',
      runtimeHostPathGrant: { grantId: 'grant-1', absolutePath: '/host/.orca-goal/document.md' }
    }),
    expect.anything()
  )
})
