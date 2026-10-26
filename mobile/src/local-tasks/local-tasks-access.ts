import { LOCAL_TASKS_RUNTIME_CAPABILITY } from '../../../src/shared/local-tasks/local-tasks-capability'
import type { ConnectionState, HostProfile } from '../transport/types'
import type { UnvalidatedRpcRequestPort } from '../transport/unvalidated-rpc-request-port'
import { createLocalTasksApi } from './local-tasks-api'
import { countLocalTasksInCategory } from './local-task-list-projection'

/**
 * Whether this page may talk to the host's task library at all.
 *
 * Only a desktop that advertised `local-tasks.v1` in `status.get` is a task host: an older desktop
 * and every server (orcad, `orca serve`) leave it out, and none of them is sent a `localTasks.*`
 * request. A host out of contact is "not open" rather than "unsupported" — the phone does not
 * show a cached library for it, because a cached one is stale by definition.
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
  // Why two answers: an unread status is "cannot tell", never "this desktop is too old".
  return input.statusReadable ? 'unsupported' : 'unreadable'
}

/** The name the desktop calls itself, which is what "{name}'s Orca is not open" means. */
export function localTaskHostMachineName(host: Pick<HostProfile, 'name' | 'lastKnownMachineName'>) {
  return host.lastKnownMachineName ?? host.name
}

/**
 * The home card's one number: tasks in the Started category on this host.
 *
 * Null, and no request at all, when the host did not advertise the capability.
 */
export async function readLocalTasksInProgress(
  client: UnvalidatedRpcRequestPort,
  capabilities: readonly string[] | undefined
): Promise<number | null> {
  if (!hostAdvertisesLocalTasks(capabilities)) {
    return null
  }
  const api = createLocalTasksApi(client)
  const [projects, tasks] = await Promise.all([api.projects(), api.tasks()])
  return countLocalTasksInCategory(tasks, projects, 'started')
}
