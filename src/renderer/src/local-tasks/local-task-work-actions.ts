import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { selectExecutionHostDisplayLabel } from '@/lib/execution-host-display-label'
import { normalizeExecutionHostId } from '../../../shared/execution-host'
import type { LocalTaskWorkspaceLink } from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import { isLocalTaskHostInContact } from './local-task-host-contact'
import { localTaskLinkDialogStore } from './local-task-link-dialog-store'
import { startLocalTaskWork } from './local-task-start-work'
import type { LocalTaskIndex } from './local-task-grouping'
import {
  findLocalTaskEffectiveWorkspace,
  findLocalTaskWorkspaceLink
} from './local-task-link-selectors'
import { localTasksDomainStore } from './local-tasks-domain-store'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import {
  isFolderLocalTaskProject,
  localTaskStartTargets,
  localTaskWorktreeHostId,
  reposForLocalTaskProject,
  resolveLocalTaskStartTarget,
  selectLocalTaskWorkspace
} from './local-task-workspace-resolution'

/** `create` opens the composer, `existing` the workspace picker; `reason` explains a greyed button. */
export type LocalTaskActionState = {
  mode: 'hidden' | 'create' | 'existing' | 'session'
  reason: string | null
}

function hostUnreachable(state: AppState, hostId: string): string {
  const id = normalizeExecutionHostId(hostId)
  return id
    ? translate('localTasks.links.hostOffline', '{{host}} is not connected', {
        host: selectExecutionHostDisplayLabel(state, id)
      })
    : translate('localTasks.links.hostOfflineUnnamed', 'The workspace’s host is not connected')
}

/**
 * Start (REQ-009) on a task of any level that has no live workspace of its own, only toward a host
 * in contact. `ownLink` is the task's own link, never one it inherits.
 */
export function selectLocalTaskStartState(
  state: AppState,
  project: LocalTaskProject | undefined,
  ownLink: LocalTaskWorkspaceLink | null
): LocalTaskActionState {
  if (!project || (ownLink && selectLocalTaskWorkspace(state, ownLink) !== 'missing')) {
    return { mode: 'hidden', reason: null }
  }
  if (isFolderLocalTaskProject(state, project)) {
    return { mode: 'existing', reason: null }
  }
  const start = resolveLocalTaskStartTarget(state, project)
  if (!start) {
    // Why two messages: a project whose linked repos all left Orca needs them added back, not linked.
    const removed =
      project.repos.length > 0 && reposForLocalTaskProject(state, project).length === 0
    return {
      mode: 'create',
      reason: removed
        ? translate(
            'localTasks.links.repoRemovedShort',
            'This project’s repositories were removed from Orca'
          )
        : translate('localTasks.links.noRepoShort', 'No Git repository in Orca for this project')
    }
  }
  return {
    mode: 'create',
    reason: isLocalTaskHostInContact(state, start.target.hostId)
      ? null
      : hostUnreachable(state, start.target.hostId)
  }
}

/**
 * Open session (REQ-010): needs the workspace the task works in, its own or the nearest
 * ancestor's, on a host in contact; with none, Start comes first.
 */
export function selectLocalTaskSessionState(
  state: AppState,
  project: LocalTaskProject | undefined,
  workspace: LocalTaskWorkspaceLink | null
): LocalTaskActionState {
  if (!workspace) {
    return selectLocalTaskStartState(state, project, null)
  }
  const located = selectLocalTaskWorkspace(state, workspace)
  if (located === 'missing') {
    return {
      mode: 'session',
      reason: translate('localTasks.links.workspaceGone', 'The workspace was deleted.')
    }
  }
  if (located === 'unverifiable') {
    return {
      mode: 'session',
      reason: isLocalTaskHostInContact(state, workspace.hostId)
        ? translate('localTasks.links.workspaceUnverifiable', 'Can’t confirm the workspace now.')
        : hostUnreachable(state, workspace.hostId)
    }
  }
  const hostId = localTaskWorktreeHostId(state, located)
  return {
    mode: 'session',
    reason: isLocalTaskHostInContact(state, hostId) ? null : hostUnreachable(state, hostId)
  }
}

export function useLocalTaskStartState(
  project: LocalTaskProject | undefined,
  ownLink: LocalTaskWorkspaceLink | null
): LocalTaskActionState {
  return useAppStore(useShallow((state) => selectLocalTaskStartState(state, project, ownLink)))
}

export function useLocalTaskSessionState(
  project: LocalTaskProject | undefined,
  workspace: LocalTaskWorkspaceLink | null
): LocalTaskActionState {
  return useAppStore(useShallow((state) => selectLocalTaskSessionState(state, project, workspace)))
}

export type LocalTaskStartChoice = { orcaProjectId: string; label: string }

/** Orca projects Start can create in, the default first; more than one offers a choice. */
export function useLocalTaskStartChoices(
  project: LocalTaskProject | undefined
): LocalTaskStartChoice[] {
  // Why flat strings: a shallow-equal snapshot needs values, not fresh objects per read.
  const flat = useAppStore(
    useShallow((state) =>
      project
        ? localTaskStartTargets(state, project).flatMap((start) => [
            start.orcaProjectId,
            state.projects.find((candidate) => candidate.id === start.orcaProjectId)?.displayName ??
              start.repo.displayName
          ])
        : []
    )
  )
  return useMemo(() => {
    const choices: LocalTaskStartChoice[] = []
    for (let at = 0; at + 1 < flat.length; at += 2) {
      choices.push({ orcaProjectId: flat[at], label: flat[at + 1] })
    }
    return choices
  }, [flat])
}

/**
 * Start on this task (REQ-009): the composer for a git project, the workspace picker for a folder
 * one. `ownLink` is replaced when its workspace was deleted.
 */
export function runLocalTaskStart(
  task: LocalTask,
  project: LocalTaskProject,
  ownLink: LocalTaskWorkspaceLink | null,
  options: { orcaProjectId?: string } = {}
): void {
  const state = selectLocalTaskStartState(useAppStore.getState(), project, ownLink)
  if (state.reason) {
    // Why: the I key and Restart reach here past a greyed button, so say why nothing opens.
    toast.error(state.reason)
    return
  }
  if (state.mode === 'hidden') {
    return
  }
  if (state.mode === 'existing') {
    localTaskLinkDialogStore.getState().open({ kind: 'pick-workspace', taskId: task.id })
    return
  }
  startLocalTaskWork(task, project, { replace: ownLink !== null, ...options })
}

/** Open session in the workspace the task works in; with none anywhere above, the task starts its own. */
export function runLocalTaskSession(
  task: LocalTask,
  project: LocalTaskProject,
  workspace: LocalTaskWorkspaceLink | null
): void {
  if (!workspace) {
    runLocalTaskStart(task, project, null)
    return
  }
  const { reason } = selectLocalTaskSessionState(useAppStore.getState(), project, workspace)
  if (reason) {
    toast.error(reason)
    return
  }
  localTaskLinkDialogStore.getState().open({ kind: 'session', taskId: task.id })
}

/** Shows a linked workspace with Orca's own navigation; false when this window cannot place it. */
export function openLocalTaskWorkspace(link: LocalTaskWorkspaceLink): boolean {
  const state = useAppStore.getState()
  const located = selectLocalTaskWorkspace(state, link)
  if (typeof located === 'string') {
    return false
  }
  return (
    activateAndRevealWorkspace(located.id, {
      executionHostId: localTaskWorktreeHostId(state, located)
    }) !== false
  )
}

/** I and A on the task page, on a task of any level (REQ-009, REQ-010). */
export function runLocalTaskWorkKey(
  action: 'start-work' | 'open-session',
  taskId: string,
  index: LocalTaskIndex
): void {
  const task = index.tasksById.get(taskId)
  const project = task ? index.projectsById.get(task.projectId) : undefined
  if (!task || !project) {
    return
  }
  const { links } = localTasksDomainStore.getState()
  if (action === 'open-session') {
    runLocalTaskSession(
      task,
      project,
      findLocalTaskEffectiveWorkspace(links, task, index.tasksById)
    )
  } else {
    runLocalTaskStart(task, project, findLocalTaskWorkspaceLink(links, task.id))
  }
}
