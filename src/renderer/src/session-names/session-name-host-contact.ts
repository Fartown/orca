import {
  parseExecutionHostId,
  toRuntimeExecutionHostId,
  type ExecutionHostId
} from '../../../shared/execution-host/execution-host'
import {
  getReachableRuntimeEnvironmentIds,
  pickRuntimeEnvironmentSyncState
} from '@/hooks/ipc-events/runtime-events/runtime-environment-subscription-selection'
import { useAppStore } from '@/store'
import { subscribeAppStoreWithStatuses } from '@/store/slices/runtime-status/views/runtime-status-owner'

export const sessionNameHostContact = {
  canRead(host: ExecutionHostId): boolean {
    const parsed = parseExecutionHostId(host)
    // Plain SSH title lookups return unavailable inside main without contacting a host.
    return (
      parsed?.kind !== 'runtime' ||
      getReachableRuntimeEnvironmentIds(useAppStore.getState()).includes(parsed.environmentId)
    )
  },
  onReconnect(read: (host: ExecutionHostId) => void): () => void {
    return subscribeAppStoreWithStatuses((state, previous, statuses, previousStatuses) => {
      if (statuses === previousStatuses) {
        return
      }
      const before = new Set(
        getReachableRuntimeEnvironmentIds(
          pickRuntimeEnvironmentSyncState(previous, previousStatuses)
        )
      )
      for (const id of getReachableRuntimeEnvironmentIds(
        pickRuntimeEnvironmentSyncState(state, statuses)
      )) {
        if (!before.has(id)) {
          read(toRuntimeExecutionHostId(id))
        }
      }
    })
  }
}
