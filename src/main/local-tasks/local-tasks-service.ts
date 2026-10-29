import type {
  LocalTask,
  LocalTaskEvent,
  LocalTaskEventSource,
  LocalTaskFailure,
  LocalTaskProject
} from '../../shared/local-tasks/local-task-types'
import type {
  LocalTasksEventsAddCommentInput,
  LocalTasksEventsEditCommentInput,
  LocalTasksProjectsCreateInput,
  LocalTasksProjectsUpdateInput,
  LocalTasksStatusesRemoveInput,
  LocalTasksStatusesReorderInput,
  LocalTasksStatusesUpsertInput,
  LocalTasksTasksBatchUpdateInput,
  LocalTasksTasksCreateInput,
  LocalTasksTasksCreateSubtasksInput,
  LocalTasksTasksMoveInput,
  LocalTasksTasksUpdateInput
} from '../../shared/local-tasks/local-tasks-rpc-params'
import { z, type ZodType } from 'zod'
import {
  projectSchema,
  taskSchema,
  writeResultSchema
} from '../../shared/local-tasks/local-task-result-schemas'
import type { LocalTasksDatabase } from './local-tasks-database'
import {
  addLocalTaskComment,
  editLocalTaskComment,
  listLocalTaskEvents,
  removeLocalTaskComment
} from './local-task-event-store'
import {
  LocalTaskExecutionService,
  type LocalTaskVolatileChange
} from './local-task-execution-service'
import type { LocalTaskHostSessionSource } from './local-task-host-session-source'
import { runLocalTaskWrite } from './local-task-mutation-receipts'
import {
  batchUpdateLocalTasks,
  createLocalSubtasks,
  createLocalTask,
  moveLocalTask,
  removeLocalTask
} from './local-task-mutations'
import {
  createLocalTaskProject,
  removeLocalTaskProject,
  updateLocalTaskProject
} from './local-task-project-mutations'
import { readLocalTaskProjects } from './local-task-project-store'
import {
  removeLocalTaskStatus,
  reorderLocalTaskStatuses,
  upsertLocalTaskStatus
} from './local-task-status-store'
import { readLocalTasks } from './local-task-store'
import { updateLocalTask } from './local-task-update'
import { rowNumber, rowString } from './local-tasks-sqlite-row'

const READ_ONLY: LocalTaskFailure = { ok: false, code: 'read_only' }

const PROJECT_RESULT = writeResultSchema({ project: projectSchema })
const TASK_RESULT = writeResultSchema({ task: taskSchema })
const TASKS_RESULT = writeResultSchema({ tasks: z.array(taskSchema) })
const EMPTY_RESULT = writeResultSchema({})
const STATUS_RESULT = writeResultSchema({ statusId: z.string() })
const UPDATED_RESULT = writeResultSchema({ updated: z.number() })
const REMOVED_RESULT = writeResultSchema({ removed: z.number() })
const EVENT_RESULT = writeResultSchema({ eventId: z.string() })

/**
 * This Orca's task library (one per profile, D-008). Every write is one transaction keyed by the
 * client's operation id.
 */
export class LocalTasksService {
  /** Links, the host's "needs you" judgment and rules. */
  readonly execution: LocalTaskExecutionService

  constructor(
    private readonly db: LocalTasksDatabase,
    private readonly now: () => number = Date.now,
    onVolatileChange?: LocalTaskVolatileChange,
    sessions?: LocalTaskHostSessionSource
  ) {
    this.execution = new LocalTaskExecutionService(db, now, onVolatileChange, sessions)
  }

  get readOnly(): boolean {
    return this.db.readOnly
  }

  revision(): number {
    return this.db.revision()
  }

  inProgressCount(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS count FROM local_tasks t
      JOIN local_task_statuses s ON s.id = t.status_id WHERE s.category = 'started'`)
      .get()
    return row ? rowNumber(row, 'count') : 0
  }

  taskHostId(): string | null {
    return this.db.taskHostId()
  }

  listProjects(): { projects: LocalTaskProject[] } {
    return { projects: readLocalTaskProjects(this.db) }
  }

  listTasks(projectId?: string): { tasks: LocalTask[] } {
    return { tasks: readLocalTasks(this.db, projectId) }
  }

  listEvents(taskId: string): { events: LocalTaskEvent[] } {
    return { events: listLocalTaskEvents(this.db, taskId) }
  }

  getPreferences(keys: string[]): { values: Record<string, string | null> } {
    const read = this.db.prepare('SELECT value FROM local_task_preferences WHERE key = ?')
    const values: Record<string, string | null> = {}
    for (const key of keys) {
      const row = read.get(key)
      values[key] = row ? rowString(row, 'value') : null
    }
    return { values }
  }

  setPreference(key: string, value: string | null): { ok: true } | LocalTaskFailure {
    if (this.db.readOnly) {
      return READ_ONLY
    }
    if (this.getPreferences([key]).values[key] === value) {
      return { ok: true }
    }
    this.db.transaction(() => {
      if (value === null) {
        this.db.prepare('DELETE FROM local_task_preferences WHERE key = ?').run(key)
      } else {
        this.db
          .prepare('INSERT OR REPLACE INTO local_task_preferences (key, value) VALUES (?, ?)')
          .run(key, value)
      }
      this.db.touch('preferences')
    })
    return { ok: true }
  }

  createProject(input: LocalTasksProjectsCreateInput) {
    return this.write(input.clientOperationId, 'projects.create', input, PROJECT_RESULT, (now) =>
      createLocalTaskProject(this.db, input, now)
    )
  }

  updateProject(input: LocalTasksProjectsUpdateInput) {
    return this.write(input.clientOperationId, 'projects.update', input, PROJECT_RESULT, (now) =>
      updateLocalTaskProject(this.db, input, now)
    )
  }

  removeProject(input: { clientOperationId: string; projectId: string }) {
    return this.write(input.clientOperationId, 'projects.remove', input, EMPTY_RESULT, () =>
      removeLocalTaskProject(this.db, input.projectId)
    )
  }

  upsertStatus(input: LocalTasksStatusesUpsertInput) {
    return this.write(input.clientOperationId, 'statuses.upsert', input, STATUS_RESULT, () =>
      upsertLocalTaskStatus(this.db, input)
    )
  }

  reorderStatuses(input: LocalTasksStatusesReorderInput) {
    return this.write(input.clientOperationId, 'statuses.reorder', input, EMPTY_RESULT, () =>
      reorderLocalTaskStatuses(this.db, input)
    )
  }

  removeStatus(input: LocalTasksStatusesRemoveInput, source: LocalTaskEventSource) {
    return this.write(input.clientOperationId, 'statuses.remove', input, EMPTY_RESULT, (now) =>
      removeLocalTaskStatus(this.db, input, source, now)
    )
  }

  createTask(input: LocalTasksTasksCreateInput, source: LocalTaskEventSource) {
    return this.write(input.clientOperationId, 'tasks.create', input, TASK_RESULT, (now) =>
      createLocalTask(this.db, input, source, now)
    )
  }

  createSubtasks(input: LocalTasksTasksCreateSubtasksInput, source: LocalTaskEventSource) {
    return this.write(input.clientOperationId, 'tasks.createSubtasks', input, TASKS_RESULT, (now) =>
      createLocalSubtasks(this.db, input, source, now)
    )
  }

  updateTask(input: LocalTasksTasksUpdateInput, source: LocalTaskEventSource) {
    return this.write(input.clientOperationId, 'tasks.update', input, TASK_RESULT, (now) =>
      updateLocalTask(this.db, input, source, now)
    )
  }

  batchUpdateTasks(input: LocalTasksTasksBatchUpdateInput, source: LocalTaskEventSource) {
    return this.write(input.clientOperationId, 'tasks.batchUpdate', input, UPDATED_RESULT, (now) =>
      batchUpdateLocalTasks(this.db, input, source, now)
    )
  }

  moveTask(input: LocalTasksTasksMoveInput, source: LocalTaskEventSource) {
    return this.write(input.clientOperationId, 'tasks.move', input, TASK_RESULT, (now) =>
      moveLocalTask(this.db, input, source, now)
    )
  }

  removeTask(input: { clientOperationId: string; taskId: string }) {
    return this.write(input.clientOperationId, 'tasks.remove', input, REMOVED_RESULT, () =>
      removeLocalTask(this.db, input.taskId)
    )
  }

  addComment(input: LocalTasksEventsAddCommentInput, source: LocalTaskEventSource) {
    return this.write(input.clientOperationId, 'events.addComment', input, EVENT_RESULT, (now) =>
      addLocalTaskComment(this.db, input.taskId, input.body, source, now)
    )
  }

  editComment(input: LocalTasksEventsEditCommentInput) {
    return this.write(input.clientOperationId, 'events.editComment', input, EMPTY_RESULT, (now) =>
      editLocalTaskComment(this.db, input.eventId, input.body, now)
    )
  }

  removeComment(input: { clientOperationId: string; eventId: string }) {
    return this.write(input.clientOperationId, 'events.removeComment', input, EMPTY_RESULT, () =>
      removeLocalTaskComment(this.db, input.eventId)
    )
  }

  private write<T extends { ok: boolean }>(
    clientOperationId: string,
    method: string,
    params: unknown,
    resultSchema: ZodType<T>,
    operation: (now: number) => T
  ): T | LocalTaskFailure {
    return runLocalTaskWrite(
      this.db,
      this.now(),
      clientOperationId,
      method,
      params,
      resultSchema,
      operation
    )
  }
}
