// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'

type UpdateCall = { expectedRevision?: number; patch: Partial<LocalTask> }

// Stands in for the desktop task library: it refuses a write made against an older revision.
const host = vi.hoisted(() => {
  const state: { task: LocalTask | null; updates: UpdateCall[] } = { task: null, updates: [] }
  return state
})

vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: async (_target: unknown, method: string, params: unknown) => {
    const current = host.task
    if (!current) {
      throw new Error('no task')
    }
    if (method === 'localTasks.tasks.list') {
      return { tasks: [current] }
    }
    if (method === 'localTasks.tasks.update') {
      const { LocalTasksTasksUpdateParams } =
        await import('../../../../shared/local-tasks/local-tasks-rpc-params')
      const call = LocalTasksTasksUpdateParams.parse(params)
      host.updates.push(call)
      if (call.expectedRevision !== current.revision) {
        return { ok: false, code: 'stale' }
      }
      host.task = { ...current, ...call.patch, revision: current.revision + 1 }
      return { ok: true, task: host.task }
    }
    throw new Error(`unexpected ${method}`)
  }
}))

import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import { LocalTaskDetailBody } from './LocalTaskDetailBody'

function storedTask(revision: number, title: string): LocalTask {
  return {
    id: 't1',
    projectId: 'p1',
    number: 12,
    ref: 'MALL-12',
    title,
    description: '',
    criteria: [],
    statusId: 's1',
    priority: 0,
    labels: [],
    parentId: null,
    createdAt: 1,
    updatedAt: revision,
    revision
  }
}

/** Another device writes: the library moves on and the push re-renders the detail. */
function pushFromPhone(task: LocalTask, rerender: (task: LocalTask) => void): void {
  host.task = task
  localTasksDomainStore.getState().applyTasks([task])
  rerender(task)
}

function titleInput(): HTMLInputElement {
  const input = screen.getByLabelText('Title')
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('title is not an input')
  }
  return input
}

function renderDetail(task: LocalTask): (next: LocalTask) => void {
  const view = render(<LocalTaskDetailBody task={task} writable />)
  return (next) => view.rerender(<LocalTaskDetailBody task={next} writable />)
}

beforeEach(() => {
  host.updates = []
  host.task = storedTask(3, 'Desktop')
  localTasksDomainStore.setState({
    ...localTasksDomainStore.getInitialState(),
    connection: 'live',
    hostState: 'ready',
    tasks: [storedTask(3, 'Desktop')]
  })
})

afterEach(cleanup)

describe('LocalTaskDetailBody with another device editing (REQ-017)', () => {
  it('follows pushed changes while nothing is being edited', () => {
    const rerender = renderDetail(storedTask(3, 'Desktop'))
    pushFromPhone(storedTask(4, 'Phone title'), rerender)
    expect(titleInput().value).toBe('Phone title')
  })

  it('keeps an unsaved title over a push and asks before overwriting the other edit', async () => {
    const rerender = renderDetail(storedTask(3, 'Desktop'))
    fireEvent.change(titleInput(), { target: { value: 'Desktop edit' } })
    pushFromPhone(storedTask(4, 'Phone title'), rerender)
    expect(titleInput().value).toBe('Desktop edit')

    fireEvent.blur(titleInput())
    await screen.findByRole('alert')
    expect(titleInput().value).toBe('Desktop edit')
    expect(host.updates).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Overwrite with mine' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(host.updates.map((call) => call.expectedRevision)).toEqual([3, 4])
    expect(host.task?.title).toBe('Desktop edit')
  })

  it('saves without asking when the other device changed a different field', async () => {
    const rerender = renderDetail(storedTask(3, 'Desktop'))
    fireEvent.change(titleInput(), { target: { value: 'Desktop edit' } })
    pushFromPhone({ ...storedTask(4, 'Desktop'), statusId: 's2' }, rerender)

    fireEvent.blur(titleInput())
    await waitFor(() => expect(host.task?.title).toBe('Desktop edit'))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(host.task?.statusId).toBe('s2')
  })
})
