import { parseExecutionHostId } from '../../../shared/execution-host'
import {
  getReachableRuntimeEnvironmentIds,
  type RuntimeEnvironmentStoreSyncState
} from '../hooks/ipc-events/runtime-environment-subscription-selection'
import type { AppState } from '../store/types'

export type GoalHostContactState = RuntimeEnvironmentStoreSyncState & {
  sshConnectionStates?: AppState['sshConnectionStates']
}

/**
 * Whether Goals may read a host right now. Only the shared verdicts decide: the SSH connection
 * manager's state and the runtime transport's contact. Goals never probes or reconnects a host.
 */
export function isGoalHostInContact(state: GoalHostContactState, hostId: string): boolean {
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
