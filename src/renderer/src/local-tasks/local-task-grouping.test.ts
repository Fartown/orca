import { describe, expect, it } from 'vitest'
import type {
  LocalTask,
  LocalTaskProject,
  LocalTaskStatusDef
} from '../../../shared/local-tasks/local-task-types'
import type { LocalTaskStatusCategory } from '../../../shared/local-tasks/local-task-model'
import {
  buildLocalTaskIndex,
  countLocalTaskViews,
  matchesLocalTaskQuery,
  tasksInScope,
  type LocalTaskVisibility
} from './local-task-grouping'
import {
  buildLocalTaskBoardColumns,
  flattenLocalTaskGroups,
  groupLocalTasksForList
} from './local-task-list-groups'
import { EMPTY_LOCAL_TASK_FILTERS } from './local-task-page-store'

function status(
  projectId: string,
  id: string,
  category: LocalTaskStatusCategory,
  name: string,
  position = 0
): LocalTaskStatusDef {
  return { id, projectId, category, name, color: 'gray', position }
}

function project(
  id: string,
  prefix: string,
  statuses: LocalTaskStatusDef[],
  aliases: string[] = []
): LocalTaskProject {
  return {
    id,
    name: prefix,
    prefix,
    aliases,
    orcaProjectId: `orca-${id}`,
    defaultRepoId: null,
    lastExecutionHostId: null,
    rules: { startMovesToInProgress: true, prMergedCompletes: true },
    statuses,
    createdAt: 0,
    updatedAt: 0,
    revision: 0
  }
}

let clock = 100
function task(
  owner: LocalTaskProject,
  number: number,
  statusId: string,
  extra: Partial<LocalTask> = {}
): LocalTask {
  clock += 1
  return {
    id: `${owner.prefix}-${number}`,
    projectId: owner.id,
    number,
    ref: `${owner.prefix}-${number}`,
    title: `task ${number}`,
    description: '',
    criteria: [],
    statusId,
    priority: 0,
    labels: [],
    parentId: null,
    createdAt: clock,
    updatedAt: clock,
    revision: 0,
    ...extra
  }
}

const shop = project(
  'shop',
  'SHOP',
  [
    status('shop', 'shop-backlog', 'backlog', 'Backlog'),
    status('shop', 'shop-todo', 'unstarted', 'Todo'),
    status('shop', 'shop-doing', 'started', 'In Progress'),
    status('shop', 'shop-integrating', 'started', 'Integrating', 1),
    status('shop', 'shop-review', 'review', 'In Review'),
    status('shop', 'shop-done', 'completed', 'Done'),
    status('shop', 'shop-canceled', 'canceled', 'Canceled')
  ],
  ['MALL']
)
const orca = project('orca', 'ORC', [
  status('orca', 'orc-todo', 'unstarted', 'Todo'),
  status('orca', 'orc-doing', 'started', 'In Progress'),
  status('orca', 'orc-done', 'completed', 'Done'),
  status('orca', 'orc-canceled', 'canceled', 'Canceled')
])

const tasks = [
  task(shop, 12, 'shop-doing', { title: 'Export orders as CSV', priority: 2 }),
  task(shop, 13, 'shop-doing', { parentId: 'SHOP-12', labels: ['backend'] }),
  task(shop, 14, 'shop-integrating', { parentId: 'SHOP-12' }),
  task(shop, 15, 'shop-todo', { parentId: 'SHOP-12' }),
  task(shop, 11, 'shop-todo'),
  task(shop, 7, 'shop-done'),
  task(orca, 30, 'orc-doing'),
  task(orca, 28, 'orc-done')
]
const index = buildLocalTaskIndex([shop, orca], tasks)
const ALL: LocalTaskVisibility = { view: 'all', filters: EMPTY_LOCAL_TASK_FILTERS, query: '' }
const BY_STATUS = { groupBy: 'status', sortBy: 'updated' } as const
const BOARD = { sortBy: 'updated', showCanceled: false } as const

describe('local task counts and groups (REQ-006)', () => {
  it('counts every task in scope for the rail, subtasks included', () => {
    expect(countLocalTaskViews(tasks, index)).toEqual({
      all: 8,
      started: 4,
      backlog: 0,
      completed: 2,
      canceled: 0
    })
    expect(countLocalTaskViews(tasksInScope(tasks, 'shop'), index).all).toBe(6)
  })

  it('rides subtasks under a shown parent and leaves them out of the group count', () => {
    const groups = groupLocalTasksForList(
      tasksInScope(tasks, 'shop'),
      index,
      'shop',
      ALL,
      BY_STATUS
    )
    const summary = groups.map((group) => [group.key, group.entries.map((entry) => entry.task.id)])
    expect(summary).toEqual([
      ['shop-doing', ['SHOP-12']],
      ['shop-todo', ['SHOP-11']],
      ['shop-done', ['SHOP-7']]
    ])
    expect(groups[0].entries[0].children.map((child) => child.id)).toEqual([
      'SHOP-13',
      'SHOP-14',
      'SHOP-15'
    ])
    expect(flattenLocalTaskGroups(groups).slice(0, 4)).toEqual([
      'SHOP-12',
      'SHOP-13',
      'SHOP-14',
      'SHOP-15'
    ])
  })

  it('shows a matching subtask on its own row when its parent is filtered out', () => {
    const groups = groupLocalTasksForList(
      tasks,
      index,
      'shop',
      { ...ALL, filters: { ...EMPTY_LOCAL_TASK_FILTERS, labels: ['backend'] } },
      BY_STATUS
    )
    expect(groups).toHaveLength(1)
    expect(groups[0].entries.map((entry) => entry.task.id)).toEqual(['SHOP-13'])
  })

  it('groups by category across projects', () => {
    const groups = groupLocalTasksForList(
      tasks,
      index,
      null,
      { ...ALL, view: 'started' },
      BY_STATUS
    )
    expect(groups.map((group) => group.key)).toEqual(['started'])
    expect(groups[0].entries.map((entry) => entry.task.id).sort()).toEqual(['ORC-30', 'SHOP-12'])
  })

  it('gives the board one column per status and hides Canceled until asked', () => {
    const columns = buildLocalTaskBoardColumns(tasks, index, 'shop', ALL, BOARD)
    expect(columns.map((column) => column.key)).toEqual([
      'shop-backlog',
      'shop-todo',
      'shop-doing',
      'shop-integrating',
      'shop-review',
      'shop-done'
    ])
    const integrating = columns.find((column) => column.key === 'shop-integrating')
    expect(integrating?.tasks.map((item) => item.id)).toEqual(['SHOP-14'])
    const withCanceled = buildLocalTaskBoardColumns(tasks, index, 'shop', ALL, {
      ...BOARD,
      showCanceled: true
    })
    expect(withCanceled.at(-1)?.key).toBe('shop-canceled')
  })

  it('groups by priority or project and still rides subtasks under their parent', () => {
    const byPriority = groupLocalTasksForList(tasks, index, null, ALL, {
      groupBy: 'priority',
      sortBy: 'number'
    })
    expect(
      byPriority.map((group) => [group.key, group.entries.map((entry) => entry.task.id)])
    ).toEqual([
      ['priority:2', ['SHOP-12']],
      ['priority:0', ['SHOP-7', 'SHOP-11', 'ORC-28', 'ORC-30']]
    ])
    expect(byPriority[0].entries[0].children).toHaveLength(3)
    const byProject = groupLocalTasksForList(tasks, index, null, ALL, {
      groupBy: 'project',
      sortBy: 'number'
    })
    expect(byProject.map((group) => [group.key, group.entries.length])).toEqual([
      ['shop', 3],
      ['orca', 2]
    ])
  })

  it('applies the sort to list rows and board cards alike', () => {
    const flat = groupLocalTasksForList(tasksInScope(tasks, 'shop'), index, 'shop', ALL, {
      groupBy: 'none',
      sortBy: 'created'
    })
    expect(flat[0].entries.map((entry) => entry.task.id)).toEqual(['SHOP-7', 'SHOP-11', 'SHOP-12'])
    const columns = buildLocalTaskBoardColumns(tasks, index, 'shop', ALL, {
      sortBy: 'priority',
      showCanceled: false
    })
    const doing = columns.find((column) => column.key === 'shop-doing')
    expect(doing?.tasks.map((item) => item.id)).toEqual(['SHOP-12', 'SHOP-13'])
  })

  it('puts the task a ref search names first, even under an earlier prefix', () => {
    const mall = project('mall', 'MALL', shop.statuses, ['SHOP'])
    const renamed = [
      task(mall, 1, 'shop-done'),
      task(mall, 10, 'shop-doing'),
      task(mall, 11, 'shop-doing'),
      task(mall, 12, 'shop-todo')
    ]
    const renamedIndex = buildLocalTaskIndex([mall], renamed)
    const search = { ...ALL, query: 'shop-1' }
    const groups = groupLocalTasksForList(renamed, renamedIndex, 'mall', search, BY_STATUS)
    expect(flattenLocalTaskGroups(groups)).toEqual(['MALL-1', 'MALL-11', 'MALL-10', 'MALL-12'])
    const columns = buildLocalTaskBoardColumns(renamed, renamedIndex, 'mall', search, {
      sortBy: 'number',
      showCanceled: false
    })
    expect(columns.find((column) => column.key === 'shop-done')?.tasks[0]?.id).toBe('MALL-1')
  })

  it('finds a task by an earlier prefix', () => {
    expect(matchesLocalTaskQuery(tasks[0], shop, 'mall-12')).toBe(true)
    expect(matchesLocalTaskQuery(tasks[0], shop, 'csv export')).toBe(true)
    expect(matchesLocalTaskQuery(tasks[0], shop, 'refund')).toBe(false)
  })
})
