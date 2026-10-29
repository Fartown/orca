import type {
  LocalTaskAttentionItem,
  LocalTaskLinks,
  LocalTaskProgressSnapshot,
  LocalTaskSessionLink,
  LocalTaskSessionState,
  LocalTaskWorkspaceLink
} from '../../../src/shared/local-tasks/local-task-link-types'
import { buildLocalTaskIndex } from '../../../src/shared/local-tasks/local-task-grouping'
import {
  localTaskDescendantIds,
  localTaskEffectiveWorkspace
} from '../../../src/shared/local-tasks/local-task-tree'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'

// What the phone shows of the library host's judgement. Every state here is the host's; the phone
// only groups, filters and orders it, and says "can't confirm" out of contact.

/** One task's "Needs you" items, merged into a single row. */
export type LocalTaskAttentionRow = {
  task: LocalTask
  /** Oldest first: the one waiting longest leads. */
  items: LocalTaskAttentionItem[]
  since: number
}

/** Items of tasks in scope, one row per task, the task waiting longest first. */
export function localTaskAttentionRows(args: {
  snapshot: LocalTaskProgressSnapshot | null
  tasks: readonly LocalTask[]
  projectId: string | null
}): LocalTaskAttentionRow[] {
  if (!args.snapshot) {
    return []
  }
  const tasksById = new Map(args.tasks.map((task) => [task.id, task]))
  const rows = new Map<string, LocalTaskAttentionRow>()
  for (const item of args.snapshot.items) {
    const task = tasksById.get(item.taskId)
    if (!task || (args.projectId !== null && task.projectId !== args.projectId)) {
      continue
    }
    const row = rows.get(task.id) ?? { task, items: [], since: item.since }
    row.items.push(item)
    row.since = Math.min(row.since, item.since)
    rows.set(task.id, row)
  }
  return [...rows.values()]
    .map((row) => ({ ...row, items: [...row.items].sort((a, b) => a.since - b.since) }))
    .sort((a, b) => a.since - b.since || a.task.number - b.task.number)
}

export function localTaskAttentionItemCount(rows: readonly LocalTaskAttentionRow[]): number {
  return rows.reduce((sum, row) => sum + row.items.length, 0)
}

/** The workspace a task works in: its own, else the nearest ancestor's (REQ-009). */
export function localTaskWorkspaceLinkFor(
  task: LocalTask,
  tasksById: ReadonlyMap<string, LocalTask>,
  links: LocalTaskLinks
): LocalTaskWorkspaceLink | null {
  return localTaskEffectiveWorkspace(
    task,
    tasksById,
    new Map(links.workspaces.map((link) => [link.taskId, link]))
  )
}

export type LocalTaskSessionView = {
  link: LocalTaskSessionLink
  /** The task the session was opened for; a descendant's sessions also list on its ancestors. */
  task: LocalTask | null
  state: LocalTaskSessionState
  lastMessage: string | null
}

/**
 * The sessions shown on a task: its own and every descendant's. Out of contact with the library's
 * host, each reads `unverifiable` and keeps its last words; a session the host's answer leaves out
 * has no status it could report.
 */
export function localTaskSessionViews(args: {
  task: LocalTask
  tasks: readonly LocalTask[]
  links: LocalTaskLinks
  snapshot: LocalTaskProgressSnapshot | null
  inContact: boolean
}): LocalTaskSessionView[] {
  const { tasksById, childrenByParentId } = buildLocalTaskIndex([], args.tasks)
  const own = new Set([args.task.id, ...localTaskDescendantIds(args.task.id, childrenByParentId)])
  const progress = new Map(
    (args.snapshot?.sessions ?? []).map((entry) => [entry.taskSessionId, entry])
  )
  return args.links.sessions
    .filter((link) => own.has(link.taskId))
    .sort((a, b) => b.openedAt - a.openedAt)
    .map((link) => {
      const entry = progress.get(link.id)
      return {
        link,
        task: tasksById.get(link.taskId) ?? null,
        state: !args.inContact ? 'unverifiable' : (entry?.state ?? 'unknown'),
        lastMessage: entry?.lastMessage ?? null
      }
    })
}

/** The items one session holds, which opening that session marks seen (技术方案 §9.2). */
export function localTaskItemsForSession(
  snapshot: LocalTaskProgressSnapshot | null,
  taskSessionId: string
): LocalTaskAttentionItem[] {
  return (snapshot?.items ?? []).filter((item) => item.taskSessionId === taskSessionId)
}

/**
 * The items a session in view has shown its user: those already waiting when it came into view,
 * the way the desktop forwards only items seen at or after their `since`. One that arrives later
 * waits for the next time the session comes into view.
 */
export function localTaskItemsSeenInSession(
  snapshot: LocalTaskProgressSnapshot | null,
  taskSessionId: string,
  visibleSince: number
): LocalTaskAttentionItem[] {
  return localTaskItemsForSession(snapshot, taskSessionId).filter(
    (item) => item.since <= visibleSince
  )
}
