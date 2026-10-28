import {
  localTaskAncestors,
  localTaskDescendantIds
} from '../../../shared/local-tasks/local-task-tree'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import type { LocalTaskIndex } from './local-task-grouping'

type TreeIndex = Pick<LocalTaskIndex, 'tasksById' | 'childrenByParentId'>

/** A task's ancestors root first, the way its "SHOP-1 › SHOP-4" path reads. */
export function localTaskPathFromRoot(
  task: LocalTask,
  tasksById: ReadonlyMap<string, LocalTask>
): LocalTask[] {
  return localTaskAncestors(task, tasksById).toReversed()
}

/** "SHOP-1 › SHOP-4 Parent title": every ancestor's ref, root first, then the parent's title. */
export function localTaskPathLabel(path: readonly LocalTask[]): string {
  const parent = path.at(-1)
  return parent ? `${path.map((ancestor) => ancestor.ref).join(' › ')} ${parent.title}` : ''
}

/**
 * Tasks a task may hang under (REQ-004): any level of its own project, never itself or one of its
 * descendants, which the host refuses as a cycle. With no task yet (New task), every task qualifies.
 */
export function localTaskParentCandidates(
  task: Pick<LocalTask, 'id'> | null,
  projectId: string | null,
  tasks: readonly LocalTask[],
  index: TreeIndex
): LocalTask[] {
  const excluded = new Set(
    task ? [task.id, ...localTaskDescendantIds(task.id, index.childrenByParentId)] : []
  )
  return tasks.filter(
    (candidate) => candidate.projectId === projectId && !excluded.has(candidate.id)
  )
}

/**
 * The task and every descendant that works in the task's own workspace: a descendant with a
 * workspace of its own takes its subtree there (REQ-009, REQ-011).
 */
export function localTaskWorkspaceFamilyIds(
  taskId: string,
  index: TreeIndex,
  ownsWorkspace: (taskId: string) => boolean
): string[] {
  const family = [taskId]
  const seen = new Set(family)
  for (let at = 0; at < family.length; at += 1) {
    for (const child of index.childrenByParentId.get(family[at]) ?? []) {
      if (!seen.has(child.id) && !ownsWorkspace(child.id)) {
        seen.add(child.id)
        family.push(child.id)
      }
    }
  }
  return family
}
