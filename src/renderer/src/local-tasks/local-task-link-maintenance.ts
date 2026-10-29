import type { AppState } from '@/store/types'
import { selectExecutionHostDisplayLabel } from '@/lib/execution-host-display-label'
import { isTerminalLocalTaskCategory } from '../../../shared/local-tasks/local-task-model'
import type {
  LocalTaskLinks,
  LocalTaskWorkspaceLink
} from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import type {
  LocalTasksLinksResolveWorkspaceInput,
  LocalTasksRulesApplyPrMergedInput
} from '../../../shared/local-tasks/local-tasks-link-rpc-params'
import { isLocalTaskHostInContact } from './local-task-host-contact'
import { localTaskBranchName } from './local-task-workspace-linking'
import {
  localTaskWorktreeHostId,
  selectLocalTaskWorkspace
} from './local-task-workspace-resolution'
import { localTaskMergedReview, selectLocalTaskReview } from './local-task-workspace-review'

type WithoutOperation<T> = Omit<T, 'clientOperationId'>
/** A fix plus the repo row it was read from, which tells a nested SSH host apart (§2.2). */
export type LocalTaskWorkspaceFix = {
  input: WithoutOperation<LocalTasksLinksResolveWorkspaceInput>
  repoId: string | null
}
export type LocalTaskPrMergedTrigger = WithoutOperation<LocalTasksRulesApplyPrMergedInput>

type Library = {
  links: LocalTaskLinks
  tasks: readonly LocalTask[]
  projects: readonly LocalTaskProject[]
}

function workspaceFix(state: AppState, link: LocalTaskWorkspaceLink): LocalTaskWorkspaceFix | null {
  const located = selectLocalTaskWorkspace(state, link)
  if (typeof located === 'string') {
    return null
  }
  const hostId = localTaskWorktreeHostId(state, located)
  if (!isLocalTaskHostInContact(state, hostId)) {
    return null
  }
  const fix: LocalTaskWorkspaceFix['input'] = { taskId: link.taskId }
  if (!link.instanceId && located.instanceId) {
    fix.instanceId = located.instanceId
  }
  if (hostId !== link.hostId) {
    fix.hostId = hostId
    fix.hostLabelSnapshot = selectExecutionHostDisplayLabel(state, hostId).slice(0, 512)
  }
  if (link.kind === 'git-worktree' && located.id !== link.worktreeId) {
    fix.worktreeId = located.id
  }
  const branch = localTaskBranchName(located)
  if (branch && branch !== link.branchSnapshot) {
    fix.branchSnapshot = branch.slice(0, 512)
  }
  const name = located.displayName.trim()
  if (name && name !== link.nameSnapshot) {
    fix.nameSnapshot = name.slice(0, 512)
  }
  return Object.keys(fix).length > 1 ? { input: fix, repoId: located.repoId ?? null } : null
}

/**
 * What this window learned about linked workspaces (solution doc §7.1): a missing instance id, a
 * host the workspace moved to (matched by instance id on a host in contact), or renamed branch
 * and name. Session panes are the session host's to fill (solution doc §17.3).
 */
export function findLocalTaskWorkspaceFixes(
  state: AppState,
  links: LocalTaskLinks
): LocalTaskWorkspaceFix[] {
  return links.workspaces.flatMap((link) => {
    const fix = workspaceFix(state, link)
    return fix ? [fix] : []
  })
}

/** The open task that holds this workspace link itself; any level may hold one (D-008). */
function openLinkedTask(
  library: Library,
  taskId: string
): { task: LocalTask; project: LocalTaskProject } | null {
  const task = library.tasks.find((candidate) => candidate.id === taskId)
  const project = task && library.projects.find((candidate) => candidate.id === task.projectId)
  const status = project?.statuses.find((candidate) => candidate.id === task?.statusId)
  if (!task || !project || !status) {
    return null
  }
  return isTerminalLocalTaskCategory(status.category) ? null : { task, project }
}

/** Worktrees of open tasks that hold a workspace; their PRs refresh like visible cards. */
export function selectLocalTaskReviewWorktreeIds(state: AppState, library: Library): string[] {
  const ids: string[] = []
  for (const link of library.links.workspaces) {
    if (link.kind !== 'git-worktree' || !openLinkedTask(library, link.taskId)) {
      continue
    }
    const located = selectLocalTaskWorkspace(state, link)
    if (typeof located !== 'string') {
      ids.push(located.id)
    }
  }
  return ids
}

/**
 * Rule 2 (REQ-013): an open task holding the workspace itself, whose project keeps the rule on,
 * and whose workspace's review is merged at the workspace's own head. Hosts out of contact are
 * not read; the host refuses a PR it has already applied.
 */
export function findLocalTaskPrMergedTriggers(
  state: AppState,
  library: Library
): LocalTaskPrMergedTrigger[] {
  const triggers: LocalTaskPrMergedTrigger[] = []
  for (const link of library.links.workspaces) {
    const open = link.kind === 'git-worktree' ? openLinkedTask(library, link.taskId) : null
    if (!open?.project.rules.prMergedCompletes) {
      continue
    }
    const located = selectLocalTaskWorkspace(state, link)
    if (
      typeof located === 'string' ||
      !isLocalTaskHostInContact(state, localTaskWorktreeHostId(state, located))
    ) {
      continue
    }
    const merged = localTaskMergedReview(selectLocalTaskReview(state, located), located)
    if (merged) {
      triggers.push({ taskId: link.taskId, ...merged })
    }
  }
  return triggers
}
