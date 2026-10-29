import type { LocalTaskStatusCategory } from '../../shared/local-tasks/local-task-model'
import type { LocalTaskResult } from '../../shared/local-tasks/local-task-types'
import type { LocalTasksRulesApplyPrMergedInput } from '../../shared/local-tasks/local-tasks-link-rpc-params'
import type { LocalTasksDatabase } from './local-tasks-database'
import { appendLocalTaskEvent } from './local-task-event-store'
import { setTaskColumn, statusPayload } from './local-task-mutation-rules'
import { readLocalTaskProject } from './local-task-project-store'
import { readLocalTask } from './local-task-store'

const NOT_STARTED: readonly LocalTaskStatusCategory[] = ['backlog', 'unstarted']
const FINISHED: readonly LocalTaskStatusCategory[] = ['completed', 'canceled']

/**
 * Rule 1: work beginning on a task (any level) moves that task from backlog or unstarted to the
 * first started status. Runs inside the link or session write, so both commit together.
 */
export function applyLocalTaskStartRule(db: LocalTasksDatabase, taskId: string, now: number): void {
  const task = readLocalTask(db, taskId)
  const project = task ? readLocalTaskProject(db, task.projectId) : null
  if (!task || !project || !project.rules.startMovesToInProgress) {
    return
  }
  const current = project.statuses.find((status) => status.id === task.statusId)
  const target = project.statuses.find((status) => status.category === 'started')
  if (!current || !target || !NOT_STARTED.includes(current.category)) {
    return
  }
  setTaskColumn(db, task.id, 'status_id', target.id, now)
  appendLocalTaskEvent(db, {
    taskId: task.id,
    kind: 'status',
    source: 'rule',
    payload: { ...statusPayload(project, task.statusId, target.id), rule: 'start' },
    now
  })
  db.touch('tasks')
}

/**
 * Rule 2: a merged PR completes the task that holds the PR's workspace, once; its ancestors stay.
 * The merge is recorded even when the task is already finished, so a task the user reopens is not
 * completed again by the same PR.
 */
export function applyLocalTaskPrMergedRule(
  db: LocalTasksDatabase,
  input: LocalTasksRulesApplyPrMergedInput,
  now: number
): LocalTaskResult<{ applied: boolean }> {
  const task = readLocalTask(db, input.taskId)
  const project = task ? readLocalTaskProject(db, task.projectId) : null
  if (!task || !project) {
    return { ok: false, code: 'not_found' }
  }
  const ownsWorkspace =
    db.prepare('SELECT 1 FROM local_task_workspaces WHERE task_id = ?').get(task.id) !== undefined
  if (!ownsWorkspace || !project.rules.prMergedCompletes) {
    return { ok: true, applied: false }
  }
  const recorded = db
    .prepare(
      'SELECT 1 FROM local_task_pr_triggers WHERE task_id = ? AND provider = ? AND pr_number = ?'
    )
    .get(task.id, input.provider, input.prNumber)
  if (recorded) {
    return { ok: true, applied: false }
  }
  db.prepare(
    `INSERT INTO local_task_pr_triggers (task_id, provider, pr_number, head_sha, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(task.id, input.provider, input.prNumber, input.headSha, now)
  const current = project.statuses.find((status) => status.id === task.statusId)
  const target = project.statuses.find((status) => status.category === 'completed')
  if (!target || (current && FINISHED.includes(current.category))) {
    return { ok: true, applied: false }
  }
  setTaskColumn(db, task.id, 'status_id', target.id, now)
  appendLocalTaskEvent(db, {
    taskId: task.id,
    kind: 'status',
    source: 'rule',
    payload: {
      ...statusPayload(project, task.statusId, target.id),
      rule: 'pr-merged',
      provider: input.provider,
      prNumber: input.prNumber
    },
    now
  })
  db.touch('tasks')
  return { ok: true, applied: true }
}
