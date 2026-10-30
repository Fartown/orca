import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { AppState } from '@/store/types'
import { selectExecutionHostDisplayLabel } from '@/lib/execution-host-display-label'
import type { ExecutionHostId } from '../../../shared/execution-host'
import { parseWorkspaceKey } from '../../../shared/workspace-scope'
import { getWorktreeGitIdentityDisplay } from '../../../shared/worktree/git-identity-display'
import type { Worktree } from '../../../shared/worktree/types'
import type { LocalTaskLinkOrigin } from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTasksLinksLinkWorkspaceInput } from '../../../shared/local-tasks/local-tasks-link-rpc-params'
import { localTasksClient } from './local-tasks-runtime-client'
import { runLocalTaskWrite } from './local-task-writes'
import { localTaskWorktreeHostId } from './local-task-workspace-resolution'

const SNAPSHOT_MAX = 512

function snapshot(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed.slice(0, SNAPSHOT_MAX) : undefined
}

/** A workspace row, or just its ids when creation finished before the row was listed. */
export type LinkableWorkspace = Pick<Worktree, 'id' | 'repoId'> &
  Partial<Pick<Worktree, 'instanceId' | 'branch' | 'head' | 'displayName' | 'hostId'>>

export function localTaskBranchName(
  worktree: Partial<Pick<Worktree, 'branch' | 'head'>>
): string | null {
  const identity = getWorktreeGitIdentityDisplay(worktree)
  return identity?.kind === 'branch' ? identity.branchName : null
}

/** What the task library stores for a workspace: its host, ids, and names to show while away. */
export function buildLocalTaskWorkspaceLinkInput(
  state: AppState,
  args: {
    taskId: string
    worktree: LinkableWorkspace
    hostId?: ExecutionHostId
    linkedVia: LocalTaskLinkOrigin
    replace?: boolean
  }
): Omit<LocalTasksLinksLinkWorkspaceInput, 'clientOperationId'> {
  const { worktree } = args
  const hostId = args.hostId ?? localTaskWorktreeHostId(state, worktree)
  const scope = parseWorkspaceKey(worktree.id)
  const place =
    scope?.type === 'folder'
      ? { kind: 'folder' as const, folderWorkspaceId: scope.folderWorkspaceId }
      : { kind: 'git-worktree' as const, worktreeId: worktree.id }
  return {
    taskId: args.taskId,
    hostId,
    ...place,
    ...(worktree.instanceId ? { instanceId: worktree.instanceId } : {}),
    ...(scope?.type === 'folder' ? {} : { repoId: worktree.repoId }),
    branchSnapshot: snapshot(localTaskBranchName(worktree)),
    nameSnapshot: snapshot(worktree.displayName),
    hostLabelSnapshot: snapshot(selectExecutionHostDisplayLabel(state, hostId)),
    linkedVia: args.linkedVia,
    ...(args.replace ? { replace: true } : {})
  }
}

export async function linkLocalTaskWorkspace(
  state: AppState,
  args: Parameters<typeof buildLocalTaskWorkspaceLinkInput>[1]
): Promise<boolean> {
  const input = buildLocalTaskWorkspaceLinkInput(state, args)
  const result = await runLocalTaskWrite(() => localTasksClient.linkWorkspace(input))
  return result !== null
}

/** `announce: false` when the caller's own surface already shows the outcome. */
export async function unlinkLocalTaskWorkspace(
  taskId: string,
  options: { announce?: boolean } = {}
): Promise<boolean> {
  const result = await runLocalTaskWrite(() => localTasksClient.unlinkWorkspace(taskId))
  if (result && options.announce !== false) {
    toast.success(translate('localTasks.links.workspaceUnlinked', 'Workspace unlinked'))
  }
  return result !== null
}

export async function unlinkLocalTaskSession(sessionLinkId: string): Promise<void> {
  const result = await runLocalTaskWrite(() => localTasksClient.unlinkSession(sessionLinkId))
  if (result) {
    toast.success(translate('localTasks.links.sessionUnlinked', 'Session unlinked'))
  }
}
