import type { LocalTaskIndex } from './local-task-grouping'
import type { LocalTaskAttentionItem } from './local-task-link-types'
import { localTaskNeedsReview } from './local-task-review-items'
import type { LocalTask } from './local-task-types'

export type LocalTaskBandGroup = 'waiting' | 'review'

export type LocalTaskBandRow = {
  task: LocalTask
  group: LocalTaskBandGroup
  /** Live items of the task's own sessions, newest first; empty for a plain review row. */
  items: LocalTaskAttentionItem[]
}

export type LocalTaskNeedsYouBand = {
  waiting: LocalTaskBandRow[]
  review: LocalTaskBandRow[]
  /** Every task the band shows; the status groups below leave them out. */
  ids: ReadonlySet<string>
}

export const EMPTY_LOCAL_TASK_BAND: LocalTaskNeedsYouBand = {
  waiting: [],
  review: [],
  ids: new Set()
}

function hasReviewAncestor(
  task: LocalTask,
  tasksById: LocalTaskIndex['tasksById'],
  reviewIds: ReadonlySet<string>
): boolean {
  const seen = new Set<string>()
  let parentId = task.parentId
  while (parentId && !seen.has(parentId)) {
    if (reviewIds.has(parentId)) {
      return true
    }
    seen.add(parentId)
    parentId = tasksById.get(parentId)?.parentId ?? null
  }
  return false
}

/**
 * The home list's Needs you section, the same on every client: tasks a session waits on the user
 * for, then tasks awaiting acceptance. A task waiting for acceptance shows there even when a session
 * also waits; a subtask whose ancestor awaits acceptance rides in that ancestor's row. Only tasks the
 * current view shows.
 */
// Why generic: each client passes its own progress shape, of which only `items` is read.
export function buildLocalTaskNeedsYouBand<
  Progress extends { readonly items: readonly LocalTaskAttentionItem[] }
>(args: {
  progress: Progress | null
  index: Pick<LocalTaskIndex, 'tasksById' | 'projectsById'>
  visibleIds: ReadonlySet<string>
}): LocalTaskNeedsYouBand {
  const { index, visibleIds } = args
  const reviewIds = new Set<string>()
  for (const id of visibleIds) {
    const task = index.tasksById.get(id)
    if (task && localTaskNeedsReview(task, index.projectsById.get(task.projectId))) {
      reviewIds.add(id)
    }
  }
  const itemsByTask = new Map<string, LocalTaskAttentionItem[]>()
  for (const item of args.progress?.items ?? []) {
    if (!visibleIds.has(item.taskId)) {
      continue
    }
    const items = itemsByTask.get(item.taskId) ?? []
    items.push(item)
    itemsByTask.set(item.taskId, items)
  }
  // Why a copy and sort: the phone's Hermes has no toSorted.
  const newestFirst = (items: readonly LocalTaskAttentionItem[]) =>
    [...items].sort((a, b) => b.since - a.since)
  const review: LocalTaskBandRow[] = []
  for (const id of reviewIds) {
    const task = index.tasksById.get(id)
    if (task && !hasReviewAncestor(task, index.tasksById, reviewIds)) {
      review.push({ task, group: 'review', items: newestFirst(itemsByTask.get(id) ?? []) })
    }
  }
  const waiting: LocalTaskBandRow[] = []
  for (const [taskId, items] of itemsByTask) {
    const task = index.tasksById.get(taskId)
    if (!task || reviewIds.has(taskId) || hasReviewAncestor(task, index.tasksById, reviewIds)) {
      continue
    }
    waiting.push({ task, group: 'waiting', items: newestFirst(items) })
  }
  const newest = (row: LocalTaskBandRow): number => row.items[0]?.since ?? row.task.updatedAt
  waiting.sort((a, b) => newest(b) - newest(a) || a.task.ref.localeCompare(b.task.ref))
  review.sort((a, b) => b.task.updatedAt - a.task.updatedAt || a.task.ref.localeCompare(b.task.ref))
  const ids = new Set([...waiting, ...review].map((row) => row.task.id))
  // Why: a review row stands for its whole subtree, so its subtasks leave the groups below too.
  for (const id of reviewIds) {
    ids.add(id)
  }
  return { waiting, review, ids }
}
