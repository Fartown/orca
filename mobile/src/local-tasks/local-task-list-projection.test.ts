import { describe, expect, it } from 'vitest'
import type { LocalTaskStatusCategory } from '../../../src/shared/local-tasks/local-task-model'
import type { LocalTask, LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import { buildLocalTaskGroups, localTaskSegmentCounts } from './local-task-list-projection'

const categories: LocalTaskStatusCategory[] = [
  'backlog',
  'unstarted',
  'started',
  'review',
  'completed',
  'canceled'
]
const project: LocalTaskProject = {
  id: 'shop',
  name: 'Shop',
  prefix: 'SHOP',
  aliases: [],
  orcaProjectId: 'orca-shop',
  defaultRepoId: null,
  lastExecutionHostId: null,
  rules: { startMovesToInProgress: true, prMergedCompletes: true },
  statuses: [
    ...categories.map((category) => ({
      id: category,
      projectId: 'shop',
      category,
      name: category,
      color: 'gray' as const,
      position: 0
    })),
    {
      id: 'joint',
      projectId: 'shop',
      category: 'started',
      name: 'Joint testing',
      color: 'orange',
      position: 1
    }
  ],
  createdAt: 0,
  updatedAt: 0,
  revision: 0
}

function task(number: number, statusId: string, parentId: string | null = null): LocalTask {
  return {
    id: `SHOP-${number}`,
    projectId: 'shop',
    number,
    ref: `SHOP-${number}`,
    title: `task ${number}`,
    description: '',
    criteria: [],
    statusId,
    priority: 0,
    labels: [],
    parentId,
    createdAt: 0,
    updatedAt: number,
    revision: 0
  }
}

// The m4 design data: SHOP-12 in progress with three subtasks, one of them still Todo.
const tasks = [
  task(12, 'started'),
  task(13, 'started', 'SHOP-12'),
  task(14, 'started', 'SHOP-12'),
  task(15, 'unstarted', 'SHOP-12'),
  task(10, 'started'),
  task(17, 'joint'),
  task(9, 'review'),
  task(11, 'unstarted'),
  task(16, 'backlog'),
  task(7, 'completed')
]

describe('local task counts (REQ-006)', () => {
  it('counts the project scope with subtasks in the segment control', () => {
    expect(localTaskSegmentCounts(tasks, [project], 'shop')).toEqual({ started: 5, all: 10 })
  })

  it('counts only the rows a list group shows, with nested subtasks riding on their parent', () => {
    const groups = buildLocalTaskGroups({
      tasks,
      projects: [project],
      projectId: 'shop',
      segment: 'all',
      nestSubtasks: true,
      keepEmpty: false
    })
    const shown = Object.fromEntries(
      groups.map((group) => [group.key, group.rows.map((row) => row.task.ref)])
    )
    expect(shown).toEqual({
      backlog: ['SHOP-16'],
      unstarted: ['SHOP-11'],
      started: ['SHOP-12', 'SHOP-10'],
      joint: ['SHOP-17'],
      review: ['SHOP-9'],
      completed: ['SHOP-7']
    })
    const parent = groups.find((group) => group.key === 'started')?.rows[0]
    expect(parent?.subtasks.map((child) => child.ref)).toEqual(['SHOP-13', 'SHOP-14', 'SHOP-15'])
    expect([parent?.subtaskDone, parent?.subtaskTotal]).toEqual([0, 3])
  })

  it('in the Started segment, nests only Started subtasks and the board shows every task as a card', () => {
    const list = buildLocalTaskGroups({
      tasks,
      projects: [project],
      projectId: 'shop',
      segment: 'started',
      nestSubtasks: true,
      keepEmpty: false
    })
    expect(
      list
        .flatMap((group) =>
          group.rows.flatMap((row) => [row.task.ref, ...row.subtasks.map((child) => child.ref)])
        )
        .sort()
    ).toEqual(['SHOP-10', 'SHOP-12', 'SHOP-13', 'SHOP-14', 'SHOP-17'])
    const board = buildLocalTaskGroups({
      tasks,
      projects: [project],
      projectId: 'shop',
      segment: 'all',
      nestSubtasks: false,
      keepEmpty: true
    })
    expect(board.reduce((sum, column) => sum + column.rows.length, 0)).toBe(10)
    expect(board.map((column) => column.key)).toEqual([
      'backlog',
      'unstarted',
      'started',
      'joint',
      'review',
      'completed',
      'canceled'
    ])
  })

  it('across projects, groups by category so custom statuses share a column', () => {
    const board = buildLocalTaskGroups({
      tasks,
      projects: [project],
      projectId: null,
      segment: 'all',
      nestSubtasks: false,
      keepEmpty: true
    })
    expect(board.find((column) => column.key === 'category:started')?.rows).toHaveLength(5)
  })
})
