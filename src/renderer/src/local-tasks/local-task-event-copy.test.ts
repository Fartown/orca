import { describe, expect, it } from 'vitest'
import type { LocalTask, LocalTaskEvent } from '../../../shared/local-tasks/local-task-types'
import { buildLocalTaskIndex } from '../../../shared/local-tasks/local-task-grouping'
import { describeLocalTaskEvent } from './local-task-event-copy'

const parent: LocalTask = {
  id: 't12',
  projectId: 'shop',
  number: 12,
  ref: 'SHOP-12',
  title: 'Order export',
  description: '',
  criteria: [],
  statusId: 'todo',
  priority: 0,
  labels: [],
  parentId: null,
  createdAt: 0,
  updatedAt: 0,
  revision: 1
}

function parentEvent(payload: Record<string, unknown>): LocalTaskEvent {
  return {
    id: 'e1',
    taskId: 't13',
    kind: 'parent',
    source: 'desktop',
    body: null,
    payload,
    createdAt: 0,
    editedAt: null
  }
}

describe('parent changes in the activity (§4: tasks go by title)', () => {
  const index = buildLocalTaskIndex([], [parent])

  it('names the parent by its title, not its ref', () => {
    expect(describeLocalTaskEvent(parentEvent({ from: null, to: 't12' }), index)).toBe(
      'You made it a subtask of “Order export”'
    )
  })

  it('still reads when the parent is gone', () => {
    expect(describeLocalTaskEvent(parentEvent({ from: 't99', to: null }), index)).toBe(
      'You detached it from a deleted task'
    )
  })
})
