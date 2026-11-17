import { describe, expect, it } from 'vitest'
import type { LocalTaskSessionLink } from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import { buildLocalTaskIndex } from './local-task-grouping'
import { localTaskVisibleProgress } from './local-task-visible-progress'
import type { LocalTasksDomainState } from './local-tasks-domain-store'

function task(
  id: string,
  parentId: string | null,
  at?: number,
  kind: 'progress' | 'turn-ended' = 'progress'
): LocalTask {
  return {
    id,
    parentId,
    projectId: 'p',
    number: Number(id.slice(-1)),
    ref: id,
    title: id,
    description: '',
    criteria: [],
    statusId: 'started',
    priority: 0,
    labels: [],
    createdAt: 1,
    updatedAt: 1,
    revision: 1,
    ...(at
      ? {
          latestProgress: { kind, body: `result ${id}`, at, sessionLinkId: null }
        }
      : {})
  }
}

function session(id: string, taskId: string): LocalTaskSessionLink {
  return {
    id,
    taskId,
    hostId: 'local',
    worktreeId: null,
    instanceId: null,
    surface: 'terminal',
    tabId: id,
    paneKey: `${id}:leaf`,
    sessionId: null,
    providerSession: null,
    agent: null,
    linkedVia: 'start',
    openedAt: 1
  }
}

function domain(
  sessions: LocalTaskSessionLink[],
  rows: [string, string, number | null, 'done' | 'unverifiable'][]
): Pick<LocalTasksDomainState, 'progress' | 'links'> {
  return {
    links: { workspaces: [], sessions },
    progress: {
      sessions: new Map(
        rows.map(([id, lastMessage, stateSince, state]) => [
          id,
          { taskSessionId: id, state, lastMessage, stateSince, unread: false }
        ])
      ),
      items: [],
      unverifiable: rows.some((row) => row[3] === 'unverifiable')
    }
  }
}

describe('visible task progress', () => {
  it('shows a parent’s own progress before a newer subtask update', () => {
    const parent = task('t1', null, 10)
    const child = task('t2', parent.id, 30)
    const index = buildLocalTaskIndex([], [parent, child])
    expect(localTaskVisibleProgress(parent, index, domain([], []))).toMatchObject({
      task: { id: 't1' },
      progress: { body: 'result t1' }
    })
  })

  it('without its own, chooses the newest across children and grandchildren, unrelated tasks left out', () => {
    const parent = task('t1', null)
    const child = task('t2', parent.id, 30)
    const grandchild = task('t3', child.id, 50)
    const unrelated = task('t4', null, 90)
    const index = buildLocalTaskIndex([], [parent, child, grandchild, unrelated])
    expect(localTaskVisibleProgress(parent, index, domain([], []))).toMatchObject({
      task: { id: 't3' },
      progress: { body: 'result t3' }
    })
    expect(localTaskVisibleProgress(child, index, domain([], []))?.task.id).toBe('t2')
  })

  it('keeps a writeback when the same session’s turn ends after it', () => {
    const owner = task('t1', null, 40)
    const index = buildLocalTaskIndex([], [owner])
    expect(
      localTaskVisibleProgress(
        owner,
        index,
        domain([session('s1', owner.id)], [['s1', 'Last sentence', 45, 'done']])
      )?.progress
    ).toMatchObject({ kind: 'progress', body: 'result t1' })
  })

  it('lets a newer live turn replace an older saved turn end', () => {
    const owner = task('t1', null, 40, 'turn-ended')
    const index = buildLocalTaskIndex([], [owner])
    expect(
      localTaskVisibleProgress(
        owner,
        index,
        domain([session('s1', owner.id)], [['s1', 'Newer sentence', 60, 'done']])
      )?.progress
    ).toMatchObject({ kind: 'turn-ended', body: 'Newer sentence', sessionLinkId: 's1' })
  })

  it('uses a linked session last message for an older host with no latestProgress', () => {
    const owner = task('t1', null)
    const index = buildLocalTaskIndex([], [owner])
    expect(
      localTaskVisibleProgress(
        owner,
        index,
        domain([session('s1', owner.id)], [['s1', 'Agent finished', 22, 'done']])
      )
    ).toMatchObject({
      progress: { kind: 'turn-ended', body: 'Agent finished', sessionLinkId: 's1' }
    })
  })

  it('retains a disconnected session last message without claiming a new turn', () => {
    const owner = task('t1', null, 40)
    const index = buildLocalTaskIndex([], [owner])
    const visible = localTaskVisibleProgress(
      owner,
      index,
      domain([session('s1', owner.id)], [['s1', 'Old words retained', null, 'unverifiable']])
    )
    expect(visible?.progress).toMatchObject({ kind: 'progress', body: 'result t1', at: 40 })
  })
})
