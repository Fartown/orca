import { afterEach, describe, expect, it } from 'vitest'
import '../sqlite/sync-database'
import {
  disposeLocalTaskExecutionFixtures,
  LEAF,
  linkWorktree,
  op,
  recordTerminal,
  setup,
  SHOP
} from './local-task-execution.test-fixture'

afterEach(() => disposeLocalTaskExecutionFixtures())

describe('task-first library behavior', () => {
  it('moves merged PR tasks to review when rule 2 uses review mode', () => {
    const { service, work, project, status, task, statusOf } = setup()
    const target = task('Needs acceptance')
    linkWorktree(work, target.id, SHOP)
    expect(
      service.updateProject({
        clientOperationId: op(),
        projectId: project.id,
        rules: { prMergedMode: 'review' }
      })
    ).toMatchObject({
      ok: true,
      project: { rules: { prMergedMode: 'review', prMergedCompletes: false } }
    })
    expect(
      work.applyPrMerged({
        clientOperationId: op(),
        taskId: target.id,
        provider: 'github',
        prNumber: 82,
        headSha: 'abc'
      })
    ).toEqual({ ok: true, applied: true })
    expect(statusOf(target.id)).toBe(status('review'))
    expect(service.listProjects().projects[0].rules).toMatchObject({
      prMergedMode: 'review',
      prMergedCompletes: false
    })
  })

  it('records a merged PR without rewriting a task already in review', () => {
    const { service, work, status, task } = setup()
    const target = task('Already awaiting acceptance')
    linkWorktree(work, target.id, SHOP)
    expect(
      service.updateTask(
        { clientOperationId: op(), taskId: target.id, patch: { statusId: status('review') } },
        'desktop'
      )
    ).toMatchObject({ ok: true })
    const before = service.listTasks().tasks.find((entry) => entry.id === target.id)
    const eventCount = service.listEvents(target.id).events.length
    expect(
      work.applyPrMerged({
        clientOperationId: op(),
        taskId: target.id,
        provider: 'github',
        prNumber: 83,
        headSha: 'abc'
      })
    ).toEqual({ ok: true, applied: false })
    expect(service.listTasks().tasks.find((entry) => entry.id === target.id)?.revision).toBe(
      before?.revision
    )
    expect(service.listEvents(target.id).events).toHaveLength(eventCount)
  })

  it('does not write turn records from the progress read path', () => {
    const { db, work, task, host } = setup()
    const target = task('Read only judgment')
    linkWorktree(work, target.id, SHOP)
    const paneKey = `tab-read:${LEAF}`
    recordTerminal(work, target.id, { paneKey })
    host.report(paneKey, { state: 'done', lastAssistantMessage: 'Finished one round' })
    const before = db.revision()
    expect(work.getProgress().sessions[0].lastMessage).toBe('Finished one round')
    expect(db.revision()).toBe(before)
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM local_task_events WHERE kind = 'turn-ended'").get()
    ).toEqual({ count: 0 })
  })
})
