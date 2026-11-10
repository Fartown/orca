import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import type { LocalTaskSessionLink } from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import { matchesLocalTaskQuery, type LocalTaskIndex } from './local-task-grouping'

export const LOCAL_TASK_TREE_NEEDS_YOU_KEY = 'view:needs-you'
export const LOCAL_TASK_TREE_UNLINKED_KEY = 'other:unlinked'

/** What task mode opens with, as the task page's own column reads: what waits on you, what is under way. */
const DEFAULT_EXPANDED = [
  LOCAL_TASK_TREE_NEEDS_YOU_KEY,
  'view:started',
  LOCAL_TASK_TREE_UNLINKED_KEY
] as const

type LocalTaskSidebarTreeState = {
  expanded: ReadonlySet<string>
  toggle: (key: string) => void
  setExpanded: (key: string, expanded: boolean) => void
}

/** Kept here, not in upstream's sidebar state, so its persisted collapse set never learns fork keys. */
export const localTaskSidebarTreeStore = createStore<LocalTaskSidebarTreeState>((set) => ({
  expanded: new Set(DEFAULT_EXPANDED),
  toggle: (key) =>
    set((state) => {
      const expanded = new Set(state.expanded)
      if (!expanded.delete(key)) {
        expanded.add(key)
      }
      return { expanded }
    }),
  setExpanded: (key, open) =>
    set((state) => {
      if (state.expanded.has(key) === open) {
        return state
      }
      const expanded = new Set(state.expanded)
      if (open) {
        expanded.add(key)
      } else {
        expanded.delete(key)
      }
      return { expanded }
    })
}))

export function useLocalTaskSidebarTreeExpanded(key: string): boolean {
  return useStore(localTaskSidebarTreeStore, (state) => state.expanded.has(key))
}

function hasAncestorIn(task: LocalTask, index: LocalTaskIndex, ids: ReadonlySet<string>): boolean {
  const seen = new Set<string>([task.id])
  let parentId = task.parentId
  while (parentId && !seen.has(parentId)) {
    if (ids.has(parentId)) {
      return true
    }
    seen.add(parentId)
    parentId = index.tasksById.get(parentId)?.parentId ?? null
  }
  return false
}

/**
 * The tasks a branch lists at its top: each match none of whose ancestors also matches, newest
 * first. A matching subtask under a matching parent shows when that parent is expanded instead.
 */
export function localTaskTreeRoots(
  tasks: readonly LocalTask[],
  index: LocalTaskIndex,
  matches: (task: LocalTask) => boolean
): LocalTask[] {
  const ids = new Set(tasks.filter(matches).map((task) => task.id))
  return tasks
    .filter((task) => ids.has(task.id) && !hasAncestorIn(task, index, ids))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/** Tasks the tree's search keeps: every hit and the ancestors leading to it; null with no query. */
export function localTaskTreeSearchIds(
  tasks: readonly LocalTask[],
  index: LocalTaskIndex,
  query: string
): ReadonlySet<string> | null {
  const trimmed = query.trim()
  if (!trimmed) {
    return null
  }
  const ids = new Set<string>()
  for (const task of tasks) {
    if (!matchesLocalTaskQuery(task, index.projectsById.get(task.projectId), trimmed)) {
      continue
    }
    let current: LocalTask | undefined = task
    while (current && !ids.has(current.id)) {
      ids.add(current.id)
      current = current.parentId ? index.tasksById.get(current.parentId) : undefined
    }
  }
  return ids
}

/** A task's own sessions, oldest first; a subtask's sessions hang under the subtask. */
export function localTaskTreeSessions(
  sessions: readonly LocalTaskSessionLink[],
  taskId: string
): LocalTaskSessionLink[] {
  return sessions
    .filter((session) => session.taskId === taskId)
    .sort((a, b) => a.openedAt - b.openedAt)
}
