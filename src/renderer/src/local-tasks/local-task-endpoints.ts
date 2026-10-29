import {
  LOCAL_EXECUTION_HOST_ID,
  parseExecutionHostId,
  toRuntimeExecutionHostId
} from '../../../shared/execution-host'
import type { HostAuthorityEndpoint } from '../../../shared/host-authority'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'

/**
 * Which Orca's task library a row came from (D-008): `local` is this app's own, `runtime:{env}` a
 * paired Orca's. Libraries never merge; every client key is endpoint plus the library's own id.
 */
export type LocalTaskEndpointKey = typeof LOCAL_EXECUTION_HOST_ID | `runtime:${string}`

export const SELF_LOCAL_TASK_ENDPOINT: LocalTaskEndpointKey = LOCAL_EXECUTION_HOST_ID

export function localTaskEnvironmentEndpoint(environmentId: string): LocalTaskEndpointKey {
  return toRuntimeExecutionHostId(environmentId)
}

export function localTaskEndpointEnvironmentId(endpoint: LocalTaskEndpointKey): string | null {
  const parsed = parseExecutionHostId(endpoint)
  return parsed?.kind === 'runtime' ? parsed.environmentId : null
}

export function localTaskEndpointTarget(endpoint: LocalTaskEndpointKey): RuntimeClientTarget {
  const environmentId = localTaskEndpointEnvironmentId(endpoint)
  return environmentId ? { kind: 'environment', environmentId } : { kind: 'local' }
}

export function localTaskEndpointAuthority(endpoint: LocalTaskEndpointKey): HostAuthorityEndpoint {
  const environmentId = localTaskEndpointEnvironmentId(endpoint)
  return environmentId ? { kind: 'environment', environmentId } : { kind: 'self' }
}

/** The library that may hold a host this client names: this app's for its own hosts, else the server's. */
export function localTaskEndpointForHost(hostId: string): LocalTaskEndpointKey | null {
  const host = parseExecutionHostId(hostId)
  if (host?.kind === 'runtime') {
    return localTaskEnvironmentEndpoint(host.environmentId)
  }
  return host ? SELF_LOCAL_TASK_ENDPOINT : null
}

const RUNTIME_PREFIX = 'runtime:'
const SEPARATOR = '/'

/**
 * A library id as this client keys it. This app's own rows keep their id; a paired Orca's are
 * `runtime:{env}/{id}`, so ids from two libraries never meet in one map, list or selection.
 */
export function localTaskClientId(endpoint: LocalTaskEndpointKey, id: string): string {
  return endpoint === SELF_LOCAL_TASK_ENDPOINT ? id : `${endpoint}${SEPARATOR}${id}`
}

export function splitLocalTaskClientId(clientId: string): {
  endpoint: LocalTaskEndpointKey
  id: string
} {
  const at = clientId.startsWith(RUNTIME_PREFIX) ? clientId.indexOf(SEPARATOR) : -1
  if (at <= RUNTIME_PREFIX.length) {
    return { endpoint: SELF_LOCAL_TASK_ENDPOINT, id: clientId }
  }
  return {
    endpoint: localTaskEnvironmentEndpoint(clientId.slice(RUNTIME_PREFIX.length, at)),
    id: clientId.slice(at + 1)
  }
}

export function localTaskIdEndpoint(clientId: string): LocalTaskEndpointKey {
  return splitLocalTaskClientId(clientId).endpoint
}

/** The id the owning library knows, for a request to it. */
export function localTaskOwnerId(clientId: string): string {
  return splitLocalTaskClientId(clientId).id
}
