/**
 * Walks of the task tree any depth (D-008), shared so the host's write checks and every client's
 * views agree on ancestry and on which workspace a task works in.
 */
import type { LocalTaskWorkspaceLink } from './local-task-link-types'
import type { LocalTask } from './local-task-types'

type TreeTask = Pick<LocalTask, 'id' | 'parentId'>

/** Ancestors, nearest first; stops at a missing parent or a cycle a broken library might hold. */
export function localTaskAncestors<T extends TreeTask>(
  task: TreeTask,
  tasksById: ReadonlyMap<string, T>
): T[] {
  const ancestors: T[] = []
  const seen = new Set([task.id])
  let parentId = task.parentId
  while (parentId && !seen.has(parentId)) {
    const parent = tasksById.get(parentId)
    if (!parent) {
      break
    }
    ancestors.push(parent)
    seen.add(parent.id)
    parentId = parent.parentId
  }
  return ancestors
}

/** Every descendant id, any depth, breadth first. */
export function localTaskDescendantIds(
  taskId: string,
  childrenByParentId: ReadonlyMap<string, readonly TreeTask[]>
): string[] {
  const found: string[] = []
  const seen = new Set([taskId])
  const queue = [taskId]
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const child of childrenByParentId.get(next) ?? []) {
      if (!seen.has(child.id)) {
        seen.add(child.id)
        found.push(child.id)
        queue.push(child.id)
      }
    }
  }
  return found
}

/** The workspace a task works in: its own link, else the nearest ancestor's (REQ-009). */
export function localTaskEffectiveWorkspace<W extends Pick<LocalTaskWorkspaceLink, 'taskId'>>(
  task: TreeTask,
  tasksById: ReadonlyMap<string, TreeTask>,
  workspacesByTaskId: ReadonlyMap<string, W>
): W | null {
  for (const candidate of [task, ...localTaskAncestors(task, tasksById)]) {
    const workspace = workspacesByTaskId.get(candidate.id)
    if (workspace) {
      return workspace
    }
  }
  return null
}
