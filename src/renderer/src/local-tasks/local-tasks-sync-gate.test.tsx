// @vitest-environment happy-dom
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

type AppSnapshot = {
  runtimeEnvironments: { id: string }[]
  runtimeStatusByEnvironmentId: Map<string, unknown>
  activeView: string
  taskPageData: Record<string, unknown>
}

const env = vi.hoisted(() => {
  const listeners = new Set<(state: AppSnapshot, previous: AppSnapshot) => void>()
  let state: AppSnapshot = {
    runtimeEnvironments: [{ id: 'env-1' }, { id: 'env-2' }],
    runtimeStatusByEnvironmentId: new Map(),
    activeView: 'terminal',
    taskPageData: {}
  }
  const opened: unknown[] = []
  const closed: unknown[] = []
  const reads: unknown[] = []
  return {
    reachable: ['env-1', 'env-2'],
    supported: new Set(['env-1']),
    opened,
    closed,
    reads,
    listeners,
    getState: () => state,
    publish: (patch: Partial<AppSnapshot>) => {
      const previous = state
      state = { ...state, ...patch }
      for (const listener of listeners) {
        listener(state, previous)
      }
    }
  }
})
vi.mock('@/store', () => ({
  useAppStore: Object.assign((select: (state: AppSnapshot) => unknown) => select(env.getState()), {
    getState: env.getState,
    setState: () => {},
    subscribe: (listener: (state: AppSnapshot, previous: AppSnapshot) => void) => {
      env.listeners.add(listener)
      return () => env.listeners.delete(listener)
    }
  })
}))
vi.mock('../hooks/ipc-events/runtime-environment-subscription-selection', () => ({
  getReachableRuntimeEnvironmentIds: () => env.reachable
}))
vi.mock('../runtime/runtime-rpc-client', () => ({
  runtimeEnvironmentSupportsCapability: async (environmentId: string) =>
    env.supported.has(environmentId),
  callRuntimeRpc: async (target: unknown) => {
    env.reads.push(target)
    throw new Error('not answered in this test')
  }
}))
vi.mock('../runtime/runtime-rpc-subscribe', () => ({
  subscribeRuntimeRpc: async (target: unknown) => {
    env.opened.push(target)
    return { unsubscribe: () => env.closed.push(target) }
  }
}))
vi.mock('./local-task-page-keys', () => ({ installLocalTaskPageKeyRouter: () => () => {} }))

import { LocalTasksSyncGate } from './LocalTasksSyncGate'
import { localTasksDomainStore, selectLocalTasksPartition } from './local-tasks-domain-store'
import { localTasksSync } from './local-tasks-sync'

afterEach(cleanup)

const SERVER = { kind: 'environment', environmentId: 'env-1' }

it('reads a paired Orca only while it is in contact and advertises the task library', async () => {
  render(<LocalTasksSyncGate />)
  await waitFor(() => expect(env.opened).toContainEqual(SERVER))
  expect(env.opened).toContainEqual({ kind: 'local' })
  // A server without `local-tasks.v1` gets no stream, only the "needs an update" state.
  expect(env.opened).not.toContainEqual({ kind: 'environment', environmentId: 'env-2' })
  await waitFor(() =>
    expect(
      selectLocalTasksPartition(localTasksDomainStore.getState(), 'runtime:env-2')?.connection
    ).toBe('unsupported')
  )

  env.reachable = []
  env.publish({ runtimeStatusByEnvironmentId: new Map() })
  await waitFor(() => expect(env.closed).toContainEqual(SERVER))
  expect(
    selectLocalTasksPartition(localTasksDomainStore.getState(), 'runtime:env-1')?.inContact
  ).toBe(false)

  // Out of contact, even an explicit refresh asks the server nothing.
  env.reads.length = 0
  await localTasksSync.refresh(null, 'runtime:env-1')
  expect(env.reads).toEqual([])
})
