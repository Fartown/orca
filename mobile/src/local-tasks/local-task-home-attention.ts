import type { LocalTaskAttentionItem } from '../../../src/shared/local-tasks/local-task-link-types'
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
export async function readLocalTasksInProgress(api: LocalTasksApi): Promise<number> {
  const status = await api.status()
  if (status.inProgressCount !== undefined) {
    return status.inProgressCount
  }
  const [projects, tasks] = await Promise.all([api.projects(), api.tasks()])
  return countLocalTasksInCategory(tasks, projects, 'started')
}

/** Both of one library's home numbers; a failed half still leaves the library listed. */
export async function readLocalTaskHomeLibrary(
  api: LocalTasksApi,
  where: Pick<LocalTaskHomeLibrary, 'executionHost' | 'label'>
): Promise<LocalTaskHomeLibrary> {
  const [inProgress, attention] = await Promise.all([
    readLocalTasksInProgress(api).catch(() => 'error' as const),
    readLocalTaskHomeAttention(api).catch(() => 'error' as const)
  ])
  return { ...where, inProgress, attention }
}
