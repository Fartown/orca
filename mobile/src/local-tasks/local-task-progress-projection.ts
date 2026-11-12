import type {
  LocalTaskAttentionItem,
  LocalTaskLinks,
  LocalTaskProgressSnapshot,
  LocalTaskSessionLink,
  LocalTaskSessionState,
  LocalTaskWorkspaceLink
} from '../../../src/shared/local-tasks/local-task-link-types'
import {
  buildLocalTaskIndex,
  type LocalTaskIndex
} from '../../../src/shared/local-tasks/local-task-grouping'
import { localTaskWorkspaceFamilyIds } from '../../../src/shared/local-tasks/local-task-hierarchy'
import {
  localTaskDescendantIds,
  localTaskEffectiveWorkspace
} from '../../../src/shared/local-tasks/local-task-tree'
import { buildLocalTaskNeedsYouBand } from '../../../src/shared/local-tasks/local-task-needs-you-band'
import type { LocalTask, LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'

// What the phone shows of the library host's judgement. Every state here is the host's; the phone
// only groups, filters and orders it, and says "can't confirm" out of contact.

/** One task's "Needs you" items, merged into a single row. */
export type LocalTaskAttentionRow = {
  task: LocalTask
  review: boolean
  /** Oldest first: the one waiting longest leads. */
  items: LocalTaskAttentionItem[]
  since: number
}

/**
 * "Needs you" of the tasks in scope, grouped as the desktop groups it (the shared band): sessions
 * waiting on the user, newest first, then tasks awaiting acceptance. `visibleIds` narrows it to
 * what a filtered list shows.
 */
export function localTaskNeedsYou(args: {
  snapshot: LocalTaskProgressSnapshot | null
  tasks: readonly LocalTask[]
  projects?: readonly LocalTaskProject[]
  projectId: string | null
  visibleIds?: ReadonlySet<string>
}): { rows: LocalTaskAttentionRow[]; ids: ReadonlySet<string> } {
  const index = buildLocalTaskIndex(args.projects ?? [], args.tasks)
  const scoped = args.tasks.filter(
    (task) =>
      (args.projectId === null || task.projectId === args.projectId) &&
      (!args.visibleIds || args.visibleIds.has(task.id))
  )
  const band = buildLocalTaskNeedsYouBand({
    progress: args.snapshot,
    index,
    visibleIds: new Set(scoped.map((task) => task.id))
  })
  const rows = [...band.waiting, ...band.review].map((row) => {
    const items = [...row.items].sort((a, b) => a.since - b.since)
    return {
      task: row.task,
      review: row.group === 'review',
      items,
      since: items[0]?.since ?? row.task.updatedAt
    }
  })
  return { rows, ids: band.ids }
}

export function localTaskAttentionRows(
  args: Parameters<typeof localTaskNeedsYou>[0]
): LocalTaskAttentionRow[] {
  return localTaskNeedsYou(args).rows
}

export function localTaskAttentionTaskCount(rows: readonly LocalTaskAttentionRow[]): number {
  return rows.length
}

/**
 * A library's links and the host's word on each session, indexed once per load: a page that reads
 * every card passes it, so one card costs its own sessions and not the whole library's.
 */
export type LocalTaskSessionLookup = {
  sessionsByTaskId: ReadonlyMap<string, readonly LocalTaskSessionLink[]>
  sessionsById: ReadonlyMap<string, LocalTaskSessionLink>
  /** Each session's place in the library's list, which breaks ties as that list does. */
  positions: ReadonlyMap<string, number>
  progressById: ReadonlyMap<string, LocalTaskProgressSnapshot['sessions'][number]>
  workspacesByTaskId: ReadonlyMap<string, LocalTaskWorkspaceLink>
}

export function buildLocalTaskSessionLookup(
  links: LocalTaskLinks,
  snapshot: LocalTaskProgressSnapshot | null
): LocalTaskSessionLookup {
  const sessionsByTaskId = new Map<string, LocalTaskSessionLink[]>()
  for (const link of links.sessions) {
    const own = sessionsByTaskId.get(link.taskId)
    if (own) {
      own.push(link)
    } else {
      sessionsByTaskId.set(link.taskId, [link])
    }
  }
  return {
    sessionsByTaskId,
    sessionsById: new Map(links.sessions.map((link) => [link.id, link])),
    positions: new Map(links.sessions.map((link, position) => [link.id, position])),
    progressById: new Map((snapshot?.sessions ?? []).map((entry) => [entry.taskSessionId, entry])),
    workspacesByTaskId: new Map(links.workspaces.map((link) => [link.taskId, link]))
  }
}

/** The sessions these tasks opened, in the library's own order. */
export function localTaskSessionsOf(
  taskIds: Iterable<string>,
  lookup: LocalTaskSessionLookup
): LocalTaskSessionLink[] {
  const found: LocalTaskSessionLink[] = []
  for (const taskId of new Set(taskIds)) {
    found.push(...(lookup.sessionsByTaskId.get(taskId) ?? []))
  }
  const at = (link: LocalTaskSessionLink) => lookup.positions.get(link.id) ?? 0
  return found.sort((a, b) => at(a) - at(b))
}

/** The workspace a task works in: its own, else the nearest ancestor's (REQ-009). */
export function localTaskWorkspaceLinkFor(
  task: LocalTask,
  tasksById: ReadonlyMap<string, LocalTask>,
  links: LocalTaskLinks,
  lookup?: Pick<LocalTaskSessionLookup, 'workspacesByTaskId'>
): LocalTaskWorkspaceLink | null {
  return localTaskEffectiveWorkspace(
    task,
    tasksById,
    lookup?.workspacesByTaskId ?? new Map(links.workspaces.map((link) => [link.taskId, link]))
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
  index: Pick<LocalTaskIndex, 'tasksById' | 'childrenByParentId'>
  links: LocalTaskLinks
  snapshot: LocalTaskProgressSnapshot | null
  inContact: boolean
  /** Built from the same links and snapshot by a page that reads many tasks. */
  lookup?: LocalTaskSessionLookup
}): LocalTaskSessionView[] {
  const lookup = args.lookup ?? buildLocalTaskSessionLookup(args.links, args.snapshot)
  const own = [args.task.id, ...localTaskDescendantIds(args.task.id, args.index.childrenByParentId)]
  return localTaskSessionsOf(own, lookup)
    .sort((a, b) => b.openedAt - a.openedAt)
    .map((link) => {
      const entry = lookup.progressById.get(link.id)
      return {
        link,
        task: args.index.tasksById.get(link.taskId) ?? null,
        state: !args.inContact ? 'unverifiable' : (entry?.state ?? 'unknown'),
        lastMessage: entry?.lastMessage ?? null
      }
    })
}

export type LocalTaskRowSession = { id: string; state: LocalTaskSessionState }

/**
 * The states a list row or board card shows as dots (REQ-012), oldest session first, picked as the
 * desktop picks them: a task with its own workspace shows every session in it, those of descendants
 * without one included; a task working in an ancestor's shows only the sessions it opened. Read from
 * the snapshot already loaded, so it asks the host nothing; out of contact each is unverifiable.
 */
export function localTaskRowSessionStates(args: {
  task: LocalTask
  index: Pick<LocalTaskIndex, 'tasksById' | 'childrenByParentId'>
  links: LocalTaskLinks
  snapshot: LocalTaskProgressSnapshot | null
  inContact: boolean
  /** Built from the same links and snapshot by a page that reads many tasks. */
  lookup?: LocalTaskSessionLookup
}): LocalTaskRowSession[] {
  const lookup = args.lookup ?? buildLocalTaskSessionLookup(args.links, args.snapshot)
  const owns = (taskId: string) => lookup.workspacesByTaskId.has(taskId)
  const family = owns(args.task.id)
    ? localTaskWorkspaceFamilyIds(args.task.id, args.index, owns)
    : [args.task.id]
  return localTaskSessionsOf(family, lookup)
    .sort((a, b) => a.openedAt - b.openedAt)
    .map((link) => ({
      id: link.id,
      state: args.inContact
        ? (lookup.progressById.get(link.id)?.state ?? 'unknown')
        : 'unverifiable'
    }))
}

/** The tasks with an item in "Needs you", for the "A session is waiting on me" filter. */
export function localTaskIdsNeedingYou(rows: readonly LocalTaskAttentionRow[]): Set<string> {
  return new Set(rows.map((row) => row.task.id))
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
