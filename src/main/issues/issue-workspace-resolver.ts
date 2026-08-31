import {
  getWorktreePathBasenameFromId,
  splitWorktreeIdForFilesystem
} from '../../shared/worktree/id'
import { parseWorkspaceKey } from '../../shared/workspace-scope'
import { toSshExecutionHostId } from '../../shared/execution-host'
import type { FolderWorkspace } from '../../shared/folder-workspace-types'
import type { IssueWorkspaceResolver } from './issue-feature-bootstrap'

export type IssueWorkspaceResolverAdapter = {
  getTerminalWorktreeIdForPaneKey(paneKey: string): string | null
  getFolderWorkspace(folderWorkspaceId: string): FolderWorkspace | undefined
}

export function createIssueWorkspaceResolver(
  adapter: IssueWorkspaceResolverAdapter
): IssueWorkspaceResolver {
  return {
    resolve: async ({ paneKey, worktreeId, connectionId }) => {
      const workspaceId = worktreeId ?? adapter.getTerminalWorktreeIdForPaneKey(paneKey)
      if (!workspaceId) {
        return null
      }
      const parsedScope = parseWorkspaceKey(workspaceId)
      if (parsedScope?.type === 'folder') {
        const folder = adapter.getFolderWorkspace(parsedScope.folderWorkspaceId)
        if (!folder) {
          return null
        }
        const executionHostId = connectionId ? toSshExecutionHostId(connectionId) : 'local'
        return {
          executionHostId,
          workspaceRef: parsedScope,
          workspaceSnapshot: { name: folder.name, path: folder.folderPath },
          processIncarnation: null,
          connectionId
        }
      }
      const worktreeScope =
        parsedScope?.type === 'worktree'
          ? parsedScope
          : { type: 'worktree' as const, worktreeId: workspaceId }
      const parsed = splitWorktreeIdForFilesystem(worktreeScope.worktreeId)
      if (!parsed) {
        return null
      }
      const executionHostId = connectionId ? toSshExecutionHostId(connectionId) : 'local'
      return {
        executionHostId,
        workspaceRef: worktreeScope,
        workspaceSnapshot: {
          name: getWorktreePathBasenameFromId(worktreeScope.worktreeId) ?? parsed.repoId,
          path: parsed.worktreePath
        },
        processIncarnation: null,
        connectionId
      }
    }
  }
}
