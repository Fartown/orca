import { describe, expect, it } from 'vitest'
import type { LocalTaskSessionState } from './local-task-link-types'
import { localTaskFinishedSessions } from './local-task-finished-sessions'

const tasks = [
  { id: 'parent', parentId: null },
  { id: 'child', parentId: 'parent' },
  { id: 'grandchild', parentId: 'child' },
  { id: 'other', parentId: null }
]

function finished(taskId: string, states: Record<string, LocalTaskSessionState>) {
  return localTaskFinishedSessions({
    taskId,
    tasks,
    sessions: [
      { id: 's-parent', taskId: 'parent' },
      { id: 's-child', taskId: 'child' },
      { id: 's-grandchild', taskId: 'grandchild' },
      { id: 's-other', taskId: 'other' }
    ],
    stateOf: (id) => states[id]
  }).map((session) => session.id)
}

describe('localTaskFinishedSessions (REQ-024, REQ-029)', () => {
  it('reaches the finished sessions of the task and its subtasks at any depth', () => {
    expect(
      finished('parent', {
        's-parent': 'working',
        's-child': 'done',
        's-grandchild': 'done',
        's-other': 'done'
      })
    ).toEqual(['s-child', 's-grandchild'])
  })

  it('leaves out sessions that work, wait or cannot be confirmed', () => {
    expect(
      finished('parent', {
        's-parent': 'waiting',
        's-child': 'unverifiable',
        's-grandchild': 'blocked'
      })
    ).toEqual([])
  })

  it('does not climb to the parent from a subtask', () => {
    expect(finished('child', { 's-parent': 'done', 's-child': 'done' })).toEqual(['s-child'])
  })
})
