import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import type { LocalTaskLinks } from '../../../shared/local-tasks/local-task-link-types'
import { localTaskWorkspaceFamilyIds } from '../../../shared/local-tasks/local-task-hierarchy'
import { localTaskEffectiveWorkspace } from '../../../shared/local-tasks/local-task-tree'
import { buildLocalTaskIndex } from './local-task-grouping'
import { localTaskEndpointForHost, localTaskIdEndpoint } from './local-task-endpoints'
import { findLocalTaskLinkForWorkspace } from './local-task-link-selectors'

export function localTaskSessionLinkChoices(
  tasks: readonly LocalTask[],
  links: LocalTaskLinks,
  workspace: { id: string; hostId: string; instanceId?: string }
): { task: LocalTask; crossHost: boolean }[] {
  const linked = findLocalTaskLinkForWorkspace(links, workspace)
  const owners = new Set(links.workspaces.map((link) => link.taskId))
  const index = buildLocalTaskIndex([], tasks)
  const native = new Set(
    linked ? localTaskWorkspaceFamilyIds(linked.taskId, index, (id) => owners.has(id)) : []
  )
  const workspaces = new Map(links.workspaces.map((link) => [link.taskId, link]))
  const endpoint = localTaskEndpointForHost(workspace.hostId)
  return tasks.flatMap<{ task: LocalTask; crossHost: boolean }>((task) => {
    if (native.has(task.id)) {
      return [{ task, crossHost: false }]
    }
    const target = localTaskEffectiveWorkspace(task, index.tasksById, workspaces)
    return localTaskIdEndpoint(task.id) !== endpoint ||
      (target !== null && target.hostId !== workspace.hostId)
      ? [{ task, crossHost: true }]
      : []
  })
}
