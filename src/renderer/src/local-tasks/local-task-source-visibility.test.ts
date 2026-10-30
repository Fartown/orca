import { beforeEach, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ setPreference: vi.fn() }))

vi.mock('@/store', async () => {
  const { createTestStore } = await import('@/store/slices/store-test-helpers')
  return { useAppStore: createTestStore() }
})
vi.mock('./local-tasks-runtime-client', () => ({
  localTasksClient: { setPreference: fixture.setPreference }
}))

import { localTasksDomainStore } from './local-tasks-domain-store'
import { localTaskPageStore } from './local-task-page-store'
import {
  chooseLocalTaskSourceVisible,
  selectLocalTaskSourceVisible
} from './local-task-source-visibility'

const STATUS = {
  taskHost: true,
  state: 'ready',
  reason: null,
  revision: 1,
  taskHostId: 'h1',
  projectCount: 0
} as const

beforeEach(() => {
  fixture.setPreference.mockReset()
  fixture.setPreference.mockResolvedValue({ ok: true })
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
  localTasksDomainStore.getState().openEndpoint('local')
  localTaskPageStore.getState().setLocalActive(false)
})

it('shows Local until the user hides it, and takes a project-less library at its status word', () => {
  const visible = (): boolean => selectLocalTaskSourceVisible(localTasksDomainStore.getState())
  expect(visible()).toBe(true)
  // A library with no project never reads preferences, so the status carries the choice.
  localTasksDomainStore
    .getState()
    .writer('local')
    .applyStatus({ ...STATUS, sourceHidden: true })
  expect(visible()).toBe(false)
  // Once preferences are read they own the value; a stale status cannot undo a write.
  localTasksDomainStore.getState().writer('local').applyPreferences({ taskSourceHidden: null })
  localTasksDomainStore
    .getState()
    .writer('local')
    .applyStatus({ ...STATUS, sourceHidden: true })
  expect(visible()).toBe(true)
})

it('hiding leaves the page on Local no longer, and a failed save puts the choice back', async () => {
  localTaskPageStore.getState().setLocalActive(true)
  await chooseLocalTaskSourceVisible(false)
  expect(fixture.setPreference).toHaveBeenCalledWith('taskSourceHidden', '1')
  expect(localTaskPageStore.getState().localActive).toBe(false)
  expect(selectLocalTaskSourceVisible(localTasksDomainStore.getState())).toBe(false)

  fixture.setPreference.mockRejectedValueOnce(new Error('offline'))
  await expect(chooseLocalTaskSourceVisible(true)).rejects.toThrow('offline')
  expect(selectLocalTaskSourceVisible(localTasksDomainStore.getState())).toBe(false)
})
