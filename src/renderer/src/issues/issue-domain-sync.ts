import { parseExecutionHostId, toRuntimeExecutionHostId } from '../../../shared/execution-host'
import type { IssueListFilter, IssueRouteExecutionHostId } from '../../../shared/issues/types'
import { useAppStore } from '../store'
import {
  buildRuntimeClientEventEnvironmentKey,
  createRuntimeEnvironmentStoreSyncSubscriber,
  getReachableRuntimeEnvironmentIds,
  type RuntimeEnvironmentStoreSyncState
} from '../hooks/ipc-events/runtime-environment-subscription-selection'
import { createRuntimeClientEventsSync } from '../hooks/runtime-client-events-sync'
import {
  subscribeLocalIssueChanges,
  subscribeRemoteIssueChanges,
  type IssueChangeSubscription
} from './issue-change-subscriptions'
import { refreshRoute, type IssueRefreshSequenceRef } from './issue-route-refresh'
import { issueDomainStore } from './issues-domain-store'

// Only hosts that predate the change stream are read on a timer, and only while reachable.
const LEGACY_VISIBLE_POLL_MS = 5_000
const LEGACY_HIDDEN_POLL_MS = 15_000

export type IssueDomainSyncInput = {
  routes: readonly IssueRouteExecutionHostId[]
  filter: IssueListFilter
  issuesVisible: boolean
}

export type IssueDomainSync = {
  update: (input: IssueDomainSyncInput) => void
  stop: () => void
}

function environmentIdForRoute(route: IssueRouteExecutionHostId): string | null {
  const parsed = parseExecutionHostId(route)
  return parsed?.kind === 'runtime' ? parsed.environmentId : null
}

/**
 * Reads Issue partitions when their host announces a change, instead of polling every host.
 * Local and SSH partitions live in this app's own host; a paired runtime is read only while
 * the shared runtime status says it is in contact, so an unreachable host costs no requests.
 */
export function startIssueDomainSync(): IssueDomainSync {
  let routes = new Set<IssueRouteExecutionHostId>()
  let filter: IssueListFilter | null = null
  let issuesVisible = false
  let stopped = false
  let localSupportsChanges = true
  let localSubscription: IssueChangeSubscription | null = null
  let legacyTimer: ReturnType<typeof setInterval> | null = null
  const legacyRoutes = new Set<IssueRouteExecutionHostId>()
  const sequences = new Map<IssueRouteExecutionHostId, IssueRefreshSequenceRef>()
  const inFlight = new Set<IssueRouteExecutionHostId>()
  const dirty = new Set<IssueRouteExecutionHostId>()

  const sequenceFor = (route: IssueRouteExecutionHostId): IssueRefreshSequenceRef => {
    let sequence = sequences.get(route)
    if (!sequence) {
      sequence = { current: 0 }
      sequences.set(route, sequence)
    }
    return sequence
  }
  const reachableEnvironmentIds = (): Set<string> =>
    new Set(getReachableRuntimeEnvironmentIds(useAppStore.getState()))
  const isReachable = (route: IssueRouteExecutionHostId): boolean => {
    const environmentId = environmentIdForRoute(route)
    return environmentId === null || reachableEnvironmentIds().has(environmentId)
  }

  const markOffline = (route: IssueRouteExecutionHostId): void => {
    if (!routes.has(route)) {
      return
    }
    // Drop any read that was in flight when contact was lost.
    sequenceFor(route).current += 1
    issueDomainStore.getState().setRouteStatus(route, 'offline')
  }

  const refresh = (route: IssueRouteExecutionHostId): void => {
    if (stopped || !routes.has(route) || filter === null) {
      return
    }
    if (!isReachable(route)) {
      markOffline(route)
      return
    }
    // One read per route at a time; notices landing meanwhile collapse into one follow-up.
    if (inFlight.has(route)) {
      dirty.add(route)
      return
    }
    inFlight.add(route)
    const sequenceRef = sequenceFor(route)
    const sequence = ++sequenceRef.current
    void refreshRoute(route, filter, issuesVisible, sequence, sequenceRef).finally(() => {
      inFlight.delete(route)
      if (dirty.delete(route)) {
        refresh(route)
      }
    })
  }

  const refreshLocallyServed = (hostPartitionKeys: string[] | null = null): void => {
    for (const route of routes) {
      if (
        environmentIdForRoute(route) === null &&
        (hostPartitionKeys === null || hostPartitionKeys.includes(route))
      ) {
        refresh(route)
      }
    }
  }

  const desiredEnvironmentIds = (
    state: RuntimeEnvironmentStoreSyncState = useAppStore.getState()
  ): string[] =>
    getReachableRuntimeEnvironmentIds(state).filter((environmentId) => {
      const route = toRuntimeExecutionHostId(environmentId)
      return routes.has(route) && !legacyRoutes.has(route)
    })

  const scheduleLegacyPolling = (): void => {
    if (legacyTimer) {
      clearInterval(legacyTimer)
      legacyTimer = null
    }
    if (stopped || (legacyRoutes.size === 0 && localSupportsChanges)) {
      return
    }
    legacyTimer = setInterval(
      () => {
        for (const route of routes) {
          const onDemand =
            legacyRoutes.has(route) ||
            (!localSupportsChanges && environmentIdForRoute(route) === null)
          if (onDemand && isReachable(route)) {
            refresh(route)
          }
        }
      },
      issuesVisible ? LEGACY_VISIBLE_POLL_MS : LEGACY_HIDDEN_POLL_MS
    )
  }

  const remoteSync = createRuntimeClientEventsSync({
    getDesiredEnvironmentIds: () => desiredEnvironmentIds(),
    getSubscriptionKey: (environmentId) => buildRuntimeClientEventEnvironmentKey([environmentId]),
    subscribe: (environmentId) => {
      const route = toRuntimeExecutionHostId(environmentId)
      return subscribeRemoteIssueChanges(environmentId, {
        onReady: () => refresh(route),
        // A paired host serves only its own partition; it refuses a second SSH hop.
        onChanged: (hostPartitionKeys) => {
          if (hostPartitionKeys === null || hostPartitionKeys.includes('local')) {
            refresh(route)
          }
        },
        onUnsupported: () => {
          legacyRoutes.add(route)
          refresh(route)
          remoteSync.sync()
          scheduleLegacyPolling()
        }
      })
    },
    // Issue notices reach the handlers bound in subscribe; this shared-event hook stays unused.
    onEvent: () => {}
  })

  const storeSubscriber = createRuntimeEnvironmentStoreSyncSubscriber({
    initialDesiredEnvironmentIds: desiredEnvironmentIds(),
    initialReachableEnvironmentIds: getReachableRuntimeEnvironmentIds(useAppStore.getState()),
    buildEnvironmentKey: buildRuntimeClientEventEnvironmentKey,
    getDesiredEnvironmentIds: desiredEnvironmentIds,
    getReachableEnvironmentIds: getReachableRuntimeEnvironmentIds,
    // Subscribed hosts resync on their ready message; only on-demand hosts need a read here.
    requestProjectRefresh: (environmentId) => {
      const route = toRuntimeExecutionHostId(environmentId)
      if (legacyRoutes.has(route)) {
        refresh(route)
      }
    },
    // Why: the shared subscriber's lost-contact edge. An upgraded host may come back, so the
    // legacy verdict is re-probed after reconnect.
    markEnvironmentSshStateStale: (environmentId) => {
      const route = toRuntimeExecutionHostId(environmentId)
      legacyRoutes.delete(route)
      markOffline(route)
    },
    sync: remoteSync.sync
  })
  const unsubscribeStore = useAppStore.subscribe(storeSubscriber)

  void subscribeLocalIssueChanges({
    onReady: () => refreshLocallyServed(),
    onChanged: (hostPartitionKeys) => refreshLocallyServed(hostPartitionKeys),
    onUnsupported: () => {
      localSupportsChanges = false
      refreshLocallyServed()
      scheduleLegacyPolling()
    }
  })
    .then((subscription) => {
      if (stopped) {
        subscription.unsubscribe()
      } else {
        localSubscription = subscription
      }
    })
    .catch((error) => {
      console.warn('[issues] local change stream unavailable:', error)
      localSupportsChanges = false
      scheduleLegacyPolling()
    })

  return {
    update: (input) => {
      const firstUpdate = filter === null
      const settingsChanged = input.filter !== filter || input.issuesVisible !== issuesVisible
      const added = input.routes.filter((route) => !routes.has(route))
      for (const route of routes) {
        if (!input.routes.includes(route)) {
          sequenceFor(route).current += 1
          legacyRoutes.delete(route)
        }
      }
      routes = new Set(input.routes)
      filter = input.filter
      issuesVisible = input.issuesVisible
      remoteSync.sync()
      scheduleLegacyPolling()
      for (const route of settingsChanged && !firstUpdate ? routes : added) {
        refresh(route)
      }
    },
    stop: () => {
      stopped = true
      unsubscribeStore()
      remoteSync.stop()
      localSubscription?.unsubscribe()
      localSubscription = null
      if (legacyTimer) {
        clearInterval(legacyTimer)
        legacyTimer = null
      }
      for (const sequence of sequences.values()) {
        sequence.current += 1
      }
    }
  }
}
