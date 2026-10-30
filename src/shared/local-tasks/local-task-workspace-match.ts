import { folderWorkspaceKey } from '../workspace-scope'
import { worktreeIdsEqual } from '../worktree/id'
import type { LocalTaskLinks, LocalTaskWorkspaceLink } from './local-task-link-types'

type LinkPlace = Pick<LocalTaskWorkspaceLink, 'kind' | 'worktreeId' | 'folderWorkspaceId'>

/** The sidebar id of a linked workspace: a worktree id, or `folder:<id>` for a folder workspace. */
export function localTaskLinkWorkspaceId(link: LinkPlace): string | null {
  if (link.kind === 'folder') {
    return link.folderWorkspaceId ? folderWorkspaceKey(link.folderWorkspaceId) : null
  }
  return link.worktreeId
}

/**
 * The task link naming a workspace, by its id on a host (host ids as the library's Orca spells
 * them). Shared so the desktop, the CLI and the host read the same workspace the same way.
 */
export function findLocalTaskLinkForWorkspace(
  links: LocalTaskLinks,
  workspace: { id: string; hostId: string; instanceId?: string }
): LocalTaskWorkspaceLink | null {
  return (
    links.workspaces.find((link) => {
      if (workspace.instanceId && link.instanceId === workspace.instanceId) {
        return true
      }
      const linkWorkspaceId = localTaskLinkWorkspaceId(link)
      // Why worktreeIdsEqual: the same checkout can be spelled with different path case or slashes.
      return (
        link.hostId === workspace.hostId &&
        linkWorkspaceId !== null &&
        worktreeIdsEqual(linkWorkspaceId, workspace.id)
      )
    }) ?? null
  )
}
