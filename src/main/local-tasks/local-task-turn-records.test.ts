import { afterEach, expect, it, vi } from 'vitest'
import '../sqlite/sync-database'
import {
  disposeLocalTaskExecutionFixtures,
  LEAF,
  linkWorktree,
  recordTerminal,
  setup,
  SHOP
} from './local-task-execution.test-fixture'

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
