import { LOCAL_TASKS_RUNTIME_CAPABILITY } from '../../../src/shared/local-tasks/local-tasks-capability'
import type { ConnectionState, HostProfile } from '../transport/types'

/**
 * Whether this page may talk to a host's task library at all.
 *
 * Every Orca keeps its own library and advertises `local-tasks.v1` in `status.get` (D-008); an older
 * one leaves it out and is never sent a `localTasks.*` request. A host out of contact is "not open"
 * rather than "unsupported" — the phone does not show a cached library for it, because a cached one
 * is stale by definition.
 */
export type LocalTasksAccess = 'checking' | 'offline' | 'unsupported' | 'unreadable' | 'ready'

export function hostAdvertisesLocalTasks(capabilities: readonly string[] | undefined): boolean {
  return capabilities?.includes(LOCAL_TASKS_RUNTIME_CAPABILITY) === true
}

export function resolveLocalTasksAccess(input: {
  connState: ConnectionState
  statusPending: boolean
  statusReadable: boolean
  capabilities: readonly string[]
}): LocalTasksAccess {
  if (input.connState === 'connecting' || input.connState === 'handshaking') {
    return 'checking'
  }
  if (input.connState !== 'connected') {
    return 'offline'
  }
  if (input.statusPending) {
    return 'checking'
  }
  if (hostAdvertisesLocalTasks(input.capabilities)) {
    return 'ready'
  }
  // Why two answers: an unread status is "cannot tell", never "this Orca is too old".
  return input.statusReadable ? 'unsupported' : 'unreadable'
}

/** The name the host calls itself, which is what "{name}'s Orca is not open" means. */
export function localTaskHostMachineName(host: Pick<HostProfile, 'name' | 'lastKnownMachineName'>) {
  return host.lastKnownMachineName ?? host.name
}
