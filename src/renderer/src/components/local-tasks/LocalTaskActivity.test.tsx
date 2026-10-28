// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { LocalTaskIndex } from '@/local-tasks/local-task-grouping'

const rpc = vi.hoisted(() => ({ addComment: vi.fn(), retryEvents: vi.fn(async () => {}) }))
vi.mock('@/local-tasks/local-tasks-runtime-client', () => ({ localTasksClient: rpc }))
vi.mock('@/local-tasks/local-tasks-sync', () => ({
  localTasksSync: { watchEvents: () => () => {}, retryEvents: rpc.retryEvents }
}))
vi.mock('@/hooks/use-now', () => ({ useNow: () => 1_000 }))

import { LocalTaskActivity } from './LocalTaskActivity'
import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import { localTaskPageStore } from '@/local-tasks/local-task-page-store'

const index: LocalTaskIndex = {
  projectsById: new Map(),
  statusesById: new Map(),
  tasksById: new Map(),
  childrenByParentId: new Map()
}

beforeEach(() => {
  rpc.addComment.mockReset()
  rpc.retryEvents.mockClear()
  localTaskPageStore.setState({ commentDrafts: {}, commentBusyTaskIds: [] })
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
  localTasksDomainStore.getState().openEndpoint('local')
  localTasksDomainStore.getState().writer('local').applyEvents('A', [])
  localTasksDomainStore.getState().writer('local').applyEvents('B', [])
})
afterEach(cleanup)

it('keeps comment drafts under their task and submits to the visible task', async () => {
  rpc.addComment.mockResolvedValue({ ok: true })
  const view = render(<LocalTaskActivity taskId="A" index={index} writable />)
  fireEvent.change(screen.getByRole('textbox', { name: 'Comment' }), {
    target: { value: 'draft for A' }
  })
  view.rerender(<LocalTaskActivity taskId="B" index={index} writable />)
  expect(screen.getByRole('textbox', { name: 'Comment' })).toHaveProperty('value', '')
  fireEvent.change(screen.getByRole('textbox', { name: 'Comment' }), {
    target: { value: 'draft for B' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Comment' }))
  await waitFor(() => expect(rpc.addComment).toHaveBeenCalledWith('B', 'draft for B'))
  view.rerender(<LocalTaskActivity taskId="A" index={index} writable />)
  expect(screen.getByRole('textbox', { name: 'Comment' })).toHaveProperty('value', 'draft for A')
})

it('does not clear B when an in-flight save for A finishes', async () => {
  let finishA: (value: { ok: true }) => void = () => {}
  rpc.addComment.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishA = resolve
      })
  )
  const view = render(<LocalTaskActivity taskId="A" index={index} writable />)
  fireEvent.change(screen.getByRole('textbox', { name: 'Comment' }), {
    target: { value: 'draft for A' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Comment' }))
  view.rerender(<LocalTaskActivity taskId="B" index={index} writable />)
  fireEvent.change(screen.getByRole('textbox', { name: 'Comment' }), {
    target: { value: 'draft for B' }
  })
  finishA({ ok: true })
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Comment' })).toHaveProperty('value', 'draft for B')
  )
  view.rerender(<LocalTaskActivity taskId="A" index={index} writable />)
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Comment' })).toHaveProperty('value', '')
  )
})

it('exposes an activity read failure for the selected task', () => {
  localTasksDomainStore.getState().writer('local').setReadError('events:A', 'events read failed')
  render(<LocalTaskActivity taskId="A" index={index} writable />)
  expect(screen.getByRole('alert')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(rpc.retryEvents).toHaveBeenCalledWith('A')
  expect(localTasksDomainStore.getState().subscriptionEpoch).toBe(0)
})
