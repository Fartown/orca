import { describe, expect, it } from 'vitest'
import type {
  LocalTaskPriority,
  LocalTaskStatusCategory
} from '../../../src/shared/local-tasks/local-task-model'
import type { LocalTask, LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import { EMPTY_LOCAL_TASK_FILTER, type LocalTaskFilter } from './local-task-filter'
import { buildLocalTaskGroups, localTaskSegmentCounts } from './local-task-list-projection'

const categories: LocalTaskStatusCategory[] = [
  'backlog',
  'unstarted',
  'started',
  'review',
  'completed',
  'canceled'
]
// SHOP was renamed MALL: refs now read MALL-n and SHOP stays an alias.
const project: LocalTaskProject = {
  id: 'mall',
  name: 'Mall',
  prefix: 'MALL',
  aliases: ['SHOP'],
  repos: ['orca-mall'],
  defaultRepoId: 'orca-mall',
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: true, prMergedCompletes: true },
  statuses: categories.map((category) => ({
    id: category,
    projectId: 'mall',
    category,
    name: category,
    color: 'gray',
    position: 0
  })),
  createdAt: 0,
  updatedAt: 0,
  revision: 0
}

function task(
  number: number,
  title: string,
  statusId: string,
  extra: { priority?: LocalTaskPriority; labels?: string[]; parentId?: string } = {}
): LocalTask {
  return {
    id: `t${number}`,
    projectId: 'mall',
    number,
    ref: `MALL-${number}`,
    title,
    description: '',
    criteria: [],
    statusId,
    priority: extra.priority ?? 0,
    labels: extra.labels ?? [],
    parentId: extra.parentId ?? null,
    createdAt: 0,
    updatedAt: number,
    revision: 0
  }
}

const tasks = [
  task(12, 'Order export CSV', 'started', { priority: 2, labels: ['feature'] }),
  task(13, 'Backend: export job', 'started', { priority: 1, labels: ['backend'], parentId: 't12' }),
  task(14, 'Frontend: export button', 'unstarted', { labels: ['frontend'], parentId: 't12' }),
  task(9, 'Login redirect lost', 'review', { priority: 1, labels: ['bug'] }),
  task(7, 'Order list paging', 'completed', { priority: 3, labels: ['perf'] })
]

function shown(filter: LocalTaskFilter, nestSubtasks = true, list = tasks): string[] {
  return buildLocalTaskGroups({
    tasks: list,
    projects: [project],
    projectId: 'mall',
    segment: 'all',
    filter,
    nestSubtasks,
    keepEmpty: false
  }).flatMap((group) =>
    group.rows.flatMap((row) => [
      row.task.ref,
      ...row.subtasks.map((child) => `>${child.task.ref}`)
    ])
  )
}

describe('task page search and filter', () => {
  it('finds a task by its ref, by a ref written with an old prefix, and by title', () => {
    expect(shown({ ...EMPTY_LOCAL_TASK_FILTER, query: 'mall-9' })).toEqual(['MALL-9'])
    expect(shown({ ...EMPTY_LOCAL_TASK_FILTER, query: 'SHOP-7' })).toEqual(['MALL-7'])
    expect(shown({ ...EMPTY_LOCAL_TASK_FILTER, query: 'redirect' })).toEqual(['MALL-9'])
  })

  it('passes any value within one dimension and requires every dimension', () => {
    expect(shown({ ...EMPTY_LOCAL_TASK_FILTER, priorities: [1, 3] }).sort()).toEqual([
      'MALL-13',
      'MALL-7',
      'MALL-9'
    ])
    expect(shown({ ...EMPTY_LOCAL_TASK_FILTER, priorities: [1], categories: ['review'] })).toEqual([
      'MALL-9'
    ])
    expect(shown({ ...EMPTY_LOCAL_TASK_FILTER, labels: ['bug', 'perf'], query: 'order' })).toEqual([
      'MALL-7'
    ])
  })

  it('shows a matching subtask on its own row when its parent does not match', () => {
    expect(shown({ ...EMPTY_LOCAL_TASK_FILTER, labels: ['backend'] })).toEqual(['MALL-13'])
    expect(shown({ ...EMPTY_LOCAL_TASK_FILTER, query: 'export' })).toEqual([
      'MALL-12',
      '>MALL-13',
      '>MALL-14'
    ])
  })

  it('puts the task whose ref is exactly the search first, old prefix included', () => {
    // SHOP-1 is a completed task, so status order alone would list it after MALL-12.
    const withOne = [...tasks, task(1, 'Cart badge', 'completed')]
    expect(shown({ ...EMPTY_LOCAL_TASK_FILTER, query: 'SHOP-1' }, true, withOne)).toEqual([
      'MALL-1',
      'MALL-12',
      '>MALL-13',
      '>MALL-14'
    ])
  })

  it('leaves the segment totals alone and narrows only what the groups show (REQ-006)', () => {
    expect(localTaskSegmentCounts(tasks, [project], 'mall')).toEqual({ started: 2, all: 5 })
    const board = buildLocalTaskGroups({
      tasks,
      projects: [project],
      projectId: 'mall',
      segment: 'all',
      filter: { ...EMPTY_LOCAL_TASK_FILTER, categories: ['started', 'review'] },
      nestSubtasks: false,
      keepEmpty: true
    })
    expect(board.map((column) => [column.key, column.rows.length])).toEqual([
      ['started', 2],
      ['review', 1]
    ])
  })
})
