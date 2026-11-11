import { expect, it } from 'vitest'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import { buildLocalTaskIndex } from './local-task-grouping'
import { localTaskTreeRoots, localTaskTreeSearchIds } from './local-task-sidebar-tree'

function task(id: string, parentId: string | null, title: string, updatedAt: number): LocalTask {
  return {
    id,
    projectId: 'project-1',
    number: Number(id.slice(1)),
    ref: `ORC-${id.slice(1)}`,
    title,
    description: '',
    criteria: [],
    statusId: 'status',
    priority: 0,
    labels: [],
    parentId,
    createdAt: 1,
    updatedAt,
    revision: 1
  }
}

const parent = task('t1', null, 'Export orders', 1)
const backend = task('t2', 't1', 'Backend endpoint', 3)
const frontend = task('t3', 't1', 'Frontend button', 2)
const grandchild = task('t4', 't3', 'Download wiring', 4)
const tasks = [parent, backend, frontend, grandchild]
const index = buildLocalTaskIndex([], tasks)

it('lists a match at the top only when no ancestor also matches', () => {
  const started = new Set(['t2', 't3', 't4'])
  // The parent is not in the view, so its started children stand on their own; t4 rides under t3.
  expect(localTaskTreeRoots(tasks, index, (t) => started.has(t.id)).map((t) => t.id)).toEqual([
    't2',
    't3'
  ])
  expect(localTaskTreeRoots(tasks, index, () => true).map((t) => t.id)).toEqual(['t1'])
})

it('keeps the path to every search hit and nothing else', () => {
  expect(localTaskTreeSearchIds(tasks, index, '  ')).toBeNull()
  expect([...(localTaskTreeSearchIds(tasks, index, 'download') ?? [])].sort()).toEqual([
    't1',
    't3',
    't4'
  ])
  expect([...(localTaskTreeSearchIds(tasks, index, 'ORC-2') ?? [])].sort()).toEqual(['t1', 't2'])
})
