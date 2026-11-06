import { describe, expect, it } from 'vitest'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { localTaskLatestLine, localTaskLatestProgress } from './local-task-latest-line'

const task = {
  id: 'parent',
  projectId: 'p',
  number: 1,
  ref: 'P-1',
  title: 'Parent',
  description: '',
  criteria: [],
  statusId: 'started',
  priority: 0,
  labels: [],
  parentId: null,
  createdAt: 0,
  updatedAt: 0,
  revision: 1
} satisfies LocalTask

describe('latest line on a parent task', () => {
  it('uses the newest writeback in its descendant tree before session fallback', () => {
    const parent = {
      ...task,
      latestProgress: {
        kind: 'progress' as const,
        body: 'Parent update',
        at: 10,
        sessionLinkId: 'parent-session'
      }
    }
    const child = {
      ...task,
      id: 'child',
      parentId: task.id,
      latestProgress: {
        kind: 'progress' as const,
        body: 'Child update',
        at: 20,
        sessionLinkId: 'child-session'
      }
    }
    expect(localTaskLatestLine(parent, [{ lastMessage: 'older session line' }], [child])).toBe(
      'Child update'
    )
    expect(localTaskLatestProgress(parent, [child])).toMatchObject({
      taskId: 'child',
      body: 'Child update',
      at: 20,
      sessionLinkId: 'child-session'
    })
    expect(localTaskLatestLine(task, [{ lastMessage: 'session line' }])).toBe('session line')
    expect(localTaskLatestProgress(task, [child])).toMatchObject({
      taskId: 'child',
      body: 'Child update',
      at: 20,
      sessionLinkId: 'child-session'
    })
  })
})
