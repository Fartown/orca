import { parseExecutionHostId } from '../../../src/shared/execution-host'
import type { HostAuthorityEndpoint } from '../../../src/shared/host-authority'
import {
  isLocalTaskOwnedHostId,
  localTaskClientHostId
} from '../../../src/shared/local-tasks/local-task-endpoint-ids'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState } from '../transport/types'

/**
 * Which Orca's task library a view reads (D-008): the paired host's own, or one of the servers it
 * relays to. Every request to a server's library names it in the envelope's `executionHost`.
 */
export type LocalTaskEndpoint = {
  /** `self`, or the server's `runtime:{env}`; keys every per-library state on the page. */
  key: string
  authority: HostAuthorityEndpoint
  executionHost: `runtime:${string}` | undefined
}

/** What a view needs to reach one library, and to open routes under the phone's paired host. */
export type LocalTaskSite = {
  /** The paired host's id: every route the page opens is under it. */
  hostId: string
  /** The paired host's client; its project catalog and settings are read there. */
  pairedClient: RpcClient | null
  endpoint: LocalTaskEndpoint
  /** The library host's client: the paired one, or a view scoped to the server. */
  client: RpcClient | null
  connState: ConnectionState
  /** What the library's Orca advertises; a launch on it reads these. */
  capabilities: readonly string[]
  /** The library's Orca, as the user knows it. */
  label: string
}

export const SELF_LOCAL_TASK_ENDPOINT: LocalTaskEndpoint = {
  key: 'self',
  authority: { kind: 'self' },
  executionHost: undefined
}

/** The library a route names with `executionHost=runtime:{env}`; the paired host's otherwise. */
export function localTaskEndpointFor(executionHost: string | null | undefined): LocalTaskEndpoint {
  const host = parseExecutionHostId(executionHost)
  if (host?.kind !== 'runtime') {
    return SELF_LOCAL_TASK_ENDPOINT
  }
  return {
    key: host.id,
    authority: { kind: 'environment', environmentId: host.environmentId },
    executionHost: host.id
  }
}

/**
 * The `executionHost` a phone route into a library row's workspace carries: none on the paired
 * host (its own machine and SSH targets), the server for a server's library, null for a row the
 * library cannot own (a pre-D-008 leftover), which opens nothing.
 */
export function localTaskRouteExecutionHost(
  endpoint: LocalTaskEndpoint,
  ownerHostId: string
): `runtime:${string}` | undefined | null {
  const clientHostId = localTaskClientHostId(endpoint.authority, ownerHostId)
  if (!clientHostId) {
    return null
  }
  const host = parseExecutionHostId(clientHostId)
  return host?.kind === 'runtime' ? host.id : undefined
}

/**
 * The owner's own host id for a host id the phone's lists use: a server's checkouts are `runtime:E`
 * to the phone and `local` to E's library. Null for a host this library does not own.
 */
export function localTaskOwnerHostId(
  endpoint: LocalTaskEndpoint,
  clientHostId: string
): string | null {
  if (endpoint.executionHost) {
    return clientHostId === endpoint.executionHost ? 'local' : null
  }
  return isLocalTaskOwnedHostId(clientHostId) ? clientHostId : null
}

/** The phone-side host id for a library row's owner-relative one, for matching the phone's lists. */
export function localTaskListedHostId(
  endpoint: LocalTaskEndpoint,
  ownerHostId: string
): string | null {
  return localTaskClientHostId(endpoint.authority, ownerHostId)
}
