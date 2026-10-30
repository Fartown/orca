import { useCallback, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { selectExecutionHostDisplayLabel } from '@/lib/execution-host-display-label'
import type { ExecutionHostId } from '../../../shared/execution-host'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import type { Worktree } from '../../../shared/worktree/types'
import { localTaskEndpointForHost } from './local-task-endpoints'
import { findLocalTaskLinkForWorkspace } from './local-task-link-selectors'
import type { LocalTaskSourceTab } from './local-task-source-tab'
import { linkLocalTaskWorkspace, unlinkLocalTaskWorkspace } from './local-task-workspace-linking'
import {
  localTaskWorktreeHostId,
  orcaProjectIdsForWorktree
} from './local-task-workspace-resolution'
import { localTasksDomainStore, useLocalTasksDomain } from './local-tasks-domain-store'

type DraftWorkspace = { id: string; hostId: ExecutionHostId; instanceId?: string }

/** Save's write: unlink the old task first, as the library refuses a second task on a workspace. */
async function commitLocalTaskLinkDraft(
  worktree: Worktree,
  workspace: DraftWorkspace,
  taskId: string | null
): Promise<string | null> {
  const current =
    findLocalTaskLinkForWorkspace(localTasksDomainStore.getState().links, workspace)?.taskId ?? null
  if (taskId === current) {
    return null
  }
  const failed = translate(
    'localTasks.sourceTab.saveFailed',
    'The task link was not saved. Save again to retry.'
  )
  if (current !== null && !(await unlinkLocalTaskWorkspace(current, { announce: false }))) {
    return failed
  }
  if (taskId === null) {
    return null
  }
  const linked = await linkLocalTaskWorkspace(useAppStore.getState(), {
    taskId,
    worktree,
    hostId: workspace.hostId,
    linkedVia: 'manual'
  })
  return linked ? null : failed
}

/**
 * The task a workspace belongs to, as a draft in Orca's workspace details (REQ-011): picking a task
 * or removing it changes only the draft, Save writes it to the library of the Orca serving the
 * workspace, Cancel writes nothing. A second pick replaces the first; one workspace, one task.
 */
export function useLocalTaskLinkDraft(args: {
  worktree: Worktree | undefined
  executionHostId?: ExecutionHostId
  initialMode: boolean
}): LocalTaskSourceTab | null {
  const { worktree, executionHostId, initialMode } = args
  const hostId = useAppStore((state) =>
    worktree
      ? localTaskWorktreeHostId(state, {
          id: worktree.id,
          hostId: worktree.hostId ?? executionHostId
        })
      : null
  )
  const orcaProjectIds = useAppStore(
    useShallow((state) => (worktree ? [...orcaProjectIdsForWorktree(state, worktree)].sort() : []))
  )
  const endpoint = hostId ? localTaskEndpointForHost(hostId) : null
  const libraryLabel = useAppStore((state) =>
    endpoint ? selectExecutionHostDisplayLabel(state, endpoint) : ''
  )
  const workspace = useMemo<DraftWorkspace | null>(
    () =>
      worktree && hostId
        ? {
            id: worktree.id,
            hostId,
            ...(worktree.instanceId ? { instanceId: worktree.instanceId } : {})
          }
        : null,
    [hostId, worktree]
  )
  const linkedTaskId = useLocalTasksDomain((state) =>
    workspace ? (findLocalTaskLinkForWorkspace(state.links, workspace)?.taskId ?? null) : null
  )
  // Why null for untouched: the saved link then shows live, even if links load after opening.
  const [draft, setDraft] = useState<{ taskId: string | null } | null>(null)
  const select = useCallback((task: LocalTask) => setDraft({ taskId: task.id }), [])
  const remove = useCallback(() => setDraft({ taskId: null }), [])
  const commit = useCallback(
    async (): Promise<string | null> =>
      draft && worktree && workspace
        ? commitLocalTaskLinkDraft(worktree, workspace, draft.taskId)
        : null,
    [draft, workspace, worktree]
  )
  const selectedTaskId = draft ? draft.taskId : linkedTaskId
  return useMemo<LocalTaskSourceTab | null>(
    () =>
      workspace
        ? {
            hostId: workspace.hostId,
            orcaProjectIds,
            workspace,
            libraryLabel,
            selectedTaskId,
            initialMode,
            select,
            draft: { linkedTaskId, remove, commit }
          }
        : null,
    [
      commit,
      initialMode,
      libraryLabel,
      linkedTaskId,
      orcaProjectIds,
      remove,
      select,
      selectedTaskId,
      workspace
    ]
  )
}
