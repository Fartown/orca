import type { AppState } from '@/store/types'
import {
  UNRESOLVED_OWNER_HOST_ID,
  parseExecutionHostId,
  toRuntimeExecutionHostId,
  type ExecutionHostId
} from '../../../shared/execution-host/execution-host'
import type {
  HostAuthority,
  HostAuthorityEndpoint
} from '../../../shared/execution-host/host-authority'
import {
  isRuntimeHostContactRevoked,
  lastVerifiedRuntimeStatus
} from '../../../shared/remote-runtime/host-status/runtime-host-status'
import {
  toLocalTaskOwnedHostId,
  localTaskClientSessionIds
} from '../../../shared/local-tasks/local-task-endpoint-ids'
import type { LocalTaskSessionLink } from '../../../shared/local-tasks/local-task-link-types'
import {
  LocalTaskSessionExecutionOriginSchema,
  type LocalTaskSessionExecutionOrigin
} from '../../../shared/local-tasks/local-task-session-origin'

export type LocalTaskSessionOriginRouteState = Pick<AppState, 'runtimeStatusByEnvironmentId'>

export type LocalTaskSessionOriginRoute = {
  hostId: ExecutionHostId
  authority: HostAuthority | null
}

/** Saved installation identity survives a lost connection; contact still gates every live read. */
export function resolveLocalTaskSessionOriginRoute(
  state: LocalTaskSessionOriginRouteState,
  selfInstallationId: string | null | undefined,
  origin: LocalTaskSessionExecutionOrigin
): LocalTaskSessionOriginRoute {
  const parsed = LocalTaskSessionExecutionOriginSchema.safeParse(origin)
  const host = parsed.success
    ? parseExecutionHostId(toLocalTaskOwnedHostId(parsed.data.hostId))
    : null
  if (!parsed.success || !host || host.kind === 'runtime') {
    return { hostId: UNRESOLVED_OWNER_HOST_ID, authority: null }
  }
  const endpoints: HostAuthorityEndpoint[] = []
  if (selfInstallationId === parsed.data.installationId) {
    endpoints.push({ kind: 'self' })
  }
  for (const [environmentId, entry] of state.runtimeStatusByEnvironmentId) {
    if (
      !isRuntimeHostContactRevoked(entry) &&
      lastVerifiedRuntimeStatus(entry)?.hostDescriptor?.installationId ===
        parsed.data.installationId
    ) {
      endpoints.push({ kind: 'environment', environmentId })
    }
  }
  if (endpoints.length !== 1) {
    return { hostId: UNRESOLVED_OWNER_HOST_ID, authority: null }
  }
  const endpoint = endpoints[0]
  return {
    hostId: endpoint.kind === 'self' ? host.id : toRuntimeExecutionHostId(endpoint.environmentId),
    authority: { endpoint, at: host.id }
  }
}

/** Raw source ids become this client's ids, independently of the library holding the task. */
export function localTaskSessionOriginClientIds(
  route: LocalTaskSessionOriginRoute,
  link: Pick<LocalTaskSessionLink, 'surface' | 'tabId' | 'paneKey'>
): Pick<LocalTaskSessionLink, 'tabId' | 'paneKey'> {
  return route.authority
    ? localTaskClientSessionIds(route.authority.endpoint, link)
    : { tabId: link.tabId, paneKey: link.paneKey }
}

export function projectLocalTaskSessionExecutionOrigin(
  state: LocalTaskSessionOriginRouteState,
  selfInstallationId: string | null | undefined,
  rawLink: LocalTaskSessionLink
): LocalTaskSessionLink {
  if (!rawLink.executionOrigin) {
    return rawLink
  }
  const route = resolveLocalTaskSessionOriginRoute(
    state,
    selfInstallationId,
    rawLink.executionOrigin
  )
  return { ...rawLink, ...localTaskSessionOriginClientIds(route, rawLink), hostId: route.hostId }
}
