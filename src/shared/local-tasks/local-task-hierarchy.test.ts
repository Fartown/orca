import { describe, expect, it } from 'vitest'
import type { LocalTask } from './local-task-types'
import { buildLocalTaskIndex } from './local-task-grouping'
import {
  localTaskParentCandidates,
  localTaskPathFromRoot,
  localTaskPathLabel,
  localTaskWorkspaceFamilyIds
} from './local-task-hierarchy'

function task(number: number, parentId: number | null, projectId = 'shop'): LocalTask {
  return {
    id: `t${number}`,
    projectId,
    number,
    ref: `SHOP-${number}`,
    title: `Task ${number}`,
    description: '',
    criteria: [],
    statusId: 'todo',
    priority: 0,
    labels: [],
    parentId: parentId === null ? null : `t${parentId}`,
    createdAt: 0,
    updatedAt: 0,
    revision: 1
  }
}

// t1 › t2 › t3 › t4, t1 › t5, and t9 in another project.
const tasks = [task(1, null), task(2, 1), task(3, 2), task(4, 3), task(5, 1), task(9, null, 'blog')]
const index = buildLocalTaskIndex([], tasks)

describe('task tree for one task (REQ-004)', () => {
  it('offers any level of the same project as parent, never the task or its descendants', () => {
    const ids = (candidates: LocalTask[]) => candidates.map((candidate) => candidate.id)
    expect(ids(localTaskParentCandidates(task(2, 1), 'shop', tasks, index))).toEqual(['t1', 't5'])
    expect(ids(localTaskParentCandidates(task(4, 3), 'shop', tasks, index))).toEqual([
      't1',
      't2',
      't3',
      't5'
    ])
    expect(ids(localTaskParentCandidates(null, 'shop', tasks, index))).toHaveLength(5)
  })

  it('reads the path by titles, root first, the parent last', () => {
    const path = localTaskPathFromRoot(task(4, 3), index.tasksById)
    expect(path.map((ancestor) => ancestor.id)).toEqual(['t1', 't2', 't3'])
    expect(localTaskPathLabel(path)).toBe('Task 1 › Task 2 › Task 3')
  })

  it('takes descendants into a workspace until one has a workspace of its own', () => {
    const owners = new Set(['t1', 't3'])
    expect(localTaskWorkspaceFamilyIds('t1', index, (id) => owners.has(id))).toEqual([
      't1',
      't2',
      't5'
    ])
    expect(localTaskWorkspaceFamilyIds('t3', index, (id) => owners.has(id))).toEqual(['t3', 't4'])
  })
})
