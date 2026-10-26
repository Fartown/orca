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
import { withLocalTaskReceipt } from './local-task-mutation-receipts'
import {
  batchUpdateLocalTasks,
  createLocalSubtasks,
  createLocalTask,
  moveLocalTask,
  removeLocalTask
} from './local-task-mutations'
import {
  createLocalTaskProject,
  readLocalTaskProjects,
  removeLocalTaskProject,
  updateLocalTaskProject
} from './local-task-project-store'
import {
  removeLocalTaskStatus,
  reorderLocalTaskStatuses,
  upsertLocalTaskStatus
} from './local-task-status-store'
import { readLocalTasks, resolveLocalTaskRef, searchLocalTasks } from './local-task-store'
import { updateLocalTask } from './local-task-update'
import { rowString } from './local-tasks-sqlite-row'

const READ_ONLY: LocalTaskFailure = { ok: false, code: 'read_only' }

const PROJECT_RESULT = writeResultSchema({ project: projectSchema })
const TASK_RESULT = writeResultSchema({ task: taskSchema })
const TASKS_RESULT = writeResultSchema({ tasks: z.array(taskSchema) })
const EMPTY_RESULT = writeResultSchema({})
const STATUS_RESULT = writeResultSchema({ statusId: z.string() })
const UPDATED_RESULT = writeResultSchema({ updated: z.number() })
const REMOVED_RESULT = writeResultSchema({ removed: z.number() })
const EVENT_RESULT = writeResultSchema({ eventId: z.string() })

/** The desktop task library. Every write is one transaction keyed by the client's operation id. */
export class LocalTasksService {
  constructor(
    private readonly db: LocalTasksDatabase,
    private readonly now: () => number = Date.now
  ) {}

  get readOnly(): boolean {
    return this.db.readOnly
  }

  revision(): number {
    return this.db.revision()
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

  getTask(ref: string): { task: LocalTask | null } {
    return { task: resolveLocalTaskRef(this.db, ref) }
  }

  searchTasks(query: string, limit = 20): { tasks: LocalTask[] } {
    return { tasks: searchLocalTasks(this.db, query, limit) }
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
    return this.write(input.clientOperationId, PROJECT_RESULT, (now) =>
      createLocalTaskProject(this.db, input, now)
    )
  }

  updateProject(input: LocalTasksProjectsUpdateInput) {
    return this.write(input.clientOperationId, PROJECT_RESULT, (now) =>
      updateLocalTaskProject(this.db, input, now)
    )
  }

  removeProject(input: { clientOperationId: string; projectId: string }) {
    return this.write(input.clientOperationId, EMPTY_RESULT, () =>
      removeLocalTaskProject(this.db, input.projectId)
    )
  }

  upsertStatus(input: LocalTasksStatusesUpsertInput) {
    return this.write(input.clientOperationId, STATUS_RESULT, () =>
      upsertLocalTaskStatus(this.db, input)
    )
  }

  reorderStatuses(input: LocalTasksStatusesReorderInput) {
    return this.write(input.clientOperationId, EMPTY_RESULT, () =>
      reorderLocalTaskStatuses(this.db, input)
    )
  }

  removeStatus(input: LocalTasksStatusesRemoveInput, source: LocalTaskEventSource) {
    return this.write(input.clientOperationId, EMPTY_RESULT, (now) =>
      removeLocalTaskStatus(this.db, input, source, now)
    )
  }

  createTask(input: LocalTasksTasksCreateInput, source: LocalTaskEventSource) {
    return this.write(input.clientOperationId, TASK_RESULT, (now) =>
      createLocalTask(this.db, input, source, now)
    )
  }

  createSubtasks(input: LocalTasksTasksCreateSubtasksInput, source: LocalTaskEventSource) {
    return this.write(input.clientOperationId, TASKS_RESULT, (now) =>
      createLocalSubtasks(this.db, input, source, now)
    )
  }

  updateTask(input: LocalTasksTasksUpdateInput, source: LocalTaskEventSource) {
    return this.write(input.clientOperationId, TASK_RESULT, (now) =>
      updateLocalTask(this.db, input, source, now)
    )
  }

  batchUpdateTasks(input: LocalTasksTasksBatchUpdateInput, source: LocalTaskEventSource) {
    return this.write(input.clientOperationId, UPDATED_RESULT, (now) =>
      batchUpdateLocalTasks(this.db, input, source, now)
    )
  }

  moveTask(input: LocalTasksTasksMoveInput, source: LocalTaskEventSource) {
    return this.write(input.clientOperationId, TASK_RESULT, (now) =>
      moveLocalTask(this.db, input, source, now)
    )
  }

  removeTask(input: { clientOperationId: string; taskId: string }) {
    return this.write(input.clientOperationId, REMOVED_RESULT, () =>
      removeLocalTask(this.db, input.taskId)
    )
  }

  addComment(input: LocalTasksEventsAddCommentInput, source: LocalTaskEventSource) {
    return this.write(input.clientOperationId, EVENT_RESULT, (now) =>
      addLocalTaskComment(this.db, input.taskId, input.body, source, now)
    )
  }

  editComment(input: LocalTasksEventsEditCommentInput) {
    return this.write(input.clientOperationId, EMPTY_RESULT, (now) =>
      editLocalTaskComment(this.db, input.eventId, input.body, now)
    )
  }

  removeComment(input: { clientOperationId: string; eventId: string }) {
    return this.write(input.clientOperationId, EMPTY_RESULT, () =>
      removeLocalTaskComment(this.db, input.eventId)
    )
  }

  private write<T>(
    clientOperationId: string,
    resultSchema: ZodType<T>,
    operation: (now: number) => T
  ): T | LocalTaskFailure {
    if (this.db.readOnly) {
      return READ_ONLY
    }
    const now = this.now()
    return this.db.transaction(() =>
      withLocalTaskReceipt(this.db, clientOperationId, resultSchema, () => operation(now), now)
    )
  }
}
