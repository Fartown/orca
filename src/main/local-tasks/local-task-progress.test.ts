import { describe, expect, it } from 'vitest'
// Why a value import: the Bun runner only moves SQLite tests to Node when they import this directly.
import SyncDatabase from '../sqlite/sync-database'
import { LocalTasksDatabase } from './local-tasks-database'
import { LocalTasksService } from './local-tasks-service'
import { localTaskSchema } from '../../shared/local-tasks/local-task-read-schemas'

void SyncDatabase

let opId = 0
const op = (): string => `op-${++opId}`

function setup() {
  const db = LocalTasksDatabase.openTransient()
  let clock = 1_000
  const service = new LocalTasksService(db, () => ++clock)
  const created = service.createProject({
    clientOperationId: op(),
    name: 'Shop',
    prefix: 'shop',
    repos: []
  })
  if (!created.ok) {
    throw new Error(created.code)
  }
  const task = service.createTask(
    { clientOperationId: op(), projectId: created.project.id, title: 'Fix reconnect' },
    'desktop'
  )
  if (!task.ok) {
    throw new Error(task.code)
  }
  return { db, service, task: task.task }
}

describe('agent writebacks (REQ-022)', () => {
  it('records a writeback as a marked comment and surfaces the newest as latestProgress', () => {
    const { service, task } = setup()
    expect(service.listTasks().tasks[0].latestProgress).toBeUndefined()

    service.addComment({ clientOperationId: op(), taskId: task.id, body: 'plain note' }, 'desktop')
    const first = service.addComment(
      {
        clientOperationId: op(),
        taskId: task.id,
        body: 'Found the retry loop',
        progress: { sessionLinkId: 'link-1' }
      },
      'cli'
    )
    expect(first.ok).toBe(true)
    service.addComment(
      {
        clientOperationId: op(),
        taskId: task.id,
        body: 'Repro test written',
        progress: { needsYou: 'Pick the timeout' }
      },
      'cli'
    )

    const [listed] = service.listTasks().tasks
    expect(listed.latestProgress).toMatchObject({
      kind: 'progress',
      body: 'Repro test written',
      sessionLinkId: null,
      needsYou: 'Pick the timeout'
    })
    const comments = service.listEvents(task.id).events.filter((e) => e.kind === 'comment')
    expect(comments.map((e) => e.payload?.progress ?? false)).toEqual([false, true, true])
    expect(comments[1].payload).toMatchObject({ progress: true, sessionLinkId: 'link-1' })
  })

  it('refuses to edit or remove a writeback, but still edits a plain comment', () => {
    const { service, task } = setup()
    const writeback = service.addComment(
      { clientOperationId: op(), taskId: task.id, body: 'Done round', progress: {} },
      'cli'
    )
    const plain = service.addComment(
      { clientOperationId: op(), taskId: task.id, body: 'mine' },
      'desktop'
    )
    if (!writeback.ok || !plain.ok) {
      throw new Error('setup')
    }
    const edit = { clientOperationId: op(), eventId: writeback.eventId, body: 'changed' }
    expect(service.editComment(edit)).toEqual({ ok: false, code: 'comment_not_editable' })
    expect(service.removeComment({ clientOperationId: op(), eventId: writeback.eventId })).toEqual({
      ok: false,
      code: 'comment_not_editable'
    })
    expect(
      service.editComment({ clientOperationId: op(), eventId: plain.eventId, body: 'edited' })
    ).toEqual({ ok: true })
  })

  it('keeps completing a UI click: CLI writes cannot reach the completed category', () => {
    const { service, task } = setup()
    const project = service.listProjects().projects[0]
    const done = project.statuses.find((status) => status.category === 'completed')
    const review = project.statuses.find((status) => status.category === 'review')
    if (!done || !review) {
      throw new Error('setup')
    }
    const patch = (statusId: string) => ({
      clientOperationId: op(),
      taskId: task.id,
      patch: { statusId }
    })
    expect(service.updateTask(patch(done.id), 'cli')).toMatchObject({
      ok: false,
      code: 'status_invalid'
    })
    expect(
      service.batchUpdateTasks(
        { clientOperationId: op(), taskIds: [task.id], patch: { statusId: done.id } },
        'cli'
      )
    ).toMatchObject({ ok: false, code: 'status_invalid' })
    expect(
      service.createTask(
        { clientOperationId: op(), projectId: project.id, title: 'Born done', statusId: done.id },
        'cli'
      )
    ).toMatchObject({ ok: false, code: 'status_invalid' })
    // Removing the status a task is in cannot move it into a completed one either.
    const second = service.upsertStatus({
      clientOperationId: op(),
      projectId: project.id,
      category: 'review',
      name: 'Second look',
      color: 'blue'
    })
    if (!second.ok) {
      throw new Error('setup')
    }
    expect(service.updateTask(patch(review.id), 'cli').ok).toBe(true)
    expect(
      service.removeStatus(
        { clientOperationId: op(), statusId: review.id, moveTasksToStatusId: done.id },
        'cli'
      )
    ).toMatchObject({ ok: false, code: 'status_invalid' })
    expect(service.updateTask(patch(done.id), 'desktop').ok).toBe(true)
  })

  it('lets clients read a task without latestProgress and drop a malformed one', () => {
    const base = {
      id: 't',
      projectId: 'p',
      number: 1,
      ref: 'SHOP-1',
      title: 'x',
      statusId: 's',
      parentId: null,
      createdAt: 1,
      updatedAt: 1,
      revision: 1
    }
    expect(localTaskSchema.parse(base).latestProgress).toBeUndefined()
    expect(
      localTaskSchema.parse({ ...base, latestProgress: { kind: 'other' } }).latestProgress
    ).toBeUndefined()
  })
})
