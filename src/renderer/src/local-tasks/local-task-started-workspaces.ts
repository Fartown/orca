import { createStore } from 'zustand/vanilla'
import type { LocalTaskLinks } from '../../../shared/local-tasks/local-task-link-types'
import { worktreeIdsEqual } from '../../../shared/worktree/id'
import { findLocalTaskLinkForWorkspace } from './local-task-link-selectors'

export type LocalTaskStartedWorkspace = { worktreeId: string; hostId: string; taskId: string }

type StartedWorkspacesState = { started: readonly LocalTaskStartedWorkspace[] }

const STARTED_LIMIT = 32

/**
 * Workspaces a Start just created, between creation completing and the library's links naming
 * them, so the sidebar keeps them under their task instead of flashing them through "No task".
 */
export const localTaskStartedWorkspaceStore = createStore<StartedWorkspacesState>(() => ({
  started: []
}))

function sameWorkspace(
  entry: LocalTaskStartedWorkspace,
  workspace: { id: string; hostId: string }
): boolean {
  return entry.hostId === workspace.hostId && worktreeIdsEqual(entry.worktreeId, workspace.id)
}

export function rememberLocalTaskStartedWorkspace(entry: LocalTaskStartedWorkspace): void {
  localTaskStartedWorkspaceStore.setState((state) => ({
    started: [
      ...state.started.filter(
        (other) => !sameWorkspace(other, { id: entry.worktreeId, hostId: entry.hostId })
      ),
      entry
    ].slice(-STARTED_LIMIT)
  }))
}

/** A link write that failed or was skipped leaves the workspace where its links put it. */
export function forgetLocalTaskStartedWorkspace(workspace: { id: string; hostId: string }): void {
  localTaskStartedWorkspaceStore.setState((state) =>
    state.started.some((entry) => sameWorkspace(entry, workspace))
      ? { started: state.started.filter((entry) => !sameWorkspace(entry, workspace)) }
      : state
  )
}

/** Drops the workspaces the links now name; the links take over grouping them. */
export function settleLocalTaskStartedWorkspaces(links: LocalTaskLinks): void {
  localTaskStartedWorkspaceStore.setState((state) => {
    const pending = state.started.filter(
      (entry) =>
        findLocalTaskLinkForWorkspace(links, { id: entry.worktreeId, hostId: entry.hostId }) ===
        null
    )
    return pending.length === state.started.length ? state : { started: pending }
  })
}

export function localTaskIdForStartedWorkspace(
  started: readonly LocalTaskStartedWorkspace[],
  workspace: { id: string; hostId: string }
): string | null {
  return started.find((entry) => sameWorkspace(entry, workspace))?.taskId ?? null
}
