// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'

const fixture = vi.hoisted(() => ({
  save: vi.fn(
    async (_id: string, _patch: { description?: string; title?: string }, _revision: number) =>
      'saved' as const
  )
}))
vi.mock('@/local-tasks/local-task-writes', () => ({ saveLocalTaskPatch: fixture.save }))

import { LocalTaskDetailBody, LocalTaskDetailTitle } from './LocalTaskDetailBody'
import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'

const task: LocalTask = {
  id: 'task-1',
  projectId: 'project-1',
  number: 1,
  ref: 'ONE-1',
  title: 'Task',
  description: '',
  criteria: ['First criterion'],
  statusId: 'status-1',
  priority: 0,
  labels: [],
  parentId: null,
  createdAt: 1,
  updatedAt: 1,
  revision: 3
}

beforeEach(() => {
  fixture.save.mockReset()
  fixture.save.mockImplementation(
    async (_id: string, patch: { description?: string; title?: string }) => {
      localTasksDomainStore.getState().upsertTasks([{ ...task, ...patch, revision: 4 }])
      return 'saved' as const
    }
  )
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
  localTasksDomainStore.getState().openEndpoint('local')
  localTasksDomainStore.getState().writer('local').applyTasks([task])
})
afterEach(cleanup)

it('has no criteria editor for legacy rows and still saves the description', async () => {
  const view = render(<LocalTaskDetailBody task={task} writable />)
  expect(screen.queryByText('First criterion')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Remove criterion' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Add description' }))
  const description = screen.getByRole('textbox', { name: 'Description' })
  fireEvent.change(description, { target: { value: 'Clarified work' } })
  fireEvent.blur(description)
  await waitFor(() =>
    expect(fixture.save).toHaveBeenCalledWith('task-1', { description: 'Clarified work' }, 3)
  )
  view.rerender(
    <LocalTaskDetailBody task={{ ...task, description: 'Clarified work', revision: 4 }} writable />
  )
  // Saved, the description reads as text again and a click reopens the editor.
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Description' })).toBeNull())
  fireEvent.click(screen.getByRole('button', { name: 'Clarified work' }))
  expect(screen.getByRole('textbox', { name: 'Description' })).toHaveProperty(
    'value',
    'Clarified work'
  )
})

it('preserves input typed during a save when a newer remote revision changes the same field', async () => {
  let finishSave: (outcome: 'saved') => void = () => {}
  fixture.save.mockImplementationOnce(
    () =>
      new Promise<'saved'>((resolve) => {
        finishSave = resolve
      })
  )
  const view = render(<LocalTaskDetailTitle task={task} writable />)
  const title = screen.getByRole('textbox', { name: 'Title' })
  fireEvent.change(title, { target: { value: 'First' } })
  fireEvent.blur(title)
  fireEvent.change(title, { target: { value: 'Second' } })
  const remote = { ...task, title: 'Remote', revision: 5 }
  localTasksDomainStore.getState().upsertTasks([remote])
  view.rerender(<LocalTaskDetailTitle task={remote} writable />)
  finishSave('saved')
  await waitFor(() => expect(screen.getByText(/Changed on another device/)).toBeTruthy())
  expect(title).toHaveProperty('value', 'Second')
})
