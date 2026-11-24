import { describe, expect, it, vi } from 'vitest'
import {
  openTabEntryWithOperations,
  type TabEntryOperations
} from '../tab-bar/create-entry/tab-create-entry-action'

const readyFiles = (files: string[]) => ({ files, loading: false, loadError: null })

function makeOperations(overrides: Partial<TabEntryOperations> = {}): TabEntryOperations {
  return {
    createRuntimePath: vi.fn().mockResolvedValue(undefined),
    openWorkspaceBrowserTab: vi.fn().mockResolvedValue(undefined),
    openHtmlFilePreview: vi.fn(),
    openFile: vi.fn(),
    statRuntimePath: vi.fn().mockResolvedValue({ size: 1, isDirectory: false, mtime: 1 }),
    statUserOpenedPath: vi.fn().mockResolvedValue({ isDirectory: false, escapesWorktree: false }),
    assertAbsolutePathAllowed: vi.fn(),
    requestHostPathGrant: vi
      .fn()
      .mockResolvedValue({ grantId: 'grant-1', absolutePath: '/tmp/notes.md' }),
    ...overrides
  }
}

const baseArgs = {
  fileList: readyFiles(['src/index.ts']),
  worktreeId: 'wt-1',
  groupId: 'group-1',
  allowAbsolutePaths: true,
  localPlatform: 'posix' as const,
  searchEngine: 'google' as const
}

const sshContext = {
  target: { kind: 'local' as const },
  worktreeId: 'wt-1',
  worktreePath: '/home/me/repo',
  connectionId: 'ssh-1'
}

const runtimeContext = {
  target: { kind: 'environment' as const, environmentId: 'hub-a' },
  worktreeId: 'wt-1',
  worktreePath: '/repo'
}

describe('tab create entry absolute paths on remote hosts', () => {
  it('opens SSH absolute paths on the remote host without local authorization', async () => {
    const operations = makeOperations()

    await openTabEntryWithOperations({
      ...baseArgs,
      getFileContext: () => ({
        worktreePath: '/home/me/repo',
        runtimeContext: sshContext,
        assertCurrent: () => {}
      }),
      classification: { kind: 'absolute-file', filePath: '/home/me/notes.md' },
      query: '/home/me/notes.md',
      operations
    })

    expect(operations.statUserOpenedPath).toHaveBeenCalledWith(sshContext, '/home/me/notes.md')
    expect(operations.openFile).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: '/home/me/notes.md',
        relativePath: '/home/me/notes.md',
        worktreeId: 'wt-1',
        externalSshTargetId: 'ssh-1'
      }),
      { preview: false, targetGroupId: 'group-1' }
    )
  })

  it('keeps SSH paths inside the worktree relative and unstamped', async () => {
    const operations = makeOperations()

    await openTabEntryWithOperations({
      ...baseArgs,
      getFileContext: () => ({
        worktreePath: '/home/me/repo',
        runtimeContext: sshContext,
        assertCurrent: () => {}
      }),
      classification: { kind: 'absolute-file', filePath: '/home/me/repo/src/index.ts' },
      query: '/home/me/repo/src/index.ts',
      operations
    })

    expect(operations.openFile).toHaveBeenCalledWith(
      expect.objectContaining({ relativePath: 'src/index.ts' }),
      { preview: false, targetGroupId: 'group-1' }
    )
    expect(vi.mocked(operations.openFile).mock.calls[0]?.[0]).not.toHaveProperty(
      'externalSshTargetId'
    )
  })

  it('opens a path outside the runtime worktree through a host grant', async () => {
    const operations = makeOperations()

    await openTabEntryWithOperations({
      ...baseArgs,
      getFileContext: () => ({ worktreePath: '/repo', runtimeContext, assertCurrent: () => {} }),
      query: '/tmp/notes.md',
      operations
    })

    expect(operations.requestHostPathGrant).toHaveBeenCalledWith(runtimeContext, '/tmp/notes.md')
    // The grant request is also the existence check, so there is no stat to make.
    expect(operations.statUserOpenedPath).not.toHaveBeenCalled()
    // The file belongs to the host, so this desktop never mints a grant for its local twin.
    expect(operations.openFile).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: '/tmp/notes.md',
        relativePath: '/tmp/notes.md',
        runtimeHostPathGrant: { grantId: 'grant-1', absolutePath: '/tmp/notes.md' }
      }),
      { preview: false, targetGroupId: 'group-1' }
    )
  })

  it('surfaces the host refusal when it will not grant the path', async () => {
    const operations = makeOperations({
      requestHostPathGrant: vi
        .fn()
        .mockRejectedValue(new Error('File not found on the host: /tmp/gone.md'))
    })

    await expect(
      openTabEntryWithOperations({
        ...baseArgs,
        getFileContext: () => ({ worktreePath: '/repo', runtimeContext, assertCurrent: () => {} }),
        query: '/tmp/gone.md',
        operations
      })
    ).rejects.toThrow('File not found on the host: /tmp/gone.md')
    expect(operations.openFile).not.toHaveBeenCalled()
  })

  it('opens paired-runtime absolute paths inside the worktree as relative files', async () => {
    const operations = makeOperations()

    await openTabEntryWithOperations({
      ...baseArgs,
      getFileContext: () => ({ worktreePath: '/repo', runtimeContext, assertCurrent: () => {} }),
      query: '/repo/src/index.ts',
      operations
    })

    expect(operations.statUserOpenedPath).toHaveBeenCalledWith(runtimeContext, '/repo/src/index.ts')
    expect(operations.openFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: '/repo/src/index.ts', relativePath: 'src/index.ts' }),
      { preview: false, targetGroupId: 'group-1' }
    )
    expect(vi.mocked(operations.openFile).mock.calls[0]?.[0]).not.toHaveProperty(
      'externalSshTargetId'
    )
  })
})
