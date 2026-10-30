import { useMemo } from 'react'
import type {
  LocalTaskLinks,
  LocalTaskSessionLink,
  LocalTaskWorkspaceLink
} from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import { localTaskEffectiveWorkspace } from '../../../shared/local-tasks/local-task-tree'
import { useLocalTasksDomain } from './local-tasks-domain-store'

/** The task's own workspace link; any level may hold one (D-008). */
export function findLocalTaskWorkspaceLink(
  links: LocalTaskLinks,
  taskId: string
): LocalTaskWorkspaceLink | null {
  return links.workspaces.find((link) => link.taskId === taskId) ?? null
}

export function useLocalTaskWorkspaceLink(taskId: string | null): LocalTaskWorkspaceLink | null {
  return useLocalTasksDomain((state) =>
    taskId === null ? null : findLocalTaskWorkspaceLink(state.links, taskId)
  )
}

/** Where a task works: its own workspace, else the nearest ancestor's (REQ-009). */
export function findLocalTaskEffectiveWorkspace(
  links: LocalTaskLinks,
  task: Pick<LocalTask, 'id' | 'parentId'>,
  tasksById: ReadonlyMap<string, Pick<LocalTask, 'id' | 'parentId'>>
): LocalTaskWorkspaceLink | null {
  return localTaskEffectiveWorkspace(
    task,
    tasksById,
    new Map(links.workspaces.map((link) => [link.taskId, link]))
  )
}

export function useLocalTaskEffectiveWorkspace(
  task: Pick<LocalTask, 'id' | 'parentId'> | null,
  tasksById: ReadonlyMap<string, Pick<LocalTask, 'id' | 'parentId'>>
): LocalTaskWorkspaceLink | null {
  const links = useLocalTasksDomain((state) => state.links)
  return useMemo(
    () => (task ? findLocalTaskEffectiveWorkspace(links, task, tasksById) : null),
    [links, task, tasksById]
  )
}

/** Sessions opened for these tasks, oldest first. */
export function useLocalTaskSessionLinks(taskIds: readonly string[]): LocalTaskSessionLink[] {
  const sessions = useLocalTasksDomain((state) => state.links.sessions)
  const key = taskIds.join('\n')
  return useMemo(() => {
    const wanted = new Set(key.split('\n'))
    return sessions
      .filter((session) => wanted.has(session.taskId))
      .sort((left, right) => left.openedAt - right.openedAt)
  }, [sessions, key])
}

/** The task a workspace belongs to, by its sidebar id on a host. */
export { findLocalTaskLinkForWorkspace } from '../../../shared/local-tasks/local-task-workspace-match'
