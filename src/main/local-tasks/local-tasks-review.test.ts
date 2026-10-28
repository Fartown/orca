import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import SyncDatabase from '../sqlite/sync-database'
import { getLocalTasksDatabasePath, LocalTasksDatabase } from './local-tasks-database'
import { LocalTasksService } from './local-tasks-service'

function fixture() {
  const db = LocalTasksDatabase.openTransient()
  let now = 1_000
  const service = new LocalTasksService(db, () => now)
  const projectResult = service.createProject({
    clientOperationId: 'project',
    name: 'Project',
    prefix: 'PROJ',
    repos: ['orca-project']
  })
  if (!projectResult.ok) {
    throw new Error(projectResult.code)
  }
  const project = projectResult.project
  const taskResult = service.createTask(
    { clientOperationId: 'task', projectId: project.id, title: 'Task' },
    'desktop'
  )
  if (!taskResult.ok) {
    throw new Error(taskResult.code)
  }
  return {
    db,
    service,
    project,
    task: taskResult.task,
    advance: (delta: number) => {
      now += delta
    }
  }
}

describe('local tasks review regressions', () => {
  it('rejects an operation id reused with another method or parameters', () => {
    const { db, service, project } = fixture()
    expect(
      service.createTask(
        { clientOperationId: 'task', projectId: project.id, title: 'Changed' },
        'desktop'
      )
    ).toEqual({ ok: false, code: 'invalid_argument' })
    expect(service.removeTask({ clientOperationId: 'task', taskId: 'unknown' })).toEqual({
      ok: false,
      code: 'invalid_argument'
    })
    expect(service.listTasks(project.id).tasks).toHaveLength(1)
    db.close()
  })

  it('does not re-execute a write when its stored result is corrupt', () => {
    const { db, service, project } = fixture()
    db.prepare(
      "UPDATE local_task_mutation_receipts SET result = '{' WHERE client_operation_id = 'task'"
    ).run()
    expect(
      service.createTask(
        { clientOperationId: 'task', projectId: project.id, title: 'Task' },
        'desktop'
      )
    ).toEqual({ ok: false, code: 'invalid_argument' })
    expect(service.listTasks(project.id).tasks).toHaveLength(1)
    db.close()
  })

  it('expires receipts after 24 hours on a write and enables incremental vacuum', () => {
    const { db, service, project, advance } = fixture()
    expect(db.prepare('PRAGMA auto_vacuum').get()).toMatchObject({ auto_vacuum: 2 })
    advance(24 * 60 * 60 * 1000 + 1)
    const created = service.createTask(
      { clientOperationId: 'later', projectId: project.id, title: 'Later' },
      'desktop'
    )
    expect(created.ok).toBe(true)
    expect(
      db
        .prepare("SELECT 1 FROM local_task_mutation_receipts WHERE client_operation_id = 'task'")
        .get()
    ).toBeUndefined()
    db.close()
  })

  it('deduplicates batch ids and refuses label merges over the cap atomically', () => {
    const { db, service, task } = fixture()
    const updated = service.batchUpdateTasks(
      { clientOperationId: 'batch', taskIds: [task.id, task.id], patch: { priority: 2 } },
      'desktop'
    )
    expect(updated).toEqual({ ok: true, updated: 1 })
    expect(service.getTask(task.id).task?.revision).toBe(task.revision + 1)
    const labels = Array.from({ length: 20 }, (_, index) => `L${index}`)
    const labeled = service.updateTask(
      { clientOperationId: 'labels', taskId: task.id, patch: { labels } },
      'desktop'
    )
    expect(labeled.ok).toBe(true)
    const revision = service.revision()
    expect(
      service.batchUpdateTasks(
        {
          clientOperationId: 'overflow',
          taskIds: [task.id],
          patch: { addLabels: ['extra'], priority: 3 }
        },
        'desktop'
      )
    ).toEqual({ ok: false, code: 'invalid_argument' })
    expect(service.revision()).toBe(revision)
    expect(service.getTask(task.id).task?.priority).toBe(2)
    db.close()
  })

  it('rejects duplicate status reorder ids and keeps no-op updates silent', () => {
    const { db, service, project, task } = fixture()
    const ids = project.statuses.map((status) => status.id)
    expect(
      service.reorderStatuses({
        clientOperationId: 'duplicate-reorder',
        projectId: project.id,
        orderedStatusIds: [ids[0], ids[0], ...ids.slice(2)]
      })
    ).toEqual({ ok: false, code: 'status_invalid' })
    const commits: unknown[] = []
    const stop = db.onCommit((commit) => commits.push(commit))
    const revision = service.revision()
    expect(
      service.updateProject({
        clientOperationId: 'noop-project',
        projectId: project.id,
        rules: { startMovesToInProgress: project.rules.startMovesToInProgress }
      }).ok
    ).toBe(true)
    expect(
      service.updateTask(
        { clientOperationId: 'noop-task', taskId: task.id, patch: { title: task.title } },
        'desktop'
      ).ok
    ).toBe(true)
    expect(
      service.batchUpdateTasks(
        { clientOperationId: 'noop-batch', taskIds: [task.id], patch: { priority: task.priority } },
        'desktop'
      )
    ).toEqual({ ok: true, updated: 1 })
    expect(service.revision()).toBe(revision)
    expect(commits).toEqual([])
    stop()
    db.close()
  })

  it('counts started tasks for the optional host status summary', () => {
    const { db, service, project, task } = fixture()
    expect(service.inProgressCount()).toBe(0)
    const started = project.statuses.find((status) => status.category === 'started')
    if (!started) {
      throw new Error('missing started status')
    }
    expect(
      service.updateTask(
        { clientOperationId: 'start', taskId: task.id, patch: { statusId: started.id } },
        'desktop'
      ).ok
    ).toBe(true)
    expect(service.inProgressCount()).toBe(1)
    db.close()
  })

  it('does not publish unchanged status, preference or comment edits', () => {
    const { db, service, project, task } = fixture()
    const status = project.statuses[0]
    const revision = service.revision()
    expect(
      service.upsertStatus({
        clientOperationId: 'same-status',
        projectId: project.id,
        statusId: status.id,
        name: status.name,
        color: status.color
      }).ok
    ).toBe(true)
    expect(service.setPreference('task.view', null)).toEqual({ ok: true })
    expect(service.revision()).toBe(revision)
    const comment = service.addComment(
      { clientOperationId: 'comment', taskId: task.id, body: 'hello' },
      'desktop'
    )
    if (!comment.ok) {
      throw new Error(comment.code)
    }
    const afterComment = service.revision()
    expect(
      service.editComment({
        clientOperationId: 'same-comment',
        eventId: comment.eventId,
        body: 'hello'
      })
    ).toEqual({ ok: true })
    expect(service.revision()).toBe(afterComment)
    db.close()
  })

  it('omits future event kinds, sources and status categories from old clients', () => {
    const { db, service, project, task } = fixture()
    const event = service.addComment(
      { clientOperationId: 'future-event', taskId: task.id, body: 'hello' },
      'desktop'
    )
    if (!event.ok) {
      throw new Error(event.code)
    }
    db.prepare('UPDATE local_task_events SET kind = ? WHERE id = ?').run(
      'future-kind',
      event.eventId
    )
    expect(service.listEvents(task.id).events.some((item) => item.id === event.eventId)).toBe(false)
    db.prepare('UPDATE local_task_events SET kind = ?, source = ? WHERE id = ?').run(
      'comment',
      'future-source',
      event.eventId
    )
    expect(service.listEvents(task.id).events.some((item) => item.id === event.eventId)).toBe(false)
    db.prepare('UPDATE local_task_statuses SET category = ? WHERE id = ?').run(
      'future-category',
      project.statuses[0].id
    )
    expect(
      service
        .listProjects()
        .projects[0].statuses.some((status) => status.id === project.statuses[0].id)
    ).toBe(false)
    db.close()
  })

  it('migrates version-one receipts without replaying an unbound operation id', () => {
    const directory = mkdtempSync(join(tmpdir(), 'local-tasks-review-'))
    try {
      const db = LocalTasksDatabase.open('review', directory)
      const service = new LocalTasksService(db)
      const created = service.createProject({
        clientOperationId: 'legacy-id',
        name: 'Legacy',
        prefix: 'LEG',
        repos: ['legacy']
      })
      expect(created.ok).toBe(true)
      db.close()
      const raw = new SyncDatabase(getLocalTasksDatabasePath('review', directory))
      raw.exec('ALTER TABLE local_task_mutation_receipts DROP COLUMN method')
      raw.exec('ALTER TABLE local_task_mutation_receipts DROP COLUMN params_hash')
      raw.pragma('user_version = 1')
      raw.pragma('auto_vacuum = NONE')
      raw.exec('VACUUM')
      raw.close()
      const reopened = LocalTasksDatabase.open('review', directory)
      const upgraded = new LocalTasksService(reopened)
      expect(
        upgraded.createProject({
          clientOperationId: 'legacy-id',
          name: 'Legacy',
          prefix: 'LEG',
          repos: ['legacy']
        })
        // The v4 upgrade drops receipts of the old result shapes, so the retry runs and meets its own prefix.
      ).toEqual({ ok: false, code: 'prefix_taken', detail: 'Legacy' })
      expect(upgraded.listProjects().projects).toHaveLength(1)
      expect(reopened.prepare('PRAGMA auto_vacuum').get()).toMatchObject({ auto_vacuum: 2 })
      reopened.close()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
