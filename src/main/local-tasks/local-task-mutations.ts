import { randomUUID } from 'node:crypto'
import { formatLocalTaskRef } from '../../shared/local-tasks/local-task-model'
import type {
  LocalTask,
  LocalTaskEventSource,
  LocalTaskProject,
  LocalTaskResult
} from '../../shared/local-tasks/local-task-types'
import type {
  LocalTasksTasksBatchUpdateInput,
  LocalTasksTasksCreateInput,
  LocalTasksTasksCreateSubtasksInput,
  LocalTasksTasksMoveInput
} from '../../shared/local-tasks/local-tasks-rpc-params'
import type { LocalTasksDatabase } from './local-tasks-database'
import { appendLocalTaskEvent } from './local-task-event-store'
import { readLocalTaskProject } from './local-task-project-store'
import {
  readLocalTask,
  readLocalTaskLabels,
  readLocalTaskSubtreeIds,
  writeLocalTaskLabels
} from './local-task-store'
import {
  defaultStatusId,
  hasWorkspaceOrSessions,
  isValidParent,
  recordLabelChange,
  setTaskColumn,
  statusPayload
} from './local-task-mutation-rules'
import { rowNumber } from './local-tasks-sqlite-row'

export function createLocalTask(
  db: LocalTasksDatabase,
  input: LocalTasksTasksCreateInput,
  source: LocalTaskEventSource,
  now: number
): LocalTaskResult<{ task: LocalTask }> {
  const project = readLocalTaskProject(db, input.projectId)
  if (!project) {
    return { ok: false, code: 'not_found' }
  }
  const statusId = input.statusId ?? defaultStatusId(project)
  if (!project.statuses.some((status) => status.id === statusId)) {
    return { ok: false, code: 'status_invalid' }
  }
  if (input.parentId && !isValidParent(db, input.parentId, project.id, null)) {
    return { ok: false, code: 'parent_invalid' }
  }
  const taskId = insertTask(db, {
    project,
    title: input.title,
    description: input.description ?? '',
    criteria: input.criteria ?? [],
    statusId,
    priority: input.priority ?? 0,
    parentId: input.parentId ?? null,
    now
  })
  writeLocalTaskLabels(db, taskId, input.labels ?? [])
  appendLocalTaskEvent(db, { taskId, kind: 'created', source, now })
  db.touch('tasks')
  return requireTask(db, taskId)
}

export function createLocalSubtasks(
  db: LocalTasksDatabase,
  input: LocalTasksTasksCreateSubtasksInput,
  source: LocalTaskEventSource,
  now: number
): LocalTaskResult<{ tasks: LocalTask[] }> {
  const parent = readLocalTask(db, input.parentId)
  const project = parent ? readLocalTaskProject(db, parent.projectId) : null
  if (!parent || !project) {
    return { ok: false, code: 'not_found' }
  }
  const tasks: LocalTask[] = []
  for (const title of input.titles) {
    const taskId = insertTask(db, {
      project,
      title,
      description: '',
      criteria: [],
      statusId: defaultStatusId(project),
      priority: 0,
      parentId: parent.id,
      now
    })
    appendLocalTaskEvent(db, { taskId, kind: 'created', source, now })
    const task = readLocalTask(db, taskId)
    if (task) {
      tasks.push(task)
    }
  }
  db.touch('tasks')
  return { ok: true, tasks }
}

export function batchUpdateLocalTasks(
  db: LocalTasksDatabase,
  input: LocalTasksTasksBatchUpdateInput,
  source: LocalTaskEventSource,
  now: number
): LocalTaskResult<{ updated: number }> {
  const tasks = [...new Set(input.taskIds)].map((taskId) => readLocalTask(db, taskId))
  if (tasks.some((task) => task === null)) {
    return { ok: false, code: 'not_found' }
  }
  const present = tasks.filter((task): task is LocalTask => task !== null)
  const projects = new Map<string, LocalTaskProject | null>()
  for (const task of present) {
    if (!projects.has(task.projectId)) {
      projects.set(task.projectId, readLocalTaskProject(db, task.projectId))
    }
  }
  const { statusId, priority, addLabels, removeLabels } = input.patch
  if (
    statusId &&
    present.some((task) => !projects.get(task.projectId)?.statuses.some((s) => s.id === statusId))
  ) {
    return { ok: false, code: 'status_invalid' }
  }
  if (addLabels || removeLabels) {
    const removed = new Set(removeLabels ?? [])
    for (const task of present) {
      const merged = new Set([...task.labels, ...(addLabels ?? [])])
      if ([...merged].filter((label) => !removed.has(label)).length > 20) {
        return { ok: false, code: 'invalid_argument' }
      }
    }
  }
  for (const task of present) {
    let changed = false
    if (statusId && statusId !== task.statusId) {
      changed = true
      setTaskColumn(db, task.id, 'status_id', statusId, now)
      appendLocalTaskEvent(db, {
        taskId: task.id,
        kind: 'status',
        source,
        payload: statusPayload(projects.get(task.projectId) ?? null, task.statusId, statusId),
        now
      })
    }
    if (priority !== undefined && priority !== task.priority) {
      changed = true
      setTaskColumn(db, task.id, 'priority', priority, now)
      appendLocalTaskEvent(db, {
        taskId: task.id,
        kind: 'priority',
        source,
        payload: { from: task.priority, to: priority },
        now
      })
    }
    if (addLabels || removeLabels) {
      const before = readLocalTaskLabels(db, task.id)
      const removed = new Set(removeLabels ?? [])
      const after = [...new Set([...before, ...(addLabels ?? [])])].filter(
        (label) => !removed.has(label)
      )
      changed ||= after.length !== before.length || after.some((label) => !before.includes(label))
      recordLabelChange(db, task.id, before, after, source, now)
    }
    if (changed) {
      db.touch('tasks')
    }
  }
  return { ok: true, updated: present.length }
}

/**
 * Moves a task with its whole subtree; each gets the next number in the target project and keeps
 * its old ref as an alias. The moved task becomes top-level there. Links stay, as they name work.
 */
export function moveLocalTask(
  db: LocalTasksDatabase,
  input: LocalTasksTasksMoveInput,
  source: LocalTaskEventSource,
  now: number
): LocalTaskResult<{ task: LocalTask }> {
  const task = readLocalTask(db, input.taskId)
  const from = task ? readLocalTaskProject(db, task.projectId) : null
  const to = readLocalTaskProject(db, input.targetProjectId)
  if (!task || !from || !to) {
    return { ok: false, code: 'not_found' }
  }
  if (from.id === to.id) {
    return { ok: false, code: 'parent_invalid' }
  }
  const subtree = readLocalTaskSubtreeIds(db, task.id).flatMap((id) => {
    const member = readLocalTask(db, id)
    return member ? [member] : []
  })
  const oldPrefixes = [from.prefix, ...from.aliases]
  const alias = db.prepare(
    'INSERT OR REPLACE INTO local_task_aliases (alias, task_id) VALUES (?, ?)'
  )
  for (const member of subtree) {
    const category = from.statuses.find((status) => status.id === member.statusId)?.category
    const target = to.statuses.find((status) => status.category === category) ?? to.statuses[0]
    const taskNumber = allocateNumber(db, to.id)
    db.prepare(
      `UPDATE local_tasks SET project_id = ?, number = ?, status_id = ?, updated_at = ?,
         revision = revision + 1 WHERE id = ?`
    ).run(to.id, taskNumber, target.id, now, member.id)
    for (const prefix of oldPrefixes) {
      alias.run(formatLocalTaskRef(prefix, member.number), member.id)
    }
    appendLocalTaskEvent(db, {
      taskId: member.id,
      kind: 'moved',
      source,
      payload: { from: member.ref, to: formatLocalTaskRef(to.prefix, taskNumber) },
      now
    })
  }
  if (task.parentId !== null) {
    // Why: a parent stays in its own project; the moved task heads its subtree in the new one.
    db.prepare('UPDATE local_tasks SET parent_id = NULL WHERE id = ?').run(task.id)
    appendLocalTaskEvent(db, {
      taskId: task.id,
      kind: 'parent',
      source,
      payload: { from: task.parentId, to: null },
      now
    })
  }
  db.touch('tasks')
  return requireTask(db, task.id)
}

export function removeLocalTask(
  db: LocalTasksDatabase,
  taskId: string
): LocalTaskResult<{ removed: number }> {
  const task = readLocalTask(db, taskId)
  if (!task) {
    return { ok: false, code: 'not_found' }
  }
  const subtree = readLocalTaskSubtreeIds(db, taskId)
  // Why: foreign keys cascade the subtree's links, sessions and attention marks; the caches that
  // read those scopes must be told, or a deleted task's workspace chip lingers (D2).
  const hadLinks = hasWorkspaceOrSessions(db, subtree)
  // Why: only task-library rows go; linked workspaces and sessions on any host are left untouched.
  db.prepare('DELETE FROM local_tasks WHERE id = ?').run(taskId)
  db.touch('tasks')
  if (hadLinks) {
    db.touch('links')
    db.touch('attention')
  }
  return { ok: true, removed: subtree.length }
}

type InsertTaskInput = {
  project: LocalTaskProject
  title: string
  description: string
  criteria: string[]
  statusId: string
  priority: number
  parentId: string | null
  now: number
}

function insertTask(db: LocalTasksDatabase, input: InsertTaskInput): string {
  const taskId = randomUUID()
  db.prepare(
    `INSERT INTO local_tasks (id, project_id, number, title, description, criteria, status_id,
       priority, parent_id, created_at, updated_at, revision)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
  ).run(
    taskId,
    input.project.id,
    allocateNumber(db, input.project.id),
    input.title,
    input.description,
    JSON.stringify(input.criteria),
    input.statusId,
    input.priority,
    input.parentId,
    input.now,
    input.now
  )
  return taskId
}

/** Same transaction as the insert, so numbers never repeat and never skip on a failed write. */
function allocateNumber(db: LocalTasksDatabase, projectId: string): number {
  const row = db
    .prepare(
      'UPDATE local_task_projects SET next_number = next_number + 1 WHERE id = ? RETURNING next_number'
    )
    .get(projectId)
  if (!row) {
    throw new Error('local tasks: project vanished while numbering')
  }
  return rowNumber(row, 'next_number') - 1
}

function requireTask(db: LocalTasksDatabase, taskId: string): LocalTaskResult<{ task: LocalTask }> {
  const task = readLocalTask(db, taskId)
  return task ? { ok: true, task } : { ok: false, code: 'not_found' }
}
