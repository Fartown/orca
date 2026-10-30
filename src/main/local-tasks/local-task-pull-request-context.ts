import { resolve } from 'node:path'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import type { LocalTaskWorkspaceLink } from '../../shared/local-tasks/local-task-link-types'
import type { PullRequestLinkedLocalTask } from '../../shared/local-tasks/local-task-pull-request-context'
import { folderWorkspaceKey } from '../../shared/workspace-scope'
import { splitWorktreeIdForFilesystem, worktreeIdsEqual } from '../../shared/worktree/id'
import { localTasksReadiness } from './local-tasks-readiness'

type GenerationWorkspace = {
  /** The workspace id as this host keys it; absent when the caller named only a path. */
  id?: string | null
  /** The checkout git runs in, so an id naming another workspace is refused. */
  path: string
}

function comparablePath(value: string): string {
  const normalized = resolve(value)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function isThisWorkspace(link: LocalTaskWorkspaceLink, workspace: GenerationWorkspace): boolean {
  const id = workspace.id
  // Why local only: this process generates PRs for its own checkouts, never for an SSH target's.
  if (!id || link.hostId !== LOCAL_EXECUTION_HOST_ID) {
    return false
  }
  if (link.kind === 'folder') {
    return link.folderWorkspaceId !== null && folderWorkspaceKey(link.folderWorkspaceId) === id
  }
  const idPath = splitWorktreeIdForFilesystem(id)?.worktreePath
  return (
    link.worktreeId !== null &&
    worktreeIdsEqual(link.worktreeId, id) &&
    idPath !== undefined &&
    comparablePath(idPath) === comparablePath(workspace.path)
  )
}

/**
 * The task this host's library links the workspace to, for AI pull request generation.
 * The library and the workspace's meta live in the same Orca, so nothing is read across machines;
 * a library that cannot answer leaves the prompt exactly as upstream builds it.
 */
export function linkedLocalTaskDraftContext(workspace: GenerationWorkspace): {
  linkedLocalTask?: PullRequestLinkedLocalTask
} {
  if (!workspace.id || !localTasksReadiness.isTaskHost()) {
    return {}
  }
  try {
    const service = localTasksReadiness.requireService()
    const link = service.execution
      .listLinks()
      .workspaces.find((candidate) => isThisWorkspace(candidate, workspace))
    const task = link
      ? service.listTasks().tasks.find((candidate) => candidate.id === link.taskId)
      : undefined
    return task
      ? {
          linkedLocalTask: {
            ref: task.ref,
            title: task.title,
            description: task.description,
            criteria: task.criteria
          }
        }
      : {}
  } catch {
    return {}
  }
}
