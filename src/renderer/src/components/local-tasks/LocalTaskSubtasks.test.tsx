// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import type { LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import type * as LocalTaskWrites from '@/local-tasks/local-task-writes'

const fixture = vi.hoisted(() => ({
  create: vi.fn(
    async (_parent: { id: string }, titles: string[]): Promise<{ id: string }[] | null> =>
      titles.map((_, index) => ({ id: String(index) }))
  )
}))
vi.mock('@/local-tasks/local-task-writes', async (importOriginal) => ({
  ...(await importOriginal<typeof LocalTaskWrites>()),
  createLocalSubtasks: fixture.create
}))

import { LocalTaskSubtasks } from './LocalTaskSubtasks'

const task: LocalTask = {
  id: 'parent',
  projectId: 'project',
  number: 1,
  ref: 'ONE-1',
  title: 'Parent',
  description: '',
  criteria: [],
  statusId: 'status',
  priority: 0,
  labels: [],
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  revision: 1
}
const index: LocalTaskIndex = {
  projectsById: new Map(),
  statusesById: new Map(),
  tasksById: new Map(),
  childrenByParentId: new Map()
}

afterEach(() => {
  cleanup()
  fixture.create.mockReset()
})

it('keeps the failed tail of a paste beyond the batch limit for retry', async () => {
  fixture.create.mockImplementationOnce(async (_parent: { id: string }, titles: string[]) =>
    titles.map((_, position) => ({ id: String(position) }))
  )
  fixture.create.mockResolvedValueOnce(null)
  fixture.create.mockImplementationOnce(async (_parent: { id: string }, titles: string[]) =>
    titles.map((_, position) => ({ id: String(position) }))
  )
  render(<LocalTaskSubtasks task={task} index={index} writable />)
  const lines = Array.from({ length: 101 }, (_, index) => `Task ${index + 1}`).join('\n')
  fireEvent.paste(screen.getByRole('textbox', { name: 'Add subtask' }), {
    clipboardData: { getData: () => lines }
  })
  await waitFor(() => expect(fixture.create).toHaveBeenCalledTimes(2))
  expect(fixture.create.mock.calls.map(([, titles]) => titles.length)).toEqual([100, 1])
  fireEvent.click(screen.getByRole('button', { name: 'Retry remaining 1 subtasks' }))
  await waitFor(() => expect(fixture.create).toHaveBeenCalledTimes(3))
  expect(fixture.create.mock.calls[2][1]).toEqual(['Task 101'])
})
