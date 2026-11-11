import {
  buildLocalTaskIndex,
  localTaskCategory
} from '../../../src/shared/local-tasks/local-task-grouping'
import type { LocalTaskAttentionItem } from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTasksStatus } from '../../../src/shared/local-tasks/local-task-types'
import { localTaskLibraryHasProjects, localTaskSourceShown } from './local-tasks-access'
import type { LocalTasksApi } from './local-tasks-api'
import { countLocalTasksInCategory } from './local-task-list-projection'
import {
  localTaskAttentionTaskCount,
  localTaskAttentionRows
} from './local-task-progress-projection'

const HOME_ROWS = 3

export type LocalTaskHomeAttentionRow = {
  taskId: string
  ref: string
  title: string
  latestLine: string | null
  /** The item waiting longest in this task, which is what the row says. */
  item: LocalTaskAttentionItem | null
  since: number
}

/** The newest writeback of a task in progress that "Needs you" does not already show. */
export type LocalTaskHomeLatest = {
  taskId: string
  ref: string
  body: string
  at: number
  writeback: boolean
}

export type LocalTaskHomeAttention = {
  count: number
  rows: LocalTaskHomeAttentionRow[]
  latest: LocalTaskHomeLatest | null
  /** Top-level tasks not completed or canceled: what "View all" opens. */
  openCount: number
}

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
  const [snapshot, tasks, projects] = await Promise.all([
    api.progress(),
    api.tasks(),
    api.projects()
  ])
  const rows = localTaskAttentionRows({ snapshot, tasks, projects, projectId: null })
  const index = buildLocalTaskIndex(projects, tasks)
  const shown = new Set(rows.map((row) => row.task.id))
  const latest = tasks
    .filter(
      (task) =>
        !shown.has(task.id) &&
        task.latestProgress?.body &&
        localTaskCategory(task, index) === 'started'
    )
    .sort((a, b) => (b.latestProgress?.at ?? 0) - (a.latestProgress?.at ?? 0))[0]
  return {
    latest: latest?.latestProgress
      ? {
          taskId: latest.id,
          ref: latest.ref,
          body: latest.latestProgress.body.replace(/\s*\n+\s*/g, ' '),
          at: latest.latestProgress.at,
          writeback: latest.latestProgress.kind !== 'turn-ended'
        }
      : null,
    openCount: tasks.filter((task) => {
      const category = localTaskCategory(task, index)
      return task.parentId === null && category !== 'completed' && category !== 'canceled'
    }).length,
    count: localTaskAttentionTaskCount(rows),
    rows: rows.slice(0, HOME_ROWS).map((row) => ({
      taskId: row.task.id,
      ref: row.task.ref,
      title: row.task.title,
      latestLine:
        row.task.latestProgress?.body ??
        snapshot.sessions.find((session) => session.taskSessionId === row.items[0]?.taskSessionId)
          ?.lastMessage ??
        null,
      item: row.items[0] ?? null,
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
