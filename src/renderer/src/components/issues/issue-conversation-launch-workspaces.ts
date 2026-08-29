import { getFolderWorkspaceHostId } from '@/store/folder-workspaces/folder-workspace-catalog'
import { getWorktreeExecutionHostId } from '../../../../shared/execution-host'
import type { FolderWorkspace, WorkspaceScope } from '../../../../shared/folder-workspace-types'
import type { IssueRouteExecutionHostId } from '../../../../shared/issues/types'
import type { ProjectGroup } from '../../../../shared/project-group-types'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { folderWorkspaceKey } from '../../../../shared/workspace-scope'

export type IssueConversationLaunchWorkspace = {
  id: string
  label: string
  path: string
  ref: WorkspaceScope
}

export function collectIssueConversationLaunchWorkspaces(args: {
  repos: readonly Repo[]
  worktreesByRepo: Readonly<Record<string, readonly Worktree[]>>
  folderWorkspaces: readonly FolderWorkspace[]
  projectGroups: readonly ProjectGroup[]
  route: IssueRouteExecutionHostId
}): IssueConversationLaunchWorkspace[] {
  const repoById = new Map(args.repos.map((repo) => [repo.id, repo]))
  const worktrees = Object.values(args.worktreesByRepo)
    .flat()
    .flatMap((worktree) =>
      getWorktreeExecutionHostId(worktree, repoById.get(worktree.repoId), 'local') === args.route
        ? [
            {
              id: worktree.id,
              label: worktree.displayName,
              path: worktree.path,
              ref: { type: 'worktree' as const, worktreeId: worktree.id }
            }
          ]
        : []
    )
  const folders = args.folderWorkspaces.flatMap((workspace) =>
    getFolderWorkspaceHostId(workspace, args.projectGroups) === args.route
      ? [
          {
            id: folderWorkspaceKey(workspace.id),
            label: workspace.name,
            path: workspace.folderPath,
            ref: { type: 'folder' as const, folderWorkspaceId: workspace.id }
          }
        ]
      : []
  )
  return [...worktrees, ...folders]
}
