import type { ActivityTerminalPortalTarget } from '@/components/activity/activity-terminal-portal'
import type { AppState } from '@/store/types'
import { selectWorkspaceByHostTarget } from '@/store/workspace-record-selectors'
import { parseExecutionHostId } from '../../../shared/execution-host'
import { hostWorktreeTarget } from '../../../shared/worktree/host-qualified-identity'
import { isTerminalLeafId, makePaneKey, parsePaneKey } from '../../../shared/stable-pane-id'
import type {
  TerminalLayoutSnapshot,
  TerminalPaneLayoutNode
} from '../../../shared/terminal-tab-types'
import type { LocalTaskSessionLink } from '../../../shared/local-tasks/local-task-link-types'

type PortalCandidate = Omit<ActivityTerminalPortalTarget, 'active'>

type SessionMountState = Pick<
  AppState,
  'worktreesByRepo' | 'folderWorkspaces' | 'repos' | 'projectGroups' | 'tabsByWorktree'
>

export function localTaskSessionMountReady(
  state: SessionMountState,
  session: Pick<LocalTaskSessionLink, 'hostId' | 'worktreeId'>,
  tabId: string | null
): boolean {
  const host = parseExecutionHostId(session.hostId)
  const worktreeId = session.worktreeId
  return Boolean(
    host &&
    worktreeId &&
    tabId &&
    selectWorkspaceByHostTarget(state, hostWorktreeTarget({ id: worktreeId, hostId: host.id })) &&
    state.tabsByWorktree[worktreeId]?.some((tab) => tab.id === tabId)
  )
}

function firstLeaf(node: TerminalPaneLayoutNode | null): string | null {
  if (!node) {
    return null
  }
  return node.type === 'leaf' ? node.leafId : (firstLeaf(node.first) ?? firstLeaf(node.second))
}

/** A linked terminal may name only its host tab; the mirrored layout owns the actual pane. */
export function resolveLocalTaskSessionPaneKey(
  session: Pick<LocalTaskSessionLink, 'tabId' | 'paneKey'>,
  layout: TerminalLayoutSnapshot | undefined
): string | null {
  const explicit = session.paneKey ? parsePaneKey(session.paneKey) : null
  if (explicit) {
    return session.paneKey
  }
  const leafId = layout?.activeLeafId ?? firstLeaf(layout?.root ?? null)
  return session.tabId && leafId && isTerminalLeafId(leafId)
    ? makePaneKey(session.tabId, leafId)
    : null
}

export function planLocalTaskSessionPortal(
  candidate: PortalCandidate | null,
  inContact: boolean,
  previous: ActivityTerminalPortalTarget | null
): { descriptor: ActivityTerminalPortalTarget | null; requestMount: boolean } {
  if (!candidate) {
    return { descriptor: null, requestMount: false }
  }
  if (inContact) {
    return { descriptor: { ...candidate, active: true }, requestMount: true }
  }
  if (previous?.requestToken === candidate.requestToken && previous.target === candidate.target) {
    return { descriptor: { ...candidate, active: false }, requestMount: false }
  }
  return { descriptor: null, requestMount: false }
}
