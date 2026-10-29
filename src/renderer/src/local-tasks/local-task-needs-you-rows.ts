import type { LocalTaskAttentionItem } from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import type { LocalTaskProgressView } from './local-tasks-derived-state'
import type { LocalTaskReplyDraft } from './local-task-needs-you-store'

/**
 * `listed`: the host lists it now. The other two are kept only for an open reply box:
 * `unconfirmed` while nobody can judge the session (its host is out of contact), `moved-on` once
 * the host judged it and no longer lists the item.
 */
export type LocalTaskNeedsYouStanding = 'listed' | 'unconfirmed' | 'moved-on'

export type LocalTaskNeedsYouEntry = {
  item: LocalTaskAttentionItem
  standing: LocalTaskNeedsYouStanding
}

/** One task's line in the Needs you view: its items merged. */
export type LocalTaskNeedsYouRow = {
  task: LocalTask
  entries: LocalTaskNeedsYouEntry[]
  newest: number
}

/** An item's key in this window: the host's key is unique only inside its own library. */
export function localTaskItemClientKey(
  item: Pick<LocalTaskAttentionItem, 'taskSessionId' | 'key'>
): string {
  return `${item.taskSessionId}\n${item.key}`
}

/** Items of libraries in contact (already minus seen and snoozed), in project scope. */
export function liveLocalTaskItems(
  progress: LocalTaskProgressView | null,
  tasksById: ReadonlyMap<string, LocalTask>,
  scopeProjectId: string | null
): LocalTaskAttentionItem[] {
  return (progress?.items ?? []).filter((item) => {
    const task = tasksById.get(item.taskId)
    return task !== undefined && (scopeProjectId === null || task.projectId === scopeProjectId)
  })
}

/** Tasks with at least one item in Needs you, for the list filter (REQ-012). */
export function localTaskIdsNeedingYou(progress: LocalTaskProgressView | null): Set<string> {
  return new Set((progress?.items ?? []).map((item) => item.taskId))
}

export function buildLocalTaskNeedsYouRows(args: {
  progress: LocalTaskProgressView | null
  drafts: Readonly<Record<string, LocalTaskReplyDraft>>
  tasksById: ReadonlyMap<string, LocalTask>
  scopeProjectId: string | null
}): LocalTaskNeedsYouRow[] {
  const rows = new Map<string, LocalTaskNeedsYouRow>()
  const shownKeys = new Set<string>()
  const addEntry = (item: LocalTaskAttentionItem, standing: LocalTaskNeedsYouStanding): void => {
    const key = localTaskItemClientKey(item)
    const task = shownKeys.has(key) ? undefined : args.tasksById.get(item.taskId)
    if (!task || (args.scopeProjectId !== null && task.projectId !== args.scopeProjectId)) {
      return
    }
    let row = rows.get(task.id)
    if (!row) {
      row = { task, entries: [], newest: 0 }
      rows.set(task.id, row)
    }
    shownKeys.add(key)
    row.entries.push({ item, standing })
    row.newest = Math.max(row.newest, item.since)
  }
  for (const item of liveLocalTaskItems(args.progress, args.tasksById, args.scopeProjectId)) {
    addEntry(item, 'listed')
  }
  for (const draft of Object.values(args.drafts)) {
    addEntry(draft.item, unlistedDraftStanding(args.progress, draft.item))
  }
  return [...rows.values()].sort(
    (a, b) => b.newest - a.newest || a.task.ref.localeCompare(b.task.ref)
  )
}

// Why: losing contact only leaves a session unverifiable; it says nothing about its turn.
function unlistedDraftStanding(
  progress: LocalTaskProgressView | null,
  item: LocalTaskAttentionItem
): LocalTaskNeedsYouStanding {
  const session = progress?.sessions.get(item.taskSessionId)
  return !progress || session?.state === 'unverifiable' ? 'unconfirmed' : 'moved-on'
}
