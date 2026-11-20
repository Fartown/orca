// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/store', async () => {
  const { createTestStore } = await import('@/store/testing/app-store-test-fixture')
  return { useAppStore: createTestStore() }
})
import { useAppStore } from '@/store'
import { localTasksDomainStore } from './local-tasks-domain-store'
import {
  applyLocalTaskDispatcherPreferences,
  bindLocalTaskDispatcherSourceContact,
  getLocalTaskDispatcherEpoch,
  getLocalTaskDispatcherPreferences,
  isLocalTaskDispatcherSourceCurrent,
  localTaskDispatcherStore,
  selectLocalTaskDispatcherEndpoint
} from './local-task-dispatcher-source'

function contact(connected: boolean): void {
  useAppStore.setState({
    runtimeStatusByEnvironmentId: connected
      ? new Map([
          [
            'mini',
            {
              checkedAt: 1,
              status: {
                runtimeId: 'mini-runtime',
                rendererGraphEpoch: 1,
                graphStatus: 'ready',
                authoritativeWindowId: 1,
                liveTabCount: 1,
                liveLeafCount: 1
              }
            }
          ]
        ])
      : new Map()
  })
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true)
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState(), true)
  localTaskDispatcherStore.setState(localTaskDispatcherStore.getInitialState(), true)
})

it('invalidates outstanding work across a shared disconnect and reconnect without reading hosts', () => {
  contact(true)
  selectLocalTaskDispatcherEndpoint('runtime:mini')
  const epoch = getLocalTaskDispatcherEpoch()
  const dispose = bindLocalTaskDispatcherSourceContact()
  expect(isLocalTaskDispatcherSourceCurrent('runtime:mini', epoch)).toBe(true)
  contact(false)
  expect(getLocalTaskDispatcherEpoch()).toBeGreaterThan(epoch)
  expect(isLocalTaskDispatcherSourceCurrent('runtime:mini', epoch)).toBe(false)
  contact(true)
  expect(isLocalTaskDispatcherSourceCurrent('runtime:mini', epoch)).toBe(false)
  expect(isLocalTaskDispatcherSourceCurrent('runtime:mini', getLocalTaskDispatcherEpoch())).toBe(
    true
  )
  dispose()
})

it('keeps same-key preferences in separate source libraries and clears optimistic pane identity on selection', () => {
  applyLocalTaskDispatcherPreferences('runtime:mini', {
    'dispatcher.paneKey': 'mini-pane',
    'dispatcher.wake': '0'
  })
  applyLocalTaskDispatcherPreferences('runtime:ssh', { 'dispatcher.paneKey': 'ssh-pane' })
  selectLocalTaskDispatcherEndpoint('runtime:mini')
  localTaskDispatcherStore.setState({
    paneKey: 'optimistic-mini',
    worktreeId: 'mini-folder',
    opening: true
  })
  const epoch = getLocalTaskDispatcherEpoch()
  selectLocalTaskDispatcherEndpoint('runtime:ssh')
  expect(localTaskDispatcherStore.getState()).toMatchObject({
    paneKey: null,
    worktreeId: null,
    opening: false
  })
  expect(getLocalTaskDispatcherEpoch()).toBeGreaterThan(epoch)
  expect(getLocalTaskDispatcherPreferences()['dispatcher.paneKey']).toBe('ssh-pane')
  expect(getLocalTaskDispatcherPreferences('runtime:mini')['dispatcher.wake']).toBe('0')
})
