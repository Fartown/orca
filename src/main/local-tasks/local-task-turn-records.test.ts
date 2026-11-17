import { afterEach, expect, it, vi } from 'vitest'
import '../sqlite/sync-database'
import {
  disposeLocalTaskExecutionFixtures,
  LEAF,
  linkWorktree,
  NOW,
  op,
  recordTerminal,
  setup,
  SHOP
} from './local-task-execution.test-fixture'
import { readLatestProgressByTask } from './local-task-latest-progress'

afterEach(() => {
  disposeLocalTaskExecutionFixtures()
  vi.useRealTimers()
})

it('fills in a delayed final sentence without creating a new turn', () => {
  vi.useFakeTimers()
  const { service, work, host, task } = setup()
  const target = task('Delayed answer')
  linkWorktree(work, target.id, SHOP)
  const paneKey = `tab-1:${LEAF}`
  const session = recordTerminal(work, target.id, { paneKey })
  work.start()
  host.report(paneKey, { state: 'done' })
  vi.advanceTimersByTime(200)
  const eventBefore = service
    .listEvents(target.id)
    .events.find((event) => event.kind === 'turn-ended')
  expect(eventBefore).toMatchObject({ body: '' })
  host.report(paneKey, { state: 'done', lastAssistantMessage: 'Final result' })
  vi.advanceTimersByTime(200)
  const turnEvents = service
    .listEvents(target.id)
    .events.filter((event) => event.kind === 'turn-ended')
  expect(turnEvents).toHaveLength(1)
  expect(turnEvents[0]).toMatchObject({ id: eventBefore?.id, body: 'Final result' })
  expect(turnEvents[0].createdAt).toBe(eventBefore?.createdAt)
  expect(
    work.getProgress().sessions.find((progress) => progress.taskSessionId === session.id)
  ).toMatchObject({ lastMessage: 'Final result' })
  expect(
    service.listTasks().tasks.find((row) => row.id === target.id)?.latestProgress
  ).toMatchObject({
    body: 'Final result',
    at: eventBefore?.createdAt
  })
})

it('keeps a writeback past its round’s turn end, and shows a later round that wrote none', () => {
  vi.useFakeTimers()
  let now = NOW
  const { db, service, work, host, task } = setup({ clock: () => now })
  const target = task('Rounds')
  task('Another task, so the list read runs too')
  linkWorktree(work, target.id, SHOP)
  const paneKey = `tab-1:${LEAF}`
  const session = recordTerminal(work, target.id, { paneKey })
  work.start()
  const at = (offset: number, report?: Parameters<typeof host.report>[1]) => {
    now = NOW + offset
    if (report) {
      host.report(paneKey, { stateStartedAt: now, receivedAt: now, ...report })
      vi.advanceTimersByTime(200)
    }
  }
  const writeBack = (offset: number, body: string) => {
    at(offset)
    service.addComment(
      {
        clientOperationId: op(),
        taskId: target.id,
        body,
        progress: { sessionLinkId: session.id }
      },
      'cli'
    )
  }
  const latest = () => {
    const listed = readLatestProgressByTask(db).get(target.id)
    expect(readLatestProgressByTask(db, target.id).get(target.id)).toEqual(listed)
    return listed
  }

  at(100, { state: 'working' })
  writeBack(200, 'Round 1 result')
  at(300, { state: 'done', lastAssistantMessage: 'Round 1 last words' })
  expect(latest()).toMatchObject({ kind: 'progress', body: 'Round 1 result' })

  at(400, { state: 'working' })
  at(500, { state: 'done', lastAssistantMessage: 'Round 2 last words' })
  expect(latest()).toMatchObject({
    kind: 'turn-ended',
    body: 'Round 2 last words',
    at: NOW + 500,
    sessionLinkId: session.id
  })

  at(600, { state: 'working' })
  writeBack(700, 'Round 3 result')
  at(800, { state: 'done', lastAssistantMessage: 'Round 3 last words' })
  expect(latest()).toMatchObject({ kind: 'progress', body: 'Round 3 result' })
})
