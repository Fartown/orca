import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type {
  LocalTaskPriority,
  LocalTaskStatusCategory
} from '../../../shared/local-tasks/local-task-model'
import type { LocalTask, LocalTaskFailure } from '../../../shared/local-tasks/local-task-types'
import type { LocalTasksTasksUpdateInput } from '../../../shared/local-tasks/local-tasks-rpc-params'
import { describeLocalTaskFailure } from './local-task-failure-copy'
import { localTasksClient } from './local-tasks-runtime-client'
import { localTasksDomainStore } from './local-tasks-domain-store'
import { localTasksSync } from './local-tasks-sync'
import { localTaskFailureEndpoint } from './local-tasks-endpoint-calls'
import { firstStatusInCategory } from './local-task-grouping'

export function reportLocalTaskFailure(failure: LocalTaskFailure): void {
  toast.error(describeLocalTaskFailure(failure))
  // Why: these two mean the shown copy is behind that library; re-read it so the next try is fresh.
  const endpoint = localTaskFailureEndpoint(failure)
  if (endpoint && (failure.code === 'stale' || failure.code === 'not_found')) {
    void localTasksSync.refresh(['projects', 'tasks'], endpoint)
  }
}

/** Runs one write; a refusal or a broken call becomes a toast and resolves to null. */
export async function runLocalTaskWrite<T extends { ok: true }>(
  run: () => Promise<T | LocalTaskFailure>
): Promise<T | null> {
  try {
    const result = await run()
    if (result.ok) {
      return result
    }
    reportLocalTaskFailure(result)
    return null
  } catch (error) {
    toast.error(
      translate('localTasks.failure.callFailed', 'Could not save the change: {{message}}', {
        message: error instanceof Error ? error.message : String(error)
      })
    )
    return null
  }
}

function upsert(tasks: LocalTask[], options?: { created?: boolean }): void {
  localTasksDomainStore.getState().upsertTasks(tasks, options)
}

export async function updateLocalTaskFields(
  task: LocalTask,
  patch: LocalTasksTasksUpdateInput['patch']
): Promise<boolean> {
  const result = await runLocalTaskWrite(() =>
    localTasksClient.updateTask({ taskId: task.id, expectedRevision: task.revision, patch })
  )
  if (result) {
    upsert([result.task])
  }
  return result !== null
}

export type LocalTaskPatchOutcome = 'saved' | 'stale' | 'failed'

/**
 * Saves an edited field against the revision the edit started from. `stale` comes back to the
 * caller untouched, because only the editor knows whether its own field was changed elsewhere.
 */
export async function saveLocalTaskPatch(
  taskId: string,
  patch: LocalTasksTasksUpdateInput['patch'],
  expectedRevision: number
): Promise<LocalTaskPatchOutcome> {
  try {
    const result = await localTasksClient.updateTask({ taskId, expectedRevision, patch })
    if (result.ok) {
      upsert([result.task])
      return 'saved'
    }
    if (result.code === 'stale') {
      return 'stale'
    }
    reportLocalTaskFailure(result)
    return 'failed'
  } catch (error) {
    toast.error(
      translate('localTasks.failure.callFailed', 'Could not save the change: {{message}}', {
        message: error instanceof Error ? error.message : String(error)
      })
    )
    return 'failed'
  }
}

/**
 * Sets one status for every task, or the first status of a category in each task's own project
 * when the tasks span projects. One batch per project, since a status belongs to one project.
 */
export async function setLocalTasksStatus(
  tasks: readonly LocalTask[],
  target: { statusId: string } | { category: LocalTaskStatusCategory }
): Promise<void> {
  const { projects } = localTasksDomainStore.getState()
  const byStatus = new Map<string, string[]>()
  for (const task of tasks) {
    const statusId =
      'statusId' in target
        ? target.statusId
        : firstStatusInCategory(
            projects.find((project) => project.id === task.projectId),
            target.category
          )?.id
    if (statusId && statusId !== task.statusId) {
      byStatus.set(statusId, [...(byStatus.get(statusId) ?? []), task.id])
    }
  }
  for (const [statusId, taskIds] of byStatus) {
    await runLocalTaskWrite(() =>
      localTasksClient.batchUpdateTasks({ taskIds, patch: { statusId } })
    )
  }
}

export async function setLocalTasksPriority(
  tasks: readonly LocalTask[],
  priority: LocalTaskPriority
): Promise<void> {
  const taskIds = tasks.filter((task) => task.priority !== priority).map((task) => task.id)
  if (taskIds.length > 0) {
    await runLocalTaskWrite(() =>
      localTasksClient.batchUpdateTasks({ taskIds, patch: { priority } })
    )
  }
}

/** Adds the label to every task unless all already carry it, in which case it removes it. */
export async function toggleLocalTasksLabel(
  tasks: readonly LocalTask[],
  label: string
): Promise<void> {
  if (tasks.length === 0) {
    return
  }
  const taskIds = tasks.map((task) => task.id)
  const patch = tasks.every((task) => task.labels.includes(label))
    ? { removeLabels: [label] }
    : { addLabels: [label] }
  await runLocalTaskWrite(() => localTasksClient.batchUpdateTasks({ taskIds, patch }))
}

/** Each pasted line becomes one subtask; list markers and checkboxes are dropped. */
export function parseSubtaskLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*(?:[-*•+]|\d+[.)])\s+/, '')
        .replace(/^\[[ xX]\]\s+/, '')
        .trim()
    )
    .filter((line) => line.length > 0)
}

export async function createLocalSubtasks(
  parent: LocalTask,
  titles: string[]
): Promise<LocalTask[] | null> {
  const result = await runLocalTaskWrite(() =>
    localTasksClient.createSubtasks({ parentId: parent.id, titles })
  )
  if (result) {
    upsert(result.tasks, { created: true })
  }
  return result?.tasks ?? null
}
