import { describe, expect, it } from 'vitest'
import {
  buildLocalTaskIndex,
  matchesLocalTaskQuery,
  isExactLocalTaskRef,
  isLocalTaskVisible,
  countLocalTaskViews,
  localTaskSubtaskProgress
} from '../../../src/shared/local-tasks/local-task-grouping'
import { groupLocalTasksForList } from '../../../src/shared/local-tasks/local-task-list-groups'
import { suggestLocalTaskPrefix } from '../../../src/shared/local-tasks/local-task-prefix-suggestion'
import {
  localTaskMatchesFilter,
  localTaskExactRefMatch,
  EMPTY_LOCAL_TASK_FILTER
} from './local-task-filter'
import { buildLocalTaskGroups, localTaskSegmentCounts } from './local-task-list-projection'
import type { LocalTask, LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'

const project: LocalTaskProject = {
  id: 'shop',
  name: 'Shop',
  prefix: 'SHOP',
  aliases: ['OLD'],
  repos: ['orca'],
  defaultRepoId: 'orca',
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: true, prMergedCompletes: true },
  statuses: [
    {
      id: 'doing',
      projectId: 'shop',
      category: 'started',
      name: 'Doing',
      color: 'blue',
      position: 0
    },
    {
      id: 'done',
      projectId: 'shop',
      category: 'completed',
      name: 'Done',
      color: 'green',
      position: 0
    },
    {
      id: 'cancel',
      projectId: 'shop',
      category: 'canceled',
      name: 'Cancel',
      color: 'gray',
      position: 0
    }
  ],
  createdAt: 1,
  updatedAt: 1,
  revision: 1
}
function task(number: number, extra: Partial<LocalTask> = {}): LocalTask {
  return {
    id: `t${number}`,
    projectId: 'shop',
    number,
    ref: `SHOP-${number}`,
    title: 'refund customer webhook',
    description: '',
    criteria: [],
    statusId: 'doing',
    priority: 0,
    labels: [],
    parentId: null,
    createdAt: number,
    updatedAt: number,
    revision: 1,
    ...extra
  }
}
const tasks = [
  task(1),
  task(2, { parentId: 't1', statusId: 'done' }),
  task(3, { parentId: 't1', statusId: 'cancel' })
]
const index = buildLocalTaskIndex([project], tasks)
const context = {
  projects: new Map([['shop', project]]),
  statuses: new Map(project.statuses.map((s) => [s.id, s]))
}

describe('desktop and phone task projections', () => {
  it('shares AND search and normalized exact historical references', () => {
    for (const query of ['refund webhook', 'webhook refund', 'old-01', 'refund missing', '']) {
      expect(localTaskMatchesFilter(tasks[0], { ...EMPTY_LOCAL_TASK_FILTER, query }, context)).toBe(
        matchesLocalTaskQuery(tasks[0], project, query)
      )
      expect(localTaskExactRefMatch(tasks[0], query, context)).toBe(
        isExactLocalTaskRef(tasks[0], project, query)
      )
    }
    expect(matchesLocalTaskQuery(tasks[0], project, 'webhook refund')).toBe(true)
  })
  it('shows a task searched by a zero-padded or pre-move ref on both clients, as the host resolves it', () => {
    const moved = task(4, { formerRefs: ['NAT-7'] })
    const cases: [LocalTask, string][] = [
      [tasks[0], 'old-01'],
      [tasks[0], 'SHOP-001'],
      [moved, 'NAT-7'],
      [moved, 'nat-07']
    ]
    for (const [target, query] of cases) {
      expect(localTaskMatchesFilter(target, { ...EMPTY_LOCAL_TASK_FILTER, query }, context)).toBe(
        true
      )
      expect(
        isLocalTaskVisible(target, index, { view: 'all', filters: EMPTY_LOCAL_TASK_FILTER, query })
      ).toBe(true)
      expect(localTaskExactRefMatch(target, query, context)).toBe(true)
    }
  })
  it('shares nested groups, totals and canceled-subtask progress', () => {
    const mobile = buildLocalTaskGroups({
      projects: [project],
      tasks,
      projectId: 'shop',
      segment: 'all',
      nestSubtasks: true,
      keepEmpty: false
    })
    const desktop = groupLocalTasksForList(
      tasks,
      index,
      'shop',
      { view: 'all', filters: EMPTY_LOCAL_TASK_FILTER, query: '' },
      { groupBy: 'status', sortBy: 'priority' }
    )
    // The phone nests deeper levels too; its first level is the desktop's children.
    const firstLevel = (row: (typeof mobile)[number]['rows'][number]) =>
      row.subtasks.filter((line) => line.depth === 1).map((line) => line.task.id)
    expect(mobile.map((g) => g.rows.map((r) => [r.task.id, firstLevel(r)]))).toEqual(
      desktop.map((g) => g.entries.map((e) => [e.task.id, e.children.map((c) => c.id)]))
    )
    expect(mobile[0].rows[0]).toMatchObject({ subtaskDone: 1, subtaskTotal: 1 })
    expect(localTaskSubtaskProgress(tasks[0], index)).toEqual({ done: 1, total: 1 })
    const counts = countLocalTaskViews(tasks, index)
    expect(localTaskSegmentCounts(tasks, [project], 'shop')).toEqual({
      all: counts.all,
      started: counts.started
    })
  })
  it('uses one prefix rule for word names, non-ASCII fallback and collisions', () => {
    expect(suggestLocalTaskPrefix('refund-webhook', new Set())).toBe('RW')
    expect(suggestLocalTaskPrefix('中文', new Set())).toBe('TASK')
    expect(suggestLocalTaskPrefix('refund-webhook', new Set(['RW', 'RW2']))).toBe('RW3')
  })
})
