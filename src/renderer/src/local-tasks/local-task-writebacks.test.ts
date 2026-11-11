import { expect, it } from 'vitest'
import type { LocalTaskEvent } from '../../../shared/local-tasks/local-task-types'
import { parseLocalTaskProgressSections } from './local-task-progress-sections'
import {
  findLocalTaskWriteback,
  localTaskWritebackSection,
  localTaskWritebacks
} from './local-task-writebacks'

function comment(
  id: string,
  createdAt: number,
  payload: LocalTaskEvent['payload']
): LocalTaskEvent {
  return {
    id,
    taskId: 't',
    kind: 'comment',
    source: 'cli',
    body: id,
    payload,
    createdAt,
    editedAt: null
  }
}

it('numbers writebacks in the order they were written, skipping plain comments', () => {
  const writebacks = localTaskWritebacks([
    comment('second', 3, { progress: true, sessionLinkId: 's-1' }),
    comment('plain', 2, null),
    comment('first', 1, { progress: true })
  ])
  expect(writebacks.map((writeback) => [writeback.event.id, writeback.number])).toEqual([
    ['first', 1],
    ['second', 2]
  ])
  expect(writebacks[1].sessionLinkId).toBe('s-1')
  expect(findLocalTaskWriteback(writebacks, { at: 9, body: 'first' })?.number).toBe(1)
})

it('finds the self-check and where-to-accept rows under either language’s heading', () => {
  const sections = parseLocalTaskProgressSections(
    '做了什么：导出完成\nSelf-check: 10 万行 18.4 秒\n验收：商城后台 → 订单 → 导出'
  )
  expect(localTaskWritebackSection(sections, 'selfCheck')).toBe('10 万行 18.4 秒')
  expect(localTaskWritebackSection(sections, 'verify')).toBe('商城后台 → 订单 → 导出')
  expect(localTaskWritebackSection(parseLocalTaskProgressSections('只有一段话'), 'verify')).toBe(
    null
  )
})
