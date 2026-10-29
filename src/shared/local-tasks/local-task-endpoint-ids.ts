/**
 * A task library stores host, tab and pane ids as its owning Orca names them (`local`, `ssh:{t}`,
 * raw `tab:leaf`). A client reading another Orca's library converts on read and converts back on
 * write, the way `endpoint-catalog-adoption.ts` adopts a server's projects. Shared so the phone
 * and every desktop convert alike.
 */
import {
  parseExecutionHostId,
  toRuntimeExecutionHostId,
  toSshExecutionHostId
} from '../execution-host'
import type { HostAuthorityEndpoint } from '../host-authority'
import { makePaneKey, parsePaneKey } from '../stable-pane-id'
import { toHostSessionTabId, toWebTerminalSurfaceTabId } from '../terminal-surface-id'
import type { LocalTaskSessionLink } from './local-task-link-types'

/**
 * The one spelling a library stores for a host it may hold, the owner itself or one of its SSH
 * targets; null for any other host. `ssh:a/b` and `ssh:a%2Fb` both become `ssh:a%2Fb`.
 */
export function toLocalTaskOwnedHostId(hostId: string | null | undefined): string | null {
  const host = parseExecutionHostId(hostId)
  if (host?.kind === 'local') {
    return host.id
  }
  return host?.kind === 'ssh' ? toSshExecutionHostId(host.targetId) : null
}

export function isLocalTaskOwnedHostId(hostId: string): boolean {
  return toLocalTaskOwnedHostId(hostId) !== null
}

/**
 * The execution host id the client's own worktree rows carry for a library row: the row's own on
 * this client's library, `runtime:{env}` for every row of a paired environment's library.
 */
export function localTaskClientHostId(
  endpoint: HostAuthorityEndpoint,
  hostId: string
): string | null {
  if (!isLocalTaskOwnedHostId(hostId)) {
    return null
  }
  return endpoint.kind === 'self' ? hostId : toRuntimeExecutionHostId(endpoint.environmentId)
}

type SessionIds = Pick<LocalTaskSessionLink, 'surface' | 'tabId' | 'paneKey'>

function mirrorsTerminals(endpoint: HostAuthorityEndpoint, surface: SessionIds['surface']) {
  return endpoint.kind === 'environment' && surface === 'terminal'
}

function mapPaneTab(paneKey: string | null, map: (tabId: string) => string): string | null {
  const pane = paneKey ? parsePaneKey(paneKey) : null
  if (!pane) {
    return paneKey
  }
  try {
    return makePaneKey(map(pane.tabId), pane.leafId)
  } catch {
    return null
  }
}

/** Tab and pane ids as the client's stores key them: a paired server's terminals are mirrored. */
export function localTaskClientSessionIds(
  endpoint: HostAuthorityEndpoint,
  link: SessionIds
): { tabId: string | null; paneKey: string | null } {
  if (!mirrorsTerminals(endpoint, link.surface)) {
    return { tabId: link.tabId, paneKey: link.paneKey }
  }
  return {
    tabId: link.tabId ? toWebTerminalSurfaceTabId(link.tabId) : null,
    paneKey: mapPaneTab(link.paneKey, toWebTerminalSurfaceTabId)
  }
}

/** The owner's own tab and pane ids for ids the client holds, for `links.recordSession`. */
export function localTaskOwnerSessionIds(
  endpoint: HostAuthorityEndpoint,
  ids: SessionIds
): { tabId: string | null; paneKey: string | null } {
  if (!mirrorsTerminals(endpoint, ids.surface)) {
    return { tabId: ids.tabId, paneKey: ids.paneKey }
  }
  return {
    tabId: ids.tabId ? toHostSessionTabId(ids.tabId) : null,
    paneKey: mapPaneTab(ids.paneKey, toHostSessionTabId)
  }
}
