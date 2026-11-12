import { describe, expect, it } from 'vitest'
import type { LocalTaskAttentionItem } from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import { buildLocalTaskIndex } from './local-task-grouping'
import { buildLocalTaskNeedsYouBand } from './local-task-needs-you-band'
import { localTaskNeedsYouCount } from './local-task-needs-you-rows'

const project: LocalTaskProject = {
  id: 'p',
  name: 'P',
  prefix: 'P',
  aliases: [],
  repos: [],
  defaultRepoId: null,
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: true, prMergedCompletes: false },
  statuses: [
    {
      id: 'started',
      projectId: 'p',
      name: 'In Progress',
      category: 'started',
      color: 'yellow',
      position: 0
    },
    {
      id: 'review',
      projectId: 'p',
      name: 'Review',
      category: 'review',
      color: 'green',
      position: 1
    }
  ],
  createdAt: 1,
  updatedAt: 1,
  revision: 1
}

function task(
  id: string,
  statusId: string,
  parentId: string | null = null,
  updatedAt = 1
): LocalTask {
  return {
    id,
    parentId,
    projectId: 'p',
    number: 1,
    ref: id,
    title: id,
    description: '',
    criteria: [],
    statusId,
    priority: 0,
    labels: [],
    createdAt: 1,
    updatedAt,
    revision: 1
  }
}

function item(taskId: string, since: number): LocalTaskAttentionItem {
  return {
    key: `${taskId}@${since}`,
    taskId,
    taskSessionId: `s-${taskId}`,
    kind: 'question',
    agent: 'claude',
    lastMessage: null,
    since,
    replyable: false
  }
}

function band(tasks: LocalTask[], items: LocalTaskAttentionItem[], visible = tasks) {
  return buildLocalTaskNeedsYouBand({
    progress: { sessions: new Map(), items, unverifiable: false },
    index: buildLocalTaskIndex([project], tasks),
    visibleIds: new Set(visible.map((candidate) => candidate.id))
  })
}

describe('buildLocalTaskNeedsYouBand', () => {
  it('puts a task under review in the review group even when a session also waits', () => {
    const result = band([task('a', 'review'), task('b', 'started')], [item('a', 5), item('b', 4)])
    expect(result.review.map((row) => row.task.id)).toEqual(['a'])
    expect(result.waiting.map((row) => row.task.id)).toEqual(['b'])
  })

  it('folds a subtask into its ancestor under review, and keeps it out of the groups below', () => {
    const tasks = [
      task('parent', 'review'),
      task('child', 'review', 'parent'),
      task('grand', 'started', 'child')
    ]
    const result = band(tasks, [item('grand', 3)])
    expect(result.review.map((row) => row.task.id)).toEqual(['parent'])
    expect(result.waiting).toEqual([])
    expect([...result.ids].sort()).toEqual(['child', 'grand', 'parent'])
  })

  it('takes the subtasks of a waiting task out of the groups below with it', () => {
    const tasks = [
      task('waiting', 'started'),
      task('sub', 'started', 'waiting'),
      task('deeper', 'started', 'sub'),
      task('apart', 'started')
    ]
    const result = band(tasks, [item('waiting', 3)])
    expect(result.waiting.map((row) => row.task.id)).toEqual(['waiting'])
    expect([...result.ids].sort()).toEqual(['deeper', 'sub', 'waiting'])
  })

  it('shows only tasks the current view shows', () => {
    const shown = task('shown', 'started')
    const result = band([shown, task('hidden', 'review')], [item('shown', 1)], [shown])
    expect(result.waiting.map((row) => row.task.id)).toEqual(['shown'])
    expect(result.review).toEqual([])
  })
})

describe('localTaskNeedsYouCount', () => {
  it('counts the rows of the section, so subtasks of a task under review add nothing', () => {
    const tasks = [
      task('parent', 'review'),
      task('child', 'review', 'parent'),
      task('b', 'started')
    ]
    const progress = { sessions: new Map(), items: [item('b', 2)], unverifiable: false }
    expect(localTaskNeedsYouCount({ tasks, projects: [project], progress })).toBe(2)
  })
})
