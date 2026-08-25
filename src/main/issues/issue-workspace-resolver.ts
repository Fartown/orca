import {
  getWorktreePathBasenameFromId,
  splitWorktreeIdForFilesystem
} from '../../shared/worktree/id'
import { parseWorkspaceKey } from '../../shared/workspace-scope'
import { toSshExecutionHostId } from '../../shared/execution-host'
import type { FolderWorkspace } from '../../shared/folder-workspace-types'
import type { AgentSessionIdentityPathAccess } from '../runtime/agent-session-claim-identity'
import type { IssueWorkspaceResolver } from './issue-feature-bootstrap'

export type IssueWorkspaceResolverAdapter = {
  getTerminalWorktreeIdForPaneKey(paneKey: string): string | null
  getFolderWorkspace(folderWorkspaceId: string): FolderWorkspace | undefined
  pathAccess?(
    connectionId: string | null,
    hostPlatform: NodeJS.Platform
  ): AgentSessionIdentityPathAccess | null
  hostPlatform?(connectionId: string | null, workspacePath: string): NodeJS.Platform
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
        const hostPlatform =
          adapter.hostPlatform?.(connectionId, folder.folderPath) ?? process.platform
        return {
          executionHostId,
          workspaceRef: parsedScope,
          workspaceSnapshot: { name: folder.name, path: folder.folderPath },
          processIncarnation: null,
          connectionId,
          hostPlatform
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
      const hostPlatform =
        adapter.hostPlatform?.(connectionId, parsed.worktreePath) ?? process.platform
      return {
        executionHostId,
        workspaceRef: worktreeScope,
        workspaceSnapshot: {
          name: getWorktreePathBasenameFromId(worktreeScope.worktreeId) ?? parsed.repoId,
          path: parsed.worktreePath
        },
        processIncarnation: null,
        connectionId,
        hostPlatform
      }
    },
    pathAccess: (context) =>
      adapter.pathAccess?.(context.connectionId, context.hostPlatform) ?? null
  }
}
