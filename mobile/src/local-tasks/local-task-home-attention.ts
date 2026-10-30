import type { LocalTaskAttentionItem } from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTasksStatus } from '../../../src/shared/local-tasks/local-task-types'
import { localTaskLibraryHasProjects, localTaskSourceShown } from './local-tasks-access'
import type { LocalTasksApi } from './local-tasks-api'
import { countLocalTasksInCategory } from './local-task-list-projection'
import {
  localTaskAttentionItemCount,
  localTaskAttentionRows
} from './local-task-progress-projection'

const HOME_ROWS = 3

export type LocalTaskHomeAttentionRow = {
  taskId: string
  ref: string
  title: string
  /** The item waiting longest in this task, which is what the row says. */
  item: LocalTaskAttentionItem
  since: number
}

export type LocalTaskHomeAttention = { count: number; rows: LocalTaskHomeAttentionRow[] }

/** One library as home counts it: each half is null until read, `error` when its read failed. */
export type LocalTaskHomeLibrary = {
  /** The server behind the paired host; absent for the paired host's own library. */
  executionHost?: `runtime:${string}`
  label: string
  inProgress: number | 'error'
  attention: LocalTaskHomeAttention | 'error'
}

/**
 * Home's "Needs you" of one library: the host's live judgement, counted and cut to the tasks
 * waiting longest. Tasks are read only when there is an item to name, so a quiet library costs one
 * small read.
 */
export async function readLocalTaskHomeAttention(
  api: LocalTasksApi
): Promise<LocalTaskHomeAttention> {
  const snapshot = await api.progress()
  if (snapshot.items.length === 0) {
    return { count: 0, rows: [] }
  }
  const rows = localTaskAttentionRows({ snapshot, tasks: await api.tasks(), projectId: null })
  return {
    count: localTaskAttentionItemCount(rows),
    rows: rows.slice(0, HOME_ROWS).map((row) => ({
      taskId: row.task.id,
      ref: row.task.ref,
      title: row.task.title,
      item: row.items[0],
      since: row.since
    }))
  }
}

/** Tasks in the Started category, from the host's own count when it gives one. */
async function readLocalTasksInProgress(
  api: LocalTasksApi,
  status: LocalTasksStatus
): Promise<number> {
  if (status.inProgressCount !== undefined) {
    return status.inProgressCount
  }
  const [projects, tasks] = await Promise.all([api.projects(), api.tasks()])
  return countLocalTasksInCategory(tasks, projects, 'started')
}

/**
 * Both of one library's home numbers, or null for a library home leaves out: one with no project,
 * one its host's user hid from the desktop's task sources, one that is not open (starting,
 * unavailable), or one whose status could not be read. Only its status is read in those cases,
 * since the rest would be refused, count nothing, or not be shown.
 */
export async function readLocalTaskHomeLibrary(
  api: LocalTasksApi,
  where: Pick<LocalTaskHomeLibrary, 'executionHost' | 'label'>
): Promise<LocalTaskHomeLibrary | null> {
  const status = await api.status().catch(() => null)
  if (
    !status ||
    (status.state !== 'ready' && status.state !== 'read-only') ||
    !localTaskLibraryHasProjects(status) ||
    !localTaskSourceShown(status)
  ) {
    return null
  }
  const [inProgress, attention] = await Promise.all([
    readLocalTasksInProgress(api, status).catch(() => 'error' as const),
    readLocalTaskHomeAttention(api).catch(() => 'error' as const)
  ])
  return { ...where, inProgress, attention }
}
