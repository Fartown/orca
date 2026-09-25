import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IssueRouteExecutionHostId } from '../../../shared/issues/types'
import type * as SubscriptionSelection from '../hooks/ipc-events/runtime-environment-subscription-selection'
import type { IssueChangeHandlers } from './issue-change-subscriptions'

type Harness = {
  reachable: string[]
  hold: boolean
  refreshes: string[]
  held: (() => void)[]
  remoteSubscribes: string[]
  remote: Map<string, IssueChangeHandlers>
  local: IssueChangeHandlers | null
  publishStatus: () => void
}

const harness = vi.hoisted((): Harness => ({
  reachable: [],
  hold: false,
  refreshes: [],
  held: [],
  remoteSubscribes: [],
  remote: new Map(),
  local: null,
  publishStatus: () => {}
}))

vi.mock('../store', async () => {
  const { createStore } = await import('zustand/vanilla')
  const store = createStore(() => ({
    runtimeEnvironments: [],
    runtimeStatusByEnvironmentId: new Map(),
    settings: null,
    sshStateByEnvironment: new Map()
  }))
  // A fresh status map is how the real store republishes host status.
  harness.publishStatus = () => store.setState({ runtimeStatusByEnvironmentId: new Map() })
  return { useAppStore: store }
})
vi.mock(
  '../hooks/ipc-events/runtime-environment-subscription-selection',
  async (importOriginal) => ({
    ...(await importOriginal<typeof SubscriptionSelection>()),
    getReachableRuntimeEnvironmentIds: () => [...harness.reachable]
  })
)
vi.mock('./issue-change-subscriptions', () => ({
  subscribeLocalIssueChanges: async (handlers: IssueChangeHandlers) => {
    harness.local = handlers
    return { unsubscribe: () => (harness.local = null) }
  },
  subscribeRemoteIssueChanges: async (environmentId: string, handlers: IssueChangeHandlers) => {
    harness.remoteSubscribes.push(environmentId)
    harness.remote.set(environmentId, handlers)
    return { unsubscribe: () => harness.remote.delete(environmentId) }
  }
}))
vi.mock('./issue-route-refresh', () => ({
  refreshRoute: (route: string) => {
    harness.refreshes.push(route)
    return harness.hold
      ? new Promise<void>((resolve) => harness.held.push(resolve))
      : Promise.resolve()
  }
}))

import { startIssueDomainSync, type IssueDomainSync } from './issue-domain-sync'
import { issueDomainStore } from './issues-domain-store'

const ENV_ROUTE: IssueRouteExecutionHostId = 'runtime:env-a'
let sync: IssueDomainSync

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0)
}
function setReachable(ids: string[]): void {
  harness.reachable = ids
  harness.publishStatus()
}
function routeStatus(route: IssueRouteExecutionHostId): string | undefined {
  return issueDomainStore.getState().partitionsByRouteExecutionHostId[route]?.status
}
function start(routes: IssueRouteExecutionHostId[]): void {
  sync = startIssueDomainSync()
  sync.update({ routes, filter: 'all', issuesVisible: false })
}

beforeEach(() => {
  vi.useFakeTimers()
  issueDomainStore.setState({ partitionsByRouteExecutionHostId: {} })
  Object.assign(harness, {
    reachable: [],
    hold: false,
    refreshes: [],
    held: [],
    remoteSubscribes: [],
    local: null
  })
  harness.remote.clear()
})

afterEach(() => {
  sync.stop()
  vi.useRealTimers()
})

describe('Issue domain sync', () => {
  it('never reads a paired host out of contact, however often its status is republished', async () => {
    start(['local', ENV_ROUTE])
    await settle()
    for (let i = 0; i < 50; i += 1) {
      harness.publishStatus()
      sync.update({ routes: ['local', ENV_ROUTE], filter: 'all', issuesVisible: false })
    }
    await vi.advanceTimersByTimeAsync(60_000)

    expect(harness.refreshes).toEqual(['local'])
    expect(harness.remoteSubscribes).toEqual([])
    expect(routeStatus(ENV_ROUTE)).toBe('offline')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('subscribes once a host is in contact and reads only on ready and its own notices', async () => {
    start([ENV_ROUTE])
    setReachable(['env-a'])
    await settle()
    expect(harness.remoteSubscribes).toEqual(['env-a'])
    expect(harness.refreshes).toEqual([])

    const handlers = harness.remote.get('env-a')!
    handlers.onReady()
    handlers.onChanged(['ssh:behind-the-host'])
    await settle()
    handlers.onChanged(['local'])
    await settle()
    handlers.onChanged(null)
    await vi.advanceTimersByTimeAsync(60_000)

    expect(harness.refreshes).toEqual([ENV_ROUTE, ENV_ROUTE, ENV_ROUTE])
  })

  it('collapses notices landing during a read into one follow-up read', async () => {
    start([ENV_ROUTE])
    setReachable(['env-a'])
    await settle()
    harness.hold = true
    const handlers = harness.remote.get('env-a')!
    handlers.onReady()
    handlers.onChanged(null)
    handlers.onChanged(['local'])
    handlers.onChanged(null)
    expect(harness.refreshes).toHaveLength(1)

    harness.hold = false
    harness.held.shift()!()
    await settle()

    expect(harness.refreshes).toHaveLength(2)
  })

  it('marks a host offline on lost contact and resyncs on the next ready', async () => {
    start([ENV_ROUTE])
    setReachable(['env-a'])
    await settle()
    harness.remote.get('env-a')!.onReady()
    await settle()

    setReachable([])
    await settle()
    expect(routeStatus(ENV_ROUTE)).toBe('offline')
    expect(harness.remote.has('env-a')).toBe(false)

    setReachable(['env-a'])
    await settle()
    expect(harness.remoteSubscribes).toEqual(['env-a', 'env-a'])
    harness.remote.get('env-a')!.onReady()
    await settle()
    expect(harness.refreshes).toEqual([ENV_ROUTE, ENV_ROUTE])
  })

  it('reads a host without the change stream on a timer only while it is in contact', async () => {
    start([ENV_ROUTE])
    setReachable(['env-a'])
    await settle()
    harness.remote.get('env-a')!.onUnsupported()
    await settle()
    expect(harness.refreshes).toEqual([ENV_ROUTE])
    expect(harness.remote.has('env-a')).toBe(false)

    await vi.advanceTimersByTimeAsync(15_000)
    expect(harness.refreshes).toEqual([ENV_ROUTE, ENV_ROUTE])

    setReachable([])
    await vi.advanceTimersByTimeAsync(60_000)
    expect(harness.refreshes).toHaveLength(2)

    // An upgraded host may come back, so the stream is probed again after reconnect.
    setReachable(['env-a'])
    await settle()
    expect(harness.remoteSubscribes).toEqual(['env-a', 'env-a'])
  })

  it('reads local and SSH partitions from the local stream and on filter changes', async () => {
    start(['local', 'ssh:target-a'])
    await settle()
    expect(harness.refreshes).toEqual(['local', 'ssh:target-a'])

    harness.local!.onChanged(['ssh:target-a'])
    await settle()
    expect(harness.refreshes.slice(2)).toEqual(['ssh:target-a'])

    sync.update({ routes: ['local', 'ssh:target-a'], filter: 'needs-me', issuesVisible: true })
    await settle()
    expect(harness.refreshes.slice(3)).toEqual(['local', 'ssh:target-a'])
    expect(vi.getTimerCount()).toBe(0)
  })
})
