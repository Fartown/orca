import { useAppStore } from '@/store'
import { selectExecutionHostDisplayLabel } from '@/runtime/hosts/display/execution-host-display-label'
import { localTaskDispatcherClientFor } from './local-task-dispatcher-client'
import { createLocalTaskDispatcherForwarding } from './local-task-dispatcher-forwarding'
import { subscribeLocalTaskDispatcherChanges } from './local-task-dispatcher-changes'
import {
  getLocalTaskDispatcherEndpoint,
  getLocalTaskDispatcherEpoch,
  isLocalTaskDispatcherSourceCurrent
} from './local-task-dispatcher-source'
import { knownDispatcherPaneKey } from './local-task-dispatcher-session'
import { localTasksDomainStore } from './local-tasks-domain-store'
import { localTasksSync } from './local-tasks-sync'
import { dispatcherFactSourceId } from './local-task-dispatcher-ids'

function forwardingForSource() {
  const endpoint = getLocalTaskDispatcherEndpoint()
  const epoch = getLocalTaskDispatcherEpoch()
  return createLocalTaskDispatcherForwarding({
    endpoint,
    current: () => isLocalTaskDispatcherSourceCurrent(endpoint, epoch),
    client: localTaskDispatcherClientFor(endpoint),
    watchEvents: (taskId) => localTasksSync.watchEvents(taskId),
    paneKey: knownDispatcherPaneKey,
    hostLabel: (host) => selectExecutionHostDisplayLabel(useAppStore.getState(), host),
    now: Date.now,
    domain: () => localTasksDomainStore.getState(),
    factSourceId: dispatcherFactSourceId
  })
}

export function bindLocalTaskDispatcherForwarding(): () => void {
  let forwarding = forwardingForSource()
  let identities = ''
  const unsubscribeChanges = subscribeLocalTaskDispatcherChanges(
    (scopes) => {
      if (scopes === null || scopes.includes('events')) {
        void forwarding.refreshWatches()
      }
    },
    () => {
      forwarding.dispose()
      forwarding = forwardingForSource()
    }
  )
  const unsubscribeDomain = localTasksDomainStore.subscribe((state, previous) => {
    if (state.partitions !== previous.partitions) {
      const next = state.partitions
        .map((partition) => `${partition.endpoint}:${partition.installationId ?? ''}`)
        .join('|')
      if (identities !== next) {
        identities = next
        void forwarding.refreshWatches()
      }
    }
    if (state.tasks !== previous.tasks) {
      void forwarding.resolvePending()
    }
    if (
      state.eventsByTaskId !== previous.eventsByTaskId ||
      state.partitions !== previous.partitions
    ) {
      void forwarding.forward(state)
    }
  })
  return () => {
    unsubscribeChanges()
    unsubscribeDomain()
    forwarding.dispose()
  }
}
