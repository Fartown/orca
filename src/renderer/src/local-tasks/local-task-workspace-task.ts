import { useMemo } from 'react'
import { useAppStore } from '@/store'
import type { Worktree } from '../../../shared/worktree/types'
import type { LocalTask, LocalTaskStatusDef } from '../../../shared/local-tasks/local-task-types'
import { localTaskIdEndpoint } from './local-task-endpoints'
import { findLocalTaskLinkForWorkspace } from './local-task-link-selectors'
import { localTaskWorktreeHostId } from './local-task-workspace-resolution'
import { selectLocalTasksPartition, useLocalTasksDomain } from './local-tasks-domain-store'

type WorkspaceRef = Pick<Worktree, 'id' | 'hostId' | 'instanceId'>

export type LocalTaskOfWorkspace = {
  task: LocalTask
  status: LocalTaskStatusDef | null
  /** False while the library's Orca is out of contact, so its last status cannot be vouched for. */
  inContact: boolean
}

/** The task a workspace belongs to, read from links without contacting the workspace's host. */
export function useLocalTaskOfWorkspace(
  worktree: WorkspaceRef | undefined
): LocalTaskOfWorkspace | null {
  // Why gate: every sidebar card asks; with no linked workspace nothing else is read.
  const anyLinked = useLocalTasksDomain((state) => state.links.workspaces.length > 0)
  const hostId = useAppStore((state) =>
    anyLinked && worktree ? localTaskWorktreeHostId(state, worktree) : null
  )
  const task = useLocalTasksDomain((state) => {
    if (!worktree || hostId === null) {
      return null
    }
    const link = findLocalTaskLinkForWorkspace(state.links, {
      id: worktree.id,
      hostId,
      ...(worktree.instanceId ? { instanceId: worktree.instanceId } : {})
    })
    return link ? (state.tasks.find((candidate) => candidate.id === link.taskId) ?? null) : null
  })
  const status = useLocalTasksDomain((state) =>
    task
      ? (state.projects
          .find((project) => project.id === task.projectId)
          ?.statuses.find((candidate) => candidate.id === task.statusId) ?? null)
      : null
  )
  const inContact = useLocalTasksDomain(
    (state) =>
      !task || selectLocalTasksPartition(state, localTaskIdEndpoint(task.id))?.inContact !== false
  )
  return useMemo(() => (task ? { task, status, inContact } : null), [task, status, inContact])
}

export function useLocalTaskWorkspaceLinked(worktree: WorkspaceRef | undefined): boolean {
  return useLocalTaskOfWorkspace(worktree) !== null
}
