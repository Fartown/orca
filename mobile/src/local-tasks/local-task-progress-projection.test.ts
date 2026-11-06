import { expect, it } from 'vitest'
import type { LocalTaskProgressSnapshot } from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import {
  localTaskAttentionRows,
  localTaskAttentionTaskCount
} from './local-task-progress-projection'

const project: LocalTaskProject = {
  id: 'p',
  name: 'Project',
  prefix: 'P',
  aliases: [],
  repos: [],
  defaultRepoId: null,
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: true, prMergedCompletes: false },
  statuses: [
    {
      id: 'review',
      projectId: 'p',
      category: 'review',
      name: 'Ready',
      color: 'yellow',
      position: 0
    }
  ],
  createdAt: 0,
  updatedAt: 0,
  revision: 0
}
function task(id: string, statusId: string): LocalTask {
  return {
    id,
    projectId: 'p',
    number: Number(id),
    ref: `P-${id}`,
    title: id,
    description: '',
    criteria: [],
    statusId,
    priority: 0,
    labels: [],
    parentId: null,
    createdAt: 0,
    updatedAt: 100,
    revision: 0
  }
}

it('counts one task with multiple waiting sessions once and includes review tasks once', () => {
  const snapshot: LocalTaskProgressSnapshot = {
    observedAt: 200,
    sessions: [],
    items: ['one', 'two'].map((key) => ({
      key,
      taskId: '1',
      taskSessionId: key,
      kind: 'unread-done' as const,
      agent: 'claude',
      lastMessage: null,
      since: 50,
      replyable: true
    }))
  }
  const rows = localTaskAttentionRows({
    snapshot,
    tasks: [task('1', 'review'), task('2', 'review')],
    projects: [project],
    projectId: null
  })
  expect(rows.map((row) => [row.task.id, row.items.length, row.review])).toEqual([
    ['1', 2, true],
    ['2', 0, true]
  ])
  expect(localTaskAttentionTaskCount(rows)).toBe(2)
})
