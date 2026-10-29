import { useEffect } from 'react'
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
import { closeLocalTasksSync, localTasksSyncFor } from './local-tasks-sync'
import { installLocalTaskPageKeyRouter } from './local-task-page-keys'
import { bindLocalTaskSourceActivation } from './local-task-source-activation'
import { bindLocalTaskViewPreferences } from './local-task-view-preferences'
import { localTaskPageStore } from './local-task-page-store'

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

function environmentEpoch(environmentId: string): number {
  return (
    selectLocalTasksPartition(
      localTasksDomainStore.getState(),
      localTaskEnvironmentEndpoint(environmentId)
    )?.subscriptionEpoch ?? 0
  )
}

/**
 * Paired Orcas' libraries (D-008): one stream per environment the shared connection layer has in
 * contact and that advertises `local-tasks.v1`. Leaving contact keeps what was read, marked
 * unverifiable; the next `ready` after contact returns re-reads everything. Never probes or
 * reconnects on its own.
 */
function bindPairedLibraryStreams(): () => void {
  const events = createRuntimeClientEventsSync({
    getDesiredEnvironmentIds: () => getReachableRuntimeEnvironmentIds(useAppStore.getState()),
    getSubscriptionKey: (environmentId) =>
      `${getRuntimeEnvironmentConnectionGeneration(environmentId)}:${getRuntimeEnvironmentRevision(environmentId) ?? 'unknown'}:${environmentEpoch(environmentId)}`,
    subscribe: async (environmentId, _onEvent, onError, isCurrent) => {
      const endpoint = localTaskEnvironmentEndpoint(environmentId)
      const sync = localTasksSyncFor(endpoint)
      const writer = localTasksDomainStore.getState().writer(endpoint)
      writer.setConnection('connecting')
      if (
        !(await runtimeEnvironmentSupportsCapability(environmentId, LOCAL_TASKS_RUNTIME_CAPABILITY))
      ) {
        if (isCurrent()) {
          writer.setConnection('unsupported')
        }
        return { unsubscribe: () => {} }
      }
      return subscribeRuntimeRpc(
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
    for (const partition of localTasksDomainStore.getState().partitions) {
      const environmentId = localTaskEndpointEnvironmentId(partition.endpoint)
      if (environmentId === null) {
        continue
      }
      if (!paired.has(environmentId) && !reachable.has(environmentId)) {
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
  const stopApp = useAppStore.subscribe((state) => {
    if (
      state.runtimeStatusByEnvironmentId === previous.runtimeStatusByEnvironmentId &&
      state.runtimeEnvironments === previous.runtimeEnvironments
    ) {
      return
    }
    previous = state
    reconcile(state)
  })
  const epochs = (): string =>
    localTasksDomainStore
      .getState()
      .partitions.map((partition) => `${partition.endpoint}:${partition.subscriptionEpoch}`)
      .join('\n')
  let previousEpochs = epochs()
  // Why: an explicit retry bumps a partition's epoch, which is part of its subscription key.
  const stopDomain = localTasksDomainStore.subscribe(() => {
    const next = epochs()
    if (next !== previousEpochs) {
      previousEpochs = next
      events.sync()
    }
  })
  return () => {
    stopApp()
    stopDomain()
    events.stop()
  }
}

/** Holds every task library this window reads; reads follow each host's notices only. */
export function LocalTasksSyncGate(): null {
  useEffect(() => installLocalTaskPageKeyRouter(), [])
  useEffect(() => bindLocalTaskSourceActivation(), [])
  useEffect(() => bindLocalTaskViewPreferences(), [])
  useEffect(
    () =>
      useAppStore.subscribe((state, previous) => {
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
