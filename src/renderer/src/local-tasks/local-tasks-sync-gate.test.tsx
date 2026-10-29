// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

type AppSnapshot = {
  runtimeEnvironments: { id: string }[]
  runtimeStatusByEnvironmentId: Map<string, unknown>
  activeView: string
  taskPageData: Record<string, unknown>
}

const env = vi.hoisted(() => {
  const connected = { status: { graphStatus: 'ready' } }
  const listeners = new Set<(state: AppSnapshot, previous: AppSnapshot) => void>()
  let state: AppSnapshot = {
    runtimeEnvironments: [{ id: 'env-1' }, { id: 'env-2' }],
    runtimeStatusByEnvironmentId: new Map([
      ['env-1', connected],
      ['env-2', connected]
    ]),
    activeView: 'terminal',
    taskPageData: {}
  }
  const capabilityChecks: string[] = []
  const opened: unknown[] = []
  const closed: unknown[] = []
  const reads: { target: unknown; method: string }[] = []
  return {
    connected,
    // Capability probes (a `status.get` when uncached) that fail for these environments.
    probeFails: new Set<string>(),
    supported: new Set(['env-1', 'env-3', 'env-4']),
    projectCounts: new Map<string, number>([['env-1', 2]]),
    capabilityChecks,
    opened,
    closed,
    reads,
    keyRouterThrows: false,
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
  getReachableRuntimeEnvironmentIds: (state: AppSnapshot) => [
    ...state.runtimeStatusByEnvironmentId.keys()
  ]
}))
vi.mock('../runtime/runtime-rpc-client', () => ({
  runtimeEnvironmentSupportsCapability: async (environmentId: string) => {
    env.capabilityChecks.push(environmentId)
    if (env.probeFails.has(environmentId)) {
      throw new Error('status.get failed: runtime unavailable')
    }
    return env.supported.has(environmentId)
  },
  callRuntimeRpc: async (target: { environmentId?: string }, method: string) => {
    env.reads.push({ target, method })
    if (method === 'localTasks.status' && target.environmentId) {
      return {
        taskHost: true,
        state: 'ready',
        reason: null,
        revision: 1,
        taskHostId: null,
        projectCount: env.projectCounts.get(target.environmentId) ?? 0
      }
    }
    throw new Error('not answered in this test')
  }
}))
vi.mock('../runtime/runtime-rpc-subscribe', () => ({
  subscribeRuntimeRpc: async (target: unknown) => {
    env.opened.push(target)
    return { unsubscribe: () => env.closed.push(target) }
  }
}))
vi.mock('./local-task-page-keys', () => ({
  installLocalTaskPageKeyRouter: () => {
    if (env.keyRouterThrows) {
      throw new Error('key router failed')
    }
    return () => {}
  }
}))

import { LocalTasksSyncGate } from './LocalTasksSyncGate'
import { localTasksDomainStore, selectLocalTasksPartition } from './local-tasks-domain-store'
import { localTasksSync } from './local-tasks-sync'
import { useLocalTaskLibraryViewer } from './local-task-library-viewers'
import { localTaskPageStore } from './local-task-page-store'

afterEach(cleanup)

const SERVER = { kind: 'environment', environmentId: 'env-1' }

function connection(environmentId: string): string | undefined {
  return selectLocalTasksPartition(localTasksDomainStore.getState(), `runtime:${environmentId}`)
    ?.connection
}

function environmentOf(target: unknown): string | undefined {
  return typeof target === 'object' &&
    target !== null &&
    'environmentId' in target &&
    typeof target.environmentId === 'string'
    ? target.environmentId
    : undefined
}

function readsOf(environmentId: string, method: string): number {
  return env.reads.filter(
    (read) => environmentOf(read.target) === environmentId && read.method === method
  ).length
}

function LibraryViewer(): null {
  useLocalTaskLibraryViewer()
  return null
}

it('reads a paired Orca only while it is in contact and advertises the task library', async () => {
  render(<LocalTasksSyncGate />)
  await waitFor(() => expect(env.opened).toContainEqual(SERVER))
  expect(env.opened).toContainEqual({ kind: 'local' })
  // A server without `local-tasks.v1` gets no stream, only the "needs an update" state.
  expect(env.opened).not.toContainEqual({ kind: 'environment', environmentId: 'env-2' })
  await waitFor(() => expect(connection('env-2')).toBe('unsupported'))

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

function probesOf(environmentId: string): number {
  return env.capabilityChecks.filter((id) => id === environmentId).length
}

it('asks a paired Orca nothing more after its probe fails while the shared state stands', async () => {
  vi.useFakeTimers()
  try {
    env.probeFails.add('env-3')
    env.publish({
      runtimeEnvironments: [{ id: 'env-3' }],
      runtimeStatusByEnvironmentId: new Map([['env-3', env.connected]])
    })
    render(<LocalTasksSyncGate />)
    await vi.advanceTimersByTimeAsync(60_000)
    // A status write that leaves the host's contact as it was is not a reason to ask again.
    env.publish({ runtimeStatusByEnvironmentId: new Map([['env-3', { ...env.connected }]]) })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(probesOf('env-3')).toBe(1)
    expect(connection('env-3')).toBe('failed')
  } finally {
    env.probeFails.delete('env-3')
    vi.useRealTimers()
  }
})

it('reads once more when the shared layer sees the host answer again', async () => {
  vi.useFakeTimers()
  try {
    env.probeFails.add('env-5')
    env.supported.add('env-5')
    env.publish({
      runtimeEnvironments: [{ id: 'env-5' }],
      runtimeStatusByEnvironmentId: new Map([['env-5', env.connected]])
    })
    render(<LocalTasksSyncGate />)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(probesOf('env-5')).toBe(1)

    // A same-runtime return moves only the host contact epoch.
    env.probeFails.delete('env-5')
    env.publish({
      runtimeStatusByEnvironmentId: new Map([['env-5', { ...env.connected, hostContactEpoch: 1 }]])
    })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(probesOf('env-5')).toBe(2)
    expect(readsOf('env-5', 'localTasks.status')).toBe(1)
  } finally {
    vi.useRealTimers()
  }
})

it('streams a paired library with no project only while a surface that can add one is open', async () => {
  env.publish({
    runtimeEnvironments: [{ id: 'env-4' }],
    runtimeStatusByEnvironmentId: new Map([['env-4', env.connected]])
  })
  const stream = { kind: 'environment', environmentId: 'env-4' }
  render(<LocalTasksSyncGate />)
  await waitFor(() => expect(readsOf('env-4', 'localTasks.status')).toBe(1))
  expect(connection('env-4')).toBe('idle')
  expect(env.opened).not.toContainEqual(stream)

  const viewer = render(<LibraryViewer />)
  await waitFor(() => expect(env.opened).toContainEqual(stream))
  viewer.unmount()
  await waitFor(() => expect(env.closed).toContainEqual(stream))
  await waitFor(() => expect(readsOf('env-4', 'localTasks.status')).toBe(2))
  expect(connection('env-4')).toBe('idle')

  // A first project made elsewhere is learned when the host comes back into contact.
  env.projectCounts.set('env-4', 1)
  env.publish({ runtimeStatusByEnvironmentId: new Map() })
  env.publish({ runtimeStatusByEnvironmentId: new Map([['env-4', env.connected]]) })
  await waitFor(() =>
    expect(env.opened.filter((target) => environmentOf(target) === 'env-4')).toHaveLength(2)
  )
  expect(connection('env-4')).toBe('connecting')
})

it('fails alone: a throwing app store listener still lets later listeners hear', () => {
  render(<LocalTasksSyncGate />)
  const later = vi.fn()
  env.listeners.add(later)
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  localTaskPageStore.setState({
    clearTransientUi: () => {
      throw new Error('page store broke')
    }
  })
  env.publish({ activeView: 'tasks' })
  env.publish({ activeView: 'terminal' })
  expect(later).toHaveBeenCalledTimes(2)
  expect(consoleError).toHaveBeenCalled()
  env.listeners.delete(later)
  consoleError.mockRestore()
})

it('keeps the window up when the gate itself throws', () => {
  env.keyRouterThrows = true
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  render(
    <>
      <LocalTasksSyncGate />
      <p>workspace</p>
    </>
  )
  expect(screen.getByText('workspace')).toBeTruthy()
  env.keyRouterThrows = false
  consoleError.mockRestore()
})
