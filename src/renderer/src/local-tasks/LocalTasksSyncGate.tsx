import { useEffect } from 'react'
import { RecoverableRenderErrorBoundary } from '@/components/error-boundaries/RecoverableRenderErrorBoundary'
import { isWebClientLocation } from '@/lib/web-client-location'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { getRuntimeEnvironmentConnectionGeneration } from '@/store/slices/runtime-status-connection-generation'
import { createRuntimeClientEventsSync } from '../hooks/runtime-client-events-sync'
import { getReachableRuntimeEnvironmentIds } from '../hooks/ipc-events/runtime-environment-subscription-selection'
import { getRuntimeEnvironmentRevision } from '../runtime/runtime-environment-revision'
import { runtimeEnvironmentSupportsCapability } from '../runtime/runtime-rpc-client'
import { subscribeRuntimeRpc } from '../runtime/runtime-rpc-subscribe'
import { LOCAL_TASKS_RUNTIME_CAPABILITY } from '../../../shared/local-tasks/local-tasks-capability'
import {
  SELF_LOCAL_TASK_ENDPOINT,
  localTaskEndpointEnvironmentId,
  localTaskEnvironmentEndpoint
} from './local-task-endpoints'
import {
  localTasksDomainStore,
  selectLocalTasksPartition,
  useLocalTasksDomain
} from './local-tasks-domain-store'
import { localTasksReportProjects } from './local-tasks-partition'
import { closeLocalTasksSync, localTasksSyncFor } from './local-tasks-sync'
import { localTaskLibraryViewerStore } from './local-task-library-viewers'
import { subscribeLocalTaskAppStore } from './local-task-app-store-subscription'
import { installLocalTaskPageKeyRouter } from './local-task-page-keys'
import { bindLocalTaskSourceActivation } from './local-task-source-activation'
import { bindLocalTaskViewPreferences } from './local-task-view-preferences'
import { localTaskPageStore } from './local-task-page-store'

const NO_STREAM = { unsubscribe: () => {} }

/** This app's own library: one stream that stays closed until the user retries. */
function useSelfLibraryStream(): void {
  const epoch = useLocalTasksDomain(
    (state) => selectLocalTasksPartition(state, SELF_LOCAL_TASK_ENDPOINT)?.subscriptionEpoch ?? 0
  )
  useEffect(() => {
    // Why: a browser client has no runtime of its own; its library is the paired host's.
    if (isWebClientLocation()) {
      return
    }
    let disposed = false
    let handle: { unsubscribe: () => void } | null = null
    const sync = localTasksSyncFor(SELF_LOCAL_TASK_ENDPOINT)
    const writer = localTasksDomainStore.getState().writer(SELF_LOCAL_TASK_ENDPOINT)
    writer.setConnection('connecting')
    void subscribeRuntimeRpc({ kind: 'local' }, 'localTasks.subscribeChanges', null, {
      onEvent: (frame) => {
        if (!disposed) {
          sync.receive(frame)
        }
      },
      onError: (error) => {
        if (!disposed) {
          sync.fail(error)
        }
      },
      onClose: () => {
        if (!disposed) {
          writer.setConnection('ended')
        }
      }
    }).then(
      (opened) => {
        if (disposed) {
          opened.unsubscribe()
        } else {
          handle = opened
        }
      },
      (error: unknown) => {
        if (!disposed) {
          sync.fail(error)
        }
      }
    )
    return () => {
      disposed = true
      handle?.unsubscribe()
    }
  }, [epoch])
}

function pairedPartition(environmentId: string) {
  return selectLocalTasksPartition(
    localTasksDomainStore.getState(),
    localTaskEnvironmentEndpoint(environmentId)
  )
}

/**
 * Whether a paired library gets a change stream (D6): while it holds a project, or while a surface
 * that can add one is on screen. Otherwise only its status is read, each time the subscription is
 * made again: on returning to contact, and when that demand changes (opening the Local page or
 * Settings → Local Tasks, leaving them after adding a project here). A project made elsewhere
 * meanwhile shows up at the next of those. A browser client's paired library is its own.
 */
function pairedLibraryStreamed(environmentId: string): boolean {
  if (isWebClientLocation() || localTaskLibraryViewerStore.getState().viewers > 0) {
    return true
  }
  const partition = pairedPartition(environmentId)
  return localTasksReportProjects(partition) || (partition?.projects.length ?? 0) > 0
}

function pairedSubscriptionKey(environmentId: string): string {
  const epoch = pairedPartition(environmentId)?.subscriptionEpoch ?? 0
  const mode = pairedLibraryStreamed(environmentId) ? 'stream' : 'status'
  return `${getRuntimeEnvironmentConnectionGeneration(environmentId)}:${getRuntimeEnvironmentRevision(environmentId) ?? 'unknown'}:${epoch}:${mode}`
}

function hostContactEpoch(state: AppState, environmentId: string): number {
  return state.runtimeStatusByEnvironmentId.get(environmentId)?.hostContactEpoch ?? 0
}

/**
 * Paired Orcas' libraries (D-008): one subscription per environment the shared connection layer has
 * in contact and that advertises `local-tasks.v1`. Leaving contact keeps what was read, marked
 * unverifiable; the next `ready` (or status read) after contact returns re-reads everything. Never
 * probes, retries or reconnects on its own.
 */
function bindPairedLibraryStreams(): () => void {
  // A failed subscribe waits for the shared layer's "host is back" edge, not for a timer: the
  // contact epoch it failed under, and the epoch last folded into each key. A same-runtime return
  // moves only `hostContactEpoch`, not the connection generation or the pairing revision.
  const failedUnderContact = new Map<string, number>()
  const contactMarks = new Map<string, number>()
  const subscriptionKey = (environmentId: string): string =>
    `${pairedSubscriptionKey(environmentId)}:${contactMarks.get(environmentId) ?? 0}`

  const events = createRuntimeClientEventsSync({
    getDesiredEnvironmentIds: () => getReachableRuntimeEnvironmentIds(useAppStore.getState()),
    getSubscriptionKey: subscriptionKey,
    subscribe: async (environmentId, _onEvent, onError, isCurrent) => {
      failedUnderContact.delete(environmentId)
      const endpoint = localTaskEnvironmentEndpoint(environmentId)
      const sync = localTasksSyncFor(endpoint)
      const writer = localTasksDomainStore.getState().writer(endpoint)
      const streamed = pairedLibraryStreamed(environmentId)
      writer.setConnection(streamed ? 'connecting' : 'idle')
      try {
        if (
          !(await runtimeEnvironmentSupportsCapability(
            environmentId,
            LOCAL_TASKS_RUNTIME_CAPABILITY
          ))
        ) {
          if (isCurrent()) {
            writer.setConnection('unsupported')
          }
          return NO_STREAM
        }
        if (!streamed) {
          if (isCurrent()) {
            await sync.readStatus()
          }
          return NO_STREAM
        }
        return await subscribeRuntimeRpc(
          { kind: 'environment', environmentId },
          'localTasks.subscribeChanges',
          null,
          {
            onEvent: (frame) => {
              if (isCurrent()) {
                sync.receive(frame)
              }
            },
            onError: (error) => {
              if (isCurrent()) {
                sync.fail(error)
              }
              onError(error)
            },
            onClose: () => {
              if (isCurrent()) {
                writer.setConnection('ended')
              }
            }
          }
        )
      } catch (error) {
        // Why not rethrown: the shared layer would re-probe on its backoff timer while nothing
        // changed. What was read stays, unconfirmed; the user's Retry or regained contact goes next.
        if (isCurrent()) {
          failedUnderContact.set(
            environmentId,
            hostContactEpoch(useAppStore.getState(), environmentId)
          )
          sync.fail(error)
        }
        return NO_STREAM
      }
    },
    // Why unused: frames go straight to the library's sync, guarded by `isCurrent`.
    onEvent: () => {}
  })

  const reconcile = (state: AppState): void => {
    const reachable = new Set(getReachableRuntimeEnvironmentIds(state))
    const paired = new Set((state.runtimeEnvironments ?? []).map((environment) => environment.id))
    for (const environmentId of reachable) {
      localTasksSyncFor(localTaskEnvironmentEndpoint(environmentId))
    }
    for (const [environmentId, epoch] of failedUnderContact) {
      const current = hostContactEpoch(state, environmentId)
      if (current !== epoch) {
        failedUnderContact.delete(environmentId)
        contactMarks.set(environmentId, current)
      }
    }
    for (const partition of localTasksDomainStore.getState().partitions) {
      const environmentId = localTaskEndpointEnvironmentId(partition.endpoint)
      if (environmentId === null) {
        continue
      }
      if (!paired.has(environmentId) && !reachable.has(environmentId)) {
        failedUnderContact.delete(environmentId)
        contactMarks.delete(environmentId)
        closeLocalTasksSync(partition.endpoint)
        continue
      }
      localTasksDomainStore
        .getState()
        .setEndpointContact(partition.endpoint, reachable.has(environmentId))
    }
    events.sync()
  }

  let previous = useAppStore.getState()
  reconcile(previous)
  const stopApp = subscribeLocalTaskAppStore('paired library contact', (state) => {
    if (
      state.runtimeStatusByEnvironmentId === previous.runtimeStatusByEnvironmentId &&
      state.runtimeEnvironments === previous.runtimeEnvironments
    ) {
      return
    }
    previous = state
    reconcile(state)
  })
  const demand = (): string =>
    localTasksDomainStore
      .getState()
      .partitions.map((partition) => {
        const environmentId = localTaskEndpointEnvironmentId(partition.endpoint)
        return environmentId === null
          ? `${partition.endpoint}:${partition.subscriptionEpoch}`
          : `${partition.endpoint}:${subscriptionKey(environmentId)}`
      })
      .join('\n')
  let previousDemand = demand()
  // Why: a retry bumps the epoch, and a project count or list decides stream or status alone.
  const stopDomain = localTasksDomainStore.subscribe(() => {
    const next = demand()
    if (next !== previousDemand) {
      previousDemand = next
      events.sync()
    }
  })
  const stopViewers = localTaskLibraryViewerStore.subscribe(() => events.sync())
  return () => {
    stopApp()
    stopDomain()
    stopViewers()
    events.stop()
  }
}

/** Holds every task library this window reads; reads follow each host's notices only. */
function LocalTasksLibraries(): null {
  useEffect(() => installLocalTaskPageKeyRouter(), [])
  useEffect(() => bindLocalTaskSourceActivation(), [])
  useEffect(() => bindLocalTaskViewPreferences(), [])
  useEffect(
    () =>
      subscribeLocalTaskAppStore('leaving the task page', (state, previous) => {
        if (previous.activeView === 'tasks' && state.activeView !== 'tasks') {
          localTaskPageStore.getState().clearTransientUi()
        }
      }),
    []
  )
  useSelfLibraryStream()
  useEffect(() => bindPairedLibraryStreams(), [])
  return null
}

/** A failure here costs the task libraries only, never the rest of the window. */
export function LocalTasksSyncGate(): React.JSX.Element {
  return (
    <RecoverableRenderErrorBoundary
      boundaryId="local-tasks.sync-gate"
      surface="overlay"
      fallback={() => null}
    >
      <LocalTasksLibraries />
    </RecoverableRenderErrorBoundary>
  )
}
