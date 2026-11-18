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
  groupLocalTasksForList,
  localTaskGroupKey,
  localTaskListGroupTasks,
  tallyLocalTaskGroups
} from './local-task-list-groups'
import { EMPTY_LOCAL_TASK_FILTERS } from './local-task-page-store'
import { clampLocalTaskCursor } from './local-task-cursor'

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
    repos: [`orca-${id}`],
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
  it('places a cross-status subtask in its own accessible status group', () => {
    const family = [
      task(shop, 40, 'shop-doing'),
      task(shop, 41, 'shop-doing', { parentId: 'SHOP-40' }),
      task(shop, 42, 'shop-todo', { parentId: 'SHOP-40' })
    ]
    const familyIndex = buildLocalTaskIndex([shop], family)
    const groups = groupLocalTasksForList(family, familyIndex, 'shop', ALL, BY_STATUS)
    const doing = groups.find((group) => group.key === 'shop-doing')
    const todo = groups.find((group) => group.key === 'shop-todo')

    expect(doing?.count).toBe(2)
    expect(doing?.entries.map((entry) => entry.task.id)).toEqual(['SHOP-40'])
    expect(doing?.entries[0]?.lines.map((line) => line.task.id)).toEqual(['SHOP-41'])
    expect(todo?.count).toBe(1)
    expect(todo?.entries.map((entry) => [entry.task.id, entry.task.parentId])).toEqual([
      ['SHOP-42', 'SHOP-40']
    ])
    expect(flattenLocalTaskGroups(groups).toSorted()).toEqual(['SHOP-40', 'SHOP-41', 'SHOP-42'])
  })

  it('does not jump a Started grandchild across its Backlog parent to a Started ancestor', () => {
    const chain = [
      task(shop, 50, 'shop-doing'),
      task(shop, 51, 'shop-backlog', { parentId: 'SHOP-50' }),
      task(shop, 52, 'shop-doing', { parentId: 'SHOP-51' })
    ]
    const chainIndex = buildLocalTaskIndex([shop], chain)
    const groups = groupLocalTasksForList(chain, chainIndex, 'shop', ALL, BY_STATUS)
    expect(
      groups.find((group) => group.key === 'shop-doing')?.entries.map((entry) => entry.task.id)
    ).toEqual(['SHOP-52', 'SHOP-50'])
    expect(
      groups.find((group) => group.key === 'shop-backlog')?.entries.map((entry) => entry.task.id)
    ).toEqual(['SHOP-51'])
    expect(groups.flatMap((group) => group.entries.flatMap((entry) => entry.lines))).toEqual([])
    expect(
      groups.flatMap((group) => group.entries.map((entry) => entry.task.id)).toSorted()
    ).toEqual(chain.map((item) => item.id).toSorted())
  })

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

  it('nests only same-status subtasks and gives every cross-status task its own row', () => {
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
      ['shop-integrating', ['SHOP-14']],
      ['shop-todo', ['SHOP-11', 'SHOP-15']],
      ['shop-done', ['SHOP-7']]
    ])
    expect(groups.map((group) => [group.key, group.count])).toEqual([
      ['shop-doing', 2],
      ['shop-integrating', 1],
      ['shop-todo', 2],
      ['shop-done', 1]
    ])
    const board = buildLocalTaskBoardColumns(tasksInScope(tasks, 'shop'), index, 'shop', ALL, BOARD)
    for (const group of groups) {
      expect(board.find((column) => column.key === group.key)?.tasks.length).toBe(group.count)
    }
    expect(groups[0].entries[0].children.map((child) => child.id)).toEqual(['SHOP-13'])
    expect(flattenLocalTaskGroups(groups).toSorted()).toEqual(
      ['SHOP-7', 'SHOP-11', 'SHOP-12', 'SHOP-13', 'SHOP-14', 'SHOP-15'].toSorted()
    )
  })

  it('splits every heading into shown and in-band tasks that add up to its board column', () => {
    const scoped = tasksInScope(tasks, 'shop')
    const groups = groupLocalTasksForList(scoped, index, 'shop', ALL, BY_STATUS)
    // SHOP-12 waits in the band and takes its descendants with it; SHOP-11 stays below.
    const banded = new Set(['SHOP-12', 'SHOP-13', 'SHOP-14', 'SHOP-15'])
    const tallies = tallyLocalTaskGroups(
      groups,
      localTaskListGroupTasks(groups),
      (group, task) => localTaskGroupKey(task, index, group.kind) === group.key,
      banded
    )
    expect(groups.map((group, at) => [group.key, tallies[at]])).toEqual([
      ['shop-doing', { shown: 0, inBand: 2 }],
      ['shop-integrating', { shown: 0, inBand: 1 }],
      ['shop-todo', { shown: 1, inBand: 1 }],
      ['shop-done', { shown: 1, inBand: 0 }]
    ])
    const board = buildLocalTaskBoardColumns(scoped, index, 'shop', ALL, BOARD)
    groups.forEach((group, at) => {
      const tally = tallies[at]
      expect(tally ? tally.shown + tally.inBand : -1).toBe(
        board.find((column) => column.key === group.key)?.tasks.length
      )
    })
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

  it('groups by priority or project using the same parent-child group rule', () => {
    const byPriority = groupLocalTasksForList(tasks, index, null, ALL, {
      groupBy: 'priority',
      sortBy: 'number'
    })
    expect(
      byPriority.map((group) => [group.key, group.entries.map((entry) => entry.task.id)])
    ).toEqual([
      ['priority:2', ['SHOP-12']],
      ['priority:0', ['SHOP-7', 'SHOP-11', 'SHOP-13', 'SHOP-14', 'SHOP-15', 'ORC-28', 'ORC-30']]
    ])
    expect(byPriority[0].entries[0].children).toHaveLength(0)
    const byProject = groupLocalTasksForList(tasks, index, null, ALL, {
      groupBy: 'project',
      sortBy: 'number'
    })
    expect(byProject.map((group) => [group.key, group.entries.length])).toEqual([
      ['shop', 3],
      ['orca', 2]
    ])
  })

  it('keeps the immediate parent boundary across priority changes, but nests by project and none', () => {
    const family = [
      task(shop, 40, 'shop-doing', { priority: 1 }),
      task(shop, 41, 'shop-doing', { parentId: 'SHOP-40', priority: 0 }),
      task(shop, 42, 'shop-doing', { parentId: 'SHOP-41', priority: 1 })
    ]
    const familyIndex = buildLocalTaskIndex([shop], family)
    const grouped = (groupBy: 'priority' | 'project' | 'none') =>
      groupLocalTasksForList(family, familyIndex, 'shop', ALL, { groupBy, sortBy: 'number' })
    const priority = grouped('priority')
    expect(
      priority.find((group) => group.key === 'priority:1')?.entries.map((entry) => entry.task.id)
    ).toEqual(['SHOP-40', 'SHOP-42'])
    expect(
      priority.find((group) => group.key === 'priority:0')?.entries.map((entry) => entry.task.id)
    ).toEqual(['SHOP-41'])
    for (const kind of ['project', 'none'] as const) {
      const groups = grouped(kind)
      expect(groups[0]?.entries.map((entry) => entry.task.id)).toEqual(['SHOP-40'])
      expect(groups[0]?.entries[0]?.lines.map((line) => [line.task.id, line.depth])).toEqual([
        ['SHOP-41', 1],
        ['SHOP-42', 2]
      ])
    }
  })

  it('gives an exact-ref child its own result row even when its parent also matches the text', () => {
    const family = [
      task(shop, 40, 'shop-doing', { title: 'SHOP-42 parent note' }),
      task(shop, 42, 'shop-doing', { parentId: 'SHOP-40' })
    ]
    const familyIndex = buildLocalTaskIndex([shop], family)
    const groups = groupLocalTasksForList(
      family,
      familyIndex,
      'shop',
      { ...ALL, query: 'SHOP-42' },
      BY_STATUS
    )
    expect(groups[0]?.entries.map((entry) => entry.task.id)).toEqual(['SHOP-42', 'SHOP-40'])
    expect(groups[0]?.entries.every((entry) => entry.lines.length === 0)).toBe(true)
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

  it('finds a task moved from another project by its old ref, ahead of near matches', () => {
    const moved = task(orca, 31, 'orc-doing', { formerRefs: ['SHOP-1'] })
    const library = [...tasks, moved]
    const libraryIndex = buildLocalTaskIndex([shop, orca], library)
    const groups = groupLocalTasksForList(
      library,
      libraryIndex,
      null,
      { ...ALL, query: 'SHOP-1' },
      BY_STATUS
    )
    expect(flattenLocalTaskGroups(groups)[0]).toBe('ORC-31')
  })

  it('reads a zero-padded ref as the ref the host resolves', () => {
    expect(matchesLocalTaskQuery(tasks[0], shop, 'shop-012')).toBe(true)
    expect(matchesLocalTaskQuery(tasks[0], shop, 'MALL-0012 csv')).toBe(true)
    const groups = groupLocalTasksForList(
      tasks,
      index,
      'shop',
      { ...ALL, query: 'shop-07' },
      BY_STATUS
    )
    expect(flattenLocalTaskGroups(groups)).toEqual(['SHOP-7'])
  })
})

describe('task tree in the list (REQ-004, D-008)', () => {
  // SHOP-20 › SHOP-21 › SHOP-22 › SHOP-23, plus SHOP-24 under SHOP-20.
  const tree = [
    task(shop, 20, 'shop-doing'),
    task(shop, 21, 'shop-todo', { parentId: 'SHOP-20' }),
    task(shop, 22, 'shop-done', { parentId: 'SHOP-21' }),
    task(shop, 23, 'shop-doing', { parentId: 'SHOP-22' }),
    task(shop, 24, 'shop-doing', { parentId: 'SHOP-20' })
  ]
  const treeIndex = buildLocalTaskIndex([shop], tree)
  const groups = groupLocalTasksForList(tree, treeIndex, 'shop', ALL, BY_STATUS)

  it('keeps cross-status descendants independent without jumping to a matching grandparent', () => {
    expect(
      groups.flatMap((group) => group.entries.map((entry) => entry.task.id)).toSorted()
    ).toEqual(['SHOP-20', 'SHOP-21', 'SHOP-22', 'SHOP-23'].toSorted())
    const doing = groups.find((group) => group.key === 'shop-doing')
    expect(doing?.entries.find((entry) => entry.task.id === 'SHOP-20')?.lines).toEqual([
      { task: tree[4], depth: 1, childCount: 0 }
    ])
    expect(doing?.entries.find((entry) => entry.task.id === 'SHOP-23')?.task.parentId).toBe(
      'SHOP-22'
    )
    expect(flattenLocalTaskGroups(groups).toSorted()).toEqual(
      tree.map((item) => item.id).toSorted()
    )
  })

  it('walks J/K through any-depth same-group tree and skips folded descendants', () => {
    const oneGroup = groupLocalTasksForList(tree, treeIndex, 'shop', ALL, {
      groupBy: 'none',
      sortBy: 'updated'
    })
    expect(flattenLocalTaskGroups(oneGroup)).toEqual([
      'SHOP-20',
      'SHOP-21',
      'SHOP-22',
      'SHOP-23',
      'SHOP-24'
    ])
    expect(flattenLocalTaskGroups(oneGroup, new Set(['SHOP-21']))).toEqual([
      'SHOP-20',
      'SHOP-21',
      'SHOP-24'
    ])
    expect(flattenLocalTaskGroups(oneGroup, new Set(['SHOP-20']))).toEqual(['SHOP-20'])
  })

  it('moves a cursor that a fold or a collapsed group hid to the nearest row still shown', () => {
    const oneGroup = groupLocalTasksForList(tree, treeIndex, 'shop', ALL, {
      groupBy: 'none',
      sortBy: 'updated'
    })
    const all = flattenLocalTaskGroups(oneGroup)
    const foldedAt21 = flattenLocalTaskGroups(oneGroup, new Set(['SHOP-21']))
    expect(clampLocalTaskCursor('SHOP-23', all, foldedAt21)).toBe('SHOP-21')
    expect(clampLocalTaskCursor('SHOP-24', all, foldedAt21)).toBe('SHOP-24')
    expect(clampLocalTaskCursor('SHOP-21', all, ['SHOP-24'])).toBe('SHOP-24')
    expect(clampLocalTaskCursor('SHOP-21', all, [])).toBeNull()
    expect(clampLocalTaskCursor('elsewhere', all, foldedAt21)).toBe('elsewhere')
  })

  it('lifts a deep task to a row of its own once its parent is filtered out', () => {
    const doing = groupLocalTasksForList(
      tree,
      treeIndex,
      'shop',
      { ...ALL, view: 'started' },
      BY_STATUS
    )
    expect(
      doing.flatMap((group) =>
        group.entries.map((entry) => [entry.task.id, entry.lines.map((line) => line.task.id)])
      )
    ).toEqual([
      ['SHOP-23', []],
      ['SHOP-20', ['SHOP-24']]
    ])
  })
})
