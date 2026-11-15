import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { localTaskDeepLink } from '../../../shared/local-tasks/local-task-deep-link'
import type * as LocalTasksDomainModule from './local-tasks-domain-store'

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  appState: {
    runtimeEnvironmentCatalogSettled: true,
    runtimeEnvironments: [] as { id: string }[],
    reachable: [] as string[]
  },
  appListeners: new Set<(state: unknown, previous: unknown) => void>(),
  domain: null as ReturnType<typeof LocalTasksDomainModule.createLocalTasksDomainStore> | null
}))
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => mocks.appState,
    subscribe: (listener: (state: unknown, previous: unknown) => void) => {
      mocks.appListeners.add(listener)
      return () => mocks.appListeners.delete(listener)
    }
  }
}))
vi.mock('@/hooks/ipc-events/runtime-environment-subscription-selection', () => ({
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
    .applyTasks([{ id: 'runtime:env-1/same-id' } as never])
  expect(mocks.open).toHaveBeenLastCalledWith({ taskId: 'runtime:env-1/same-id' })
  expect(mocks.error).not.toHaveBeenCalled()
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
    .applyTasks([{ id: 'same-id' } as never])
  domain
    .getState()
    .writer('runtime:env-1')
    .applyTasks([{ id: 'runtime:env-1/same-id' } as never])
  openLocalTaskDeepLink(localTaskDeepLink({ endpoint: 'runtime:env-1', taskId: 'same-id' }))
  expect(mocks.open).toHaveBeenLastCalledWith({ taskId: 'runtime:env-1/same-id' })
})

it('shows a cached disconnected task without retrying or selecting another library', () => {
  domain.getState().openEndpoint('runtime:env-1')
  domain
    .getState()
    .writer('runtime:env-1')
    .applyTasks([{ id: 'runtime:env-1/same-id' } as never])
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
    .applyTasks([{ id: 'same-id' } as never])
  openLocalTaskDeepLink(localTaskDeepLink({ endpoint: 'runtime:env-2', taskId: 'same-id' }))
  expect(mocks.open).toHaveBeenCalledExactlyOnceWith()
  expect(mocks.error).toHaveBeenCalledOnce()
})
