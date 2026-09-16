import { stat } from 'node:fs/promises'
import type { FolderWorkspace } from '../../shared/folder-workspace-types'
import { parseWorkspaceKey } from '../../shared/workspace-scope'
import { inferFolderWorkspacePathConnection } from '../project-groups/folder-workspace-path-status'

type ConnectionInput = Parameters<typeof inferFolderWorkspacePathConnection>[0]
export type GoalDraftWorkspacePorts = {
  executionHostId?: string
  checkDirectory?: boolean
  getFolderWorkspaces(): FolderWorkspace[]
  getRepos(): ConnectionInput['repos']
  getProjectGroups(): ConnectionInput['projectGroups']
  showWorktree(
    selector: string
  ): Promise<{ path: string; hostId?: string; connectionId?: string | null }>
}

/** Reuse host-owned workspace routing; drafting does not require an execution terminal. */
export async function resolveGoalDraftWorkspace(
  selector: string,
  ports: GoalDraftWorkspacePorts
): Promise<string> {
  const parsed = parseWorkspaceKey(selector.startsWith('id:') ? selector.slice(3) : selector)
  let path: string
  if (parsed?.type === 'folder') {
    const folder = ports.getFolderWorkspaces().find((item) => item.id === parsed.folderWorkspaceId)
    if (!folder) {
      throw new Error('The selected folder workspace no longer exists.')
    }
    const connection = inferFolderWorkspacePathConnection({
      ...folder,
      connectionId: folder.connectionId ?? null,
      repos: ports.getRepos(),
      projectGroups: ports.getProjectGroups()
    })
    const host =
      folder.executionHostId ||
      (connection.kind === 'ssh' ? `ssh:${connection.connectionId}` : connection.kind)
    if (host !== (ports.executionHostId ?? 'local')) {
      throw new Error('Goal drafting is only supported on the local execution host.')
    }
    path = folder.folderPath
  } else {
    const worktree = await ports.showWorktree(selector)
    const host =
      worktree.hostId || (worktree.connectionId ? `ssh:${worktree.connectionId}` : 'local')
    if (host !== (ports.executionHostId ?? 'local')) {
      throw new Error('Goal drafting is only supported on the local execution host.')
    }
    path = worktree.path
  }
  if (ports.checkDirectory !== false && !(await stat(path)).isDirectory()) {
    throw new Error('The selected workspace directory is unavailable.')
  }
  return path
}
