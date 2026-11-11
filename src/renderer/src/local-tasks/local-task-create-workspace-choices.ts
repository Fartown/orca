import { useMemo } from 'react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { getIndexedRepoMap } from '@/store/worktree-repo-index'
import { parseWorkspaceKey } from '../../../shared/workspace-scope'
import type {
  LocalTaskLinks,
  LocalTaskWorkspaceLink
} from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import { createDispatchAppSelector } from './local-task-dispatch-app-selector'
import {
  localTaskDispatchCandidates,
  type LocalTaskDispatchCandidate
} from './local-task-dispatch-candidates'
import { projectsForDispatchTarget } from './local-task-dispatch-project'
import { localTaskEndpointForHost, localTaskIdEndpoint } from './local-task-endpoints'
import { findLocalTaskLinkForWorkspace } from './local-task-link-selectors'
import { localTaskBranchName } from './local-task-workspace-linking'
import { orcaProjectIdsForWorktree } from './local-task-workspace-resolution'
import { useLocalTasksDomain } from './local-tasks-domain-store'

type WorkspaceCandidate = Extract<LocalTaskDispatchCandidate, { kind: 'workspace' }>

/** One row of New task's 已有工作区 list (REQ-027). */
export type LocalTaskCreateWorkspaceChoice = {
  key: string
  candidate: WorkspaceCandidate
  folder: boolean
  repoLabel: string | null
  branch: string | null
  /** The task that already owns this workspace: the new task goes under it and works there. */
  owner: LocalTask | null
  ownerLink: LocalTaskWorkspaceLink | null
  /** The project a new task working here goes into; null when no writable project can hold it. */
  projectId: string | null
}

function relatesTo(project: LocalTaskProject, orcaProjectIds: ReadonlySet<string>): boolean {
  return project.repos.length === 0 || project.repos.some((id) => orcaProjectIds.has(id))
}

/**
 * The project a new task in this free workspace goes into: a library holds only its own hosts, so
 * the current project stays when it is on that library and tracks this repo, else one that does.
 */
function projectForFreeWorkspace(
  state: AppState,
  candidate: WorkspaceCandidate,
  writable: readonly LocalTaskProject[],
  currentProjectId: string | null
): string | null {
  const endpoint = localTaskEndpointForHost(candidate.hostId)
  const sameLibrary = writable.filter((project) => localTaskIdEndpoint(project.id) === endpoint)
  const current = sameLibrary.find((project) => project.id === currentProjectId)
  if (current && relatesTo(current, orcaProjectIdsForWorktree(state, candidate.worktree))) {
    return current.id
  }
  return (
    projectsForDispatchTarget(state, candidate, sameLibrary)[0]?.id ??
    current?.id ??
    sameLibrary[0]?.id ??
    null
  )
}

/**
 * Every workspace and folder workspace in the window with what New task needs to place a task in
 * it. Rows on hosts out of contact stay listed (greyed by the caller); nothing is read from them.
 */
export function localTaskCreateWorkspaceChoices(
  state: AppState,
  candidates: readonly LocalTaskDispatchCandidate[],
  args: {
    tasks: readonly LocalTask[]
    links: LocalTaskLinks
    writableProjects: readonly LocalTaskProject[]
    projectId: string | null
    sourceWorktreeId: string | null
  }
): LocalTaskCreateWorkspaceChoice[] {
  const repos = getIndexedRepoMap(state.repos)
  const writableIds = new Set(args.writableProjects.map((project) => project.id))
  const choices = candidates
    .filter((candidate): candidate is WorkspaceCandidate => candidate.kind === 'workspace')
    .map((candidate): LocalTaskCreateWorkspaceChoice => {
      const { worktree } = candidate
      const folder = parseWorkspaceKey(worktree.id)?.type === 'folder'
      const ownerLink = findLocalTaskLinkForWorkspace(args.links, {
        id: worktree.id,
        hostId: candidate.hostId,
        ...(worktree.instanceId ? { instanceId: worktree.instanceId } : {})
      })
      const owner = ownerLink
        ? (args.tasks.find((task) => task.id === ownerLink.taskId) ?? null)
        : null
      const projectId = ownerLink
        ? owner && writableIds.has(owner.projectId)
          ? owner.projectId
          : null
        : projectForFreeWorkspace(state, candidate, args.writableProjects, args.projectId)
      return {
        key: candidate.id,
        candidate,
        folder,
        repoLabel: folder ? null : (repos.get(worktree.repoId)?.displayName ?? null),
        branch: folder ? null : localTaskBranchName(worktree),
        owner,
        ownerLink: owner ? ownerLink : null,
        projectId
      }
    })
  const rank = (choice: LocalTaskCreateWorkspaceChoice): number =>
    choice.candidate.worktree.id === args.sourceWorktreeId ? 0 : choice.candidate.available ? 1 : 2
  return choices
    .map((choice, at) => ({ choice, at }))
    .sort((left, right) => rank(left.choice) - rank(right.choice) || left.at - right.at)
    .map(({ choice }) => choice)
}

/** Why this row can't be picked, or null; out of contact only waits, nothing redials the host. */
export function localTaskCreateChoiceBlocked(
  choice: LocalTaskCreateWorkspaceChoice
): string | null {
  if (!choice.candidate.available) {
    return translate('localTasks.links.hostOffline', '{{host}} is not connected', {
      host: choice.candidate.detail
    })
  }
  return choice.projectId === null
    ? translate('localTasks.createFlow.noProjectHere', 'No project here can take a new task')
    : null
}

/** Whether a task in this project can work in the chosen workspace. */
export function localTaskCreateChoiceFitsProject(
  choice: LocalTaskCreateWorkspaceChoice,
  projectId: string
): boolean {
  if (choice.owner) {
    return choice.owner.projectId === projectId
  }
  return localTaskEndpointForHost(choice.candidate.hostId) === localTaskIdEndpoint(projectId)
}

export function useLocalTaskCreateWorkspaceChoices(args: {
  writableProjects: readonly LocalTaskProject[]
  projectId: string | null
  sourceWorktreeId: string | null
}): LocalTaskCreateWorkspaceChoice[] {
  const app = useAppStore(useMemo(() => createDispatchAppSelector(), []))
  const tasks = useLocalTasksDomain((state) => state.tasks)
  const links = useLocalTasksDomain((state) => state.links)
  const { writableProjects, projectId, sourceWorktreeId } = args
  return useMemo(
    () =>
      localTaskCreateWorkspaceChoices(app, localTaskDispatchCandidates(app, tasks, [], links, []), {
        tasks,
        links,
        writableProjects,
        projectId,
        sourceWorktreeId
      }),
    [app, links, projectId, sourceWorktreeId, tasks, writableProjects]
  )
}
