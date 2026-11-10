import { expect, it } from 'vitest'
import type { LocalTaskProgressSnapshot } from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTask, LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import {
  localTaskAttentionRows,
  localTaskAttentionTaskCount,
  localTaskNeedsYou
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

it('groups "Needs you" as the desktop does: waiting first, review wins, subtasks ride along', () => {
  const started = { ...project.statuses[0]!, id: 'started', category: 'started' as const }
  const withStarted = { ...project, statuses: [...project.statuses, started] }
  const item = (taskId: string, since: number) => ({
    key: `${taskId}@${since}`,
    taskId,
    taskSessionId: `s-${taskId}`,
    kind: 'question' as const,
    agent: 'codex',
    lastMessage: 'Top or bottom?',
    since,
    replyable: false
  })
  const parent = task('1', 'review')
  const child = { ...task('2', 'started'), parentId: '1' }
  const other = task('3', 'started')
  const { rows, ids } = localTaskNeedsYou({
    snapshot: {
      observedAt: 200,
      sessions: [],
      items: [item('1', 10), item('2', 20), item('3', 30)]
    },
    tasks: [parent, child, other],
    projects: [withStarted],
    projectId: null
  })
  expect(rows.map((row) => [row.task.id, row.review])).toEqual([
    ['3', false],
    ['1', true]
  ])
  // The parent's own question stays on its review row; the subtask's stays off the band.
  expect(rows[1]?.items.map((entry) => entry.taskId)).toEqual(['1'])
  expect([...ids].sort()).toEqual(['1', '3'])
})
