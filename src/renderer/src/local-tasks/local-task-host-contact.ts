import { parseExecutionHostId } from '../../../shared/execution-host'
import {
  getReachableRuntimeEnvironmentIds,
  type RuntimeEnvironmentStoreSyncState
} from '../hooks/ipc-events/runtime-environment-subscription-selection'
import { useAppStore } from '@/store'
import type { AppState } from '../store/types'

export type LocalTaskHostContactState = RuntimeEnvironmentStoreSyncState & {
  sshConnectionStates?: AppState['sshConnectionStates']
}

/**
 * Whether a task's execution host may be read or acted on now. Only the shared verdicts decide:
 * the SSH connection manager's state and the runtime transport's contact. Never probes or reconnects.
 */
export function isLocalTaskHostInContact(
  state: LocalTaskHostContactState,
  hostId: string
): boolean {
  const parsed = parseExecutionHostId(hostId)
  if (!parsed) {
    return false
  }
  if (parsed.kind === 'local') {
    return true
  }
  if (parsed.kind === 'ssh') {
    return state.sshConnectionStates?.get(parsed.targetId)?.status === 'connected'
  }
  return getReachableRuntimeEnvironmentIds(state).includes(parsed.environmentId)
}

export function useLocalTaskHostInContact(hostId: string | null): boolean {
  return useAppStore((state) => (hostId === null ? false : isLocalTaskHostInContact(state, hostId)))
}
