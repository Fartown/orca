import { describe, expect, it } from 'vitest'
import { createIssueWorkspaceResolver } from './issue-workspace-resolver'

describe('Issue workspace resolver', () => {
  it('resolves worktree and folder workspaces without requiring Git for folders', async () => {
    const resolver = createIssueWorkspaceResolver({
      getTerminalWorktreeIdForPaneKey: () => 'repo-1::/workspace/tree',
      getFolderWorkspace: (id) =>
        id === 'folder-1' ? ({ id, name: 'Notes', folderPath: '/notes' } as never) : undefined
    })

    await expect(
      resolver.resolve({ paneKey: 'pane-1', connectionId: null })
    ).resolves.toMatchObject({
      executionHostId: 'local',
      workspaceRef: { type: 'worktree', worktreeId: 'repo-1::/workspace/tree' },
      workspaceSnapshot: { name: 'tree', path: '/workspace/tree' }
    })
    await expect(
      resolver.resolve({
        paneKey: 'pane-2',
        worktreeId: 'folder:folder-1',
        connectionId: null
      })
    ).resolves.toMatchObject({
      workspaceRef: { type: 'folder', folderWorkspaceId: 'folder-1' },
      workspaceSnapshot: { name: 'Notes', path: '/notes' }
    })
  })

  it('uses the direct SSH target as authority identity', async () => {
    const resolver = createIssueWorkspaceResolver({
      getTerminalWorktreeIdForPaneKey: () => null,
      getFolderWorkspace: () => undefined,
      hostPlatform: () => 'linux'
    })
    await expect(
      resolver.resolve({
        paneKey: 'pane-1',
        worktreeId: 'repo-1::/remote/tree',
        connectionId: 'ssh target'
      })
    ).resolves.toMatchObject({
      executionHostId: 'ssh:ssh%20target',
      connectionId: 'ssh target',
      hostPlatform: 'linux'
    })
  })
})
