import type {
  LocalTaskSessionLink,
  LocalTaskWorkspaceLink
} from '../../../src/shared/local-tasks/local-task-link-types'
import { parsePaneKey } from '../../../src/shared/stable-pane-id'
import {
  structuredAgentSessionPaneKey,
  structuredAgentSessionTabId
} from '../../../src/shared/structured-agent-session-projection'
import { folderWorkspaceKey } from '../../../src/shared/workspace-scope'
import { workspaceRouteHref } from '../navigation/workspace-execution-host'
import { localTaskRouteExecutionHost, type LocalTaskEndpoint } from './local-task-endpoint'

/** The id the phone's workspace routes take: a folder workspace goes by its `folder:` key. */
export function localTaskWorkspaceRouteId(
  link: Pick<LocalTaskWorkspaceLink, 'kind' | 'worktreeId' | 'folderWorkspaceId'>
): string | null {
  if (link.kind === 'folder') {
    return link.folderWorkspaceId ? folderWorkspaceKey(link.folderWorkspaceId) : null
  }
  return link.worktreeId
}

/**
 * The pane the session route opens on. The library stores its host's own key, and the phone's
 * route into that host (directly, or relayed to a server) lists the same host's own tabs.
 */
export function localTaskSessionPaneKey(session: LocalTaskSessionLink): string | null {
  if (session.paneKey && parsePaneKey(session.paneKey)) {
    return session.paneKey
  }
  if (session.sessionId) {
    return structuredAgentSessionPaneKey(
      session.tabId ?? structuredAgentSessionTabId(session.sessionId),
      session.sessionId
    )
  }
  return null
}

/**
 * The existing session screen for a linked workspace, optionally on one pane. A server library's
 * workspace carries `executionHost` so its calls run there; the paired host's own (local, SSH)
 * run on the route's host. A row the library cannot own opens nothing.
 */
export function localTaskWorkspaceHref(args: {
  hostId: string
  endpoint: LocalTaskEndpoint
  link: Pick<LocalTaskWorkspaceLink, 'kind' | 'worktreeId' | 'folderWorkspaceId' | 'hostId'> & {
    nameSnapshot?: string | null
  }
  paneKey?: string | null
}): string | null {
  const worktreeId = localTaskWorkspaceRouteId(args.link)
  const executionHost = localTaskRouteExecutionHost(args.endpoint, args.link.hostId)
  if (!worktreeId || executionHost === null) {
    return null
  }
  const params = new URLSearchParams()
  if (args.link.nameSnapshot) {
    params.set('name', args.link.nameSnapshot)
  }
  if (args.paneKey) {
    params.set('paneKey', args.paneKey)
  }
  const query = params.toString()
  const href = `/h/${encodeURIComponent(args.hostId)}/session/${encodeURIComponent(worktreeId)}${query ? `?${query}` : ''}`
  return workspaceRouteHref(href, executionHost)
}

/** The session screen on one linked session's pane, in the workspace it actually ran in. */
export function localTaskSessionHref(args: {
  hostId: string
  endpoint: LocalTaskEndpoint
  session: LocalTaskSessionLink
  workspace: LocalTaskWorkspaceLink | null
}): string | null {
  const ownRouteId = args.session.worktreeId
  const workspaceRouteId = args.workspace ? localTaskWorkspaceRouteId(args.workspace) : null
  // Why: a session keeps the workspace it ran in (D-007/REQ-011). A reparented task's old session
  // must route to its own host/worktree, not the new ancestor's workspace; only when the session
  // sits in that same workspace do we use the richer link (folder, name).
  const elsewhere =
    ownRouteId !== null &&
    (args.workspace === null ||
      ownRouteId !== workspaceRouteId ||
      args.session.hostId !== args.workspace.hostId)
  const link =
    !elsewhere && args.workspace
      ? args.workspace
      : {
          kind: 'git-worktree' as const,
          worktreeId: ownRouteId,
          folderWorkspaceId: null,
          hostId: args.session.hostId
        }
  return localTaskWorkspaceHref({
    hostId: args.hostId,
    endpoint: args.endpoint,
    link,
    paneKey: localTaskSessionPaneKey(args.session)
  })
}
