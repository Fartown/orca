import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { localTaskDeepLink } from '../../../shared/local-tasks/local-task-deep-link'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import type * as LocalTasksDomainModule from './local-tasks-domain-store'

type MockAppState = {
  runtimeEnvironmentCatalogSettled: boolean
  runtimeEnvironments: { id: string }[]
  reachable: string[]
}

type MockState = {
  open: ReturnType<typeof vi.fn>
  error: ReturnType<typeof vi.fn>
  warning: ReturnType<typeof vi.fn>
  appState: MockAppState
  appListeners: Set<(state: unknown, previous: unknown) => void>
  domain: ReturnType<typeof LocalTasksDomainModule.createLocalTasksDomainStore> | null
}

const mocks = vi.hoisted<MockState>(() => {
  const appState: MockAppState = {
    runtimeEnvironmentCatalogSettled: true,
    runtimeEnvironments: [],
    reachable: []
  }
  return {
    open: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    appState,
    appListeners: new Set<(state: unknown, previous: unknown) => void>(),
    domain: null
  }
})
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => mocks.appState,
    subscribe: (listener: (state: unknown, previous: unknown) => void) => {
      mocks.appListeners.add(listener)
      return () => mocks.appListeners.delete(listener)
    }
  }
}))
vi.mock('@/hooks/ipc-events/runtime-events/runtime-environment-subscription-selection', () => ({
  getReachableRuntimeEnvironmentIds: (state: { reachable: string[] }) => state.reachable
}))
vi.mock('./local-tasks-domain-store', async (importOriginal) => {
  const original = await importOriginal<typeof LocalTasksDomainModule>()
  mocks.domain = original.createLocalTasksDomainStore()
  return { ...original, localTasksDomainStore: mocks.domain }
})
vi.mock('./local-task-navigation', () => ({ openLocalTaskPage: mocks.open }))
vi.mock('sonner', () => ({ toast: { error: mocks.error, warning: mocks.warning } }))

import { openLocalTaskDeepLink } from './local-task-deep-link-navigation'
const domain = mocks.domain!
let testNow = 0

function task(id: string): LocalTask {
  return {
    id,
    projectId: 'project',
    number: 1,
    ref: 'TASK-1',
    title: id,
    description: '',
    criteria: [],
    statusId: 'started',
    priority: 2,
    labels: [],
    parentId: null,
    createdAt: 0,
    updatedAt: 0,
    revision: 0
  }
}

function setAppState(patch: Partial<typeof mocks.appState>): void {
  const previous = mocks.appState
  mocks.appState = { ...previous, ...patch }
  for (const listener of mocks.appListeners) {
    listener(mocks.appState, previous)
  }
}

beforeEach(() => {
  testNow += 5_000
  vi.spyOn(Date, 'now').mockImplementation(() => testNow)
  mocks.open.mockClear()
  mocks.error.mockClear()
  mocks.warning.mockClear()
  mocks.appState = {
    runtimeEnvironmentCatalogSettled: true,
    runtimeEnvironments: [],
    reachable: []
  }
  domain.getState().closeEndpoint('local')
  domain.getState().closeEndpoint('runtime:env-1')
  domain.getState().closeEndpoint('runtime:env-2')
})
afterEach(() => vi.restoreAllMocks())

it('deduplicates an event and its first pull, but opens another link and a later repeat', () => {
  domain.getState().openEndpoint('local')
  const first = localTaskDeepLink({ endpoint: 'runtime:env-1', taskId: 'first' })
  const second = localTaskDeepLink({ endpoint: 'runtime:env-1', taskId: 'second' })
  openLocalTaskDeepLink(first)
  openLocalTaskDeepLink(first)
  expect(mocks.error).toHaveBeenCalledTimes(1)
  expect(mocks.open).toHaveBeenCalledTimes(1)
  openLocalTaskDeepLink(second)
  expect(mocks.error).toHaveBeenCalledTimes(2)
  testNow += 3_001
  openLocalTaskDeepLink(second)
  expect(mocks.error).toHaveBeenCalledTimes(3)
  expect(mocks.open).toHaveBeenCalledTimes(3)
})

it('waits for the known paired library after the local partition arrives first', () => {
  domain.getState().openEndpoint('local')
  setAppState({ runtimeEnvironmentCatalogSettled: false })
  openLocalTaskDeepLink(localTaskDeepLink({ endpoint: 'runtime:env-1', taskId: 'same-id' }))
  expect(mocks.error).not.toHaveBeenCalled()
  setAppState({
    runtimeEnvironmentCatalogSettled: true,
    runtimeEnvironments: [{ id: 'env-1' }],
    reachable: ['env-1']
  })
  expect(mocks.error).not.toHaveBeenCalled()
  domain.getState().openEndpoint('runtime:env-1')
  domain
    .getState()
    .writer('runtime:env-1')
    .applyTasks([task('runtime:env-1/same-id')])
  expect(mocks.open).toHaveBeenLastCalledWith({ taskId: 'runtime:env-1/same-id' })
  expect(mocks.error).not.toHaveBeenCalled()
})

it('navigates once when opening a waiting task synchronously updates the app store', () => {
  domain.getState().openEndpoint('local')
  setAppState({ runtimeEnvironmentCatalogSettled: false })
  const taskId = 'runtime:env-1/reentrant-task'
  let emitted = false
  mocks.open.mockImplementation((intent?: { taskId?: string }) => {
    if (intent?.taskId === taskId && !emitted) {
      emitted = true
      setAppState({ runtimeEnvironmentCatalogSettled: true })
    }
  })

  openLocalTaskDeepLink(localTaskDeepLink({ endpoint: 'runtime:env-1', taskId: 'reentrant-task' }))
  domain.getState().openEndpoint('runtime:env-1')
  domain
    .getState()
    .writer('runtime:env-1')
    .applyTasks([task(taskId)])

  expect(mocks.open).toHaveBeenCalledTimes(2)
  expect(mocks.open).toHaveBeenLastCalledWith({ taskId })
  expect(mocks.error).not.toHaveBeenCalled()
  expect(mocks.appListeners.size).toBe(0)
  setAppState({ reachable: ['env-1'] })
  expect(mocks.open).toHaveBeenCalledTimes(2)
})

it('cancels the previous waiting link when a newer link arrives', () => {
  domain.getState().openEndpoint('local')
  domain.getState().openEndpoint('runtime:env-1')
  setAppState({ runtimeEnvironmentCatalogSettled: false })
  openLocalTaskDeepLink(localTaskDeepLink({ endpoint: 'runtime:env-2', taskId: 'old' }))
  openLocalTaskDeepLink(localTaskDeepLink({ endpoint: 'runtime:env-1', taskId: 'new' }))
  domain
    .getState()
    .writer('runtime:env-1')
    .applyTasks([task('runtime:env-1/new')])
  setAppState({
    runtimeEnvironmentCatalogSettled: true,
    runtimeEnvironments: [{ id: 'env-2' }],
    reachable: []
  })

  expect(mocks.open).toHaveBeenCalledTimes(3)
  expect(mocks.open).toHaveBeenLastCalledWith({ taskId: 'runtime:env-1/new' })
  expect(mocks.error).not.toHaveBeenCalled()
  expect(mocks.appListeners.size).toBe(0)
})

it('ends a missing paired library after catalog settles without connecting it', () => {
  domain.getState().openEndpoint('local')
  setAppState({ runtimeEnvironmentCatalogSettled: false })
  openLocalTaskDeepLink(localTaskDeepLink({ endpoint: 'runtime:env-2', taskId: 'same-id' }))
  expect(mocks.error).not.toHaveBeenCalled()
  setAppState({ runtimeEnvironmentCatalogSettled: true })
  expect(mocks.error).toHaveBeenCalledOnce()
  expect(mocks.open).toHaveBeenCalledExactlyOnceWith()
})

it('ends a known but disconnected library with no cached partition', () => {
  domain.getState().openEndpoint('local')
  setAppState({ runtimeEnvironments: [{ id: 'env-1' }], reachable: [] })
  openLocalTaskDeepLink(localTaskDeepLink({ endpoint: 'runtime:env-1', taskId: 'same-id' }))
  expect(mocks.error).toHaveBeenCalledOnce()
  expect(mocks.open).toHaveBeenCalledExactlyOnceWith()
  expect(domain.getState().partitions.map((partition) => partition.endpoint)).toEqual(['local'])
})

it('opens only the task from the named library even when own ids collide', () => {
  domain.getState().openEndpoint('local')
  domain.getState().openEndpoint('runtime:env-1')
  domain
    .getState()
    .writer('local')
    .applyTasks([task('same-id')])
  domain
    .getState()
    .writer('runtime:env-1')
    .applyTasks([task('runtime:env-1/same-id')])
  openLocalTaskDeepLink(localTaskDeepLink({ endpoint: 'runtime:env-1', taskId: 'same-id' }))
  expect(mocks.open).toHaveBeenLastCalledWith({ taskId: 'runtime:env-1/same-id' })
})

it('shows a cached disconnected task without retrying or selecting another library', () => {
  domain.getState().openEndpoint('runtime:env-1')
  domain
    .getState()
    .writer('runtime:env-1')
    .applyTasks([task('runtime:env-1/same-id')])
  domain.getState().setEndpointContact('runtime:env-1', false)
  openLocalTaskDeepLink(localTaskDeepLink({ endpoint: 'runtime:env-1', taskId: 'same-id' }))
  expect(mocks.open).toHaveBeenLastCalledWith({ taskId: 'runtime:env-1/same-id' })
  expect(mocks.warning).toHaveBeenCalledOnce()
  expect(
    domain.getState().partitions.find((item) => item.endpoint === 'runtime:env-1')
      ?.subscriptionEpoch
  ).toBe(0)
})

it('does not open a task from a missing paired library', () => {
  domain.getState().openEndpoint('local')
  domain
    .getState()
    .writer('local')
    .applyTasks([task('same-id')])
  openLocalTaskDeepLink(localTaskDeepLink({ endpoint: 'runtime:env-2', taskId: 'same-id' }))
  expect(mocks.open).toHaveBeenCalledExactlyOnceWith()
  expect(mocks.error).toHaveBeenCalledOnce()
})

it('explains a malformed task link without navigating or selecting another task', () => {
  domain.getState().openEndpoint('local')
  domain
    .getState()
    .writer('local')
    .applyTasks([task('same-id')])

  openLocalTaskDeepLink('orca://tasks/v1/local/a%2Fb')

  expect(mocks.error).toHaveBeenCalledExactlyOnceWith(expect.any(String))
  expect(mocks.open).not.toHaveBeenCalled()
})

it('cancels a waiting task link when a malformed task URL arrives', () => {
  domain.getState().openEndpoint('local')
  setAppState({ runtimeEnvironmentCatalogSettled: false })
  openLocalTaskDeepLink(localTaskDeepLink({ endpoint: 'runtime:env-1', taskId: 'old' }))

  openLocalTaskDeepLink('orca://tasks/v1/local/a%2Fb')
  domain.getState().openEndpoint('runtime:env-1')
  domain
    .getState()
    .writer('runtime:env-1')
    .applyTasks([task('runtime:env-1/old')])

  expect(mocks.error).toHaveBeenCalledOnce()
  expect(mocks.open).toHaveBeenCalledExactlyOnceWith()
  expect(mocks.appListeners.size).toBe(0)
})

it('ignores unrelated Orca links without a task error', () => {
  openLocalTaskDeepLink('orca://pair?code=abc')

  expect(mocks.error).not.toHaveBeenCalled()
  expect(mocks.open).not.toHaveBeenCalled()
})
