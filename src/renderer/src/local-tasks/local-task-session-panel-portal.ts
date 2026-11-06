import type { ActivityTerminalPortalTarget } from '@/components/activity/activity-terminal-portal'
import { isTerminalLeafId, makePaneKey, parsePaneKey } from '../../../shared/stable-pane-id'
import type {
  TerminalLayoutSnapshot,
  TerminalPaneLayoutNode
} from '../../../shared/terminal-tab-types'
import type { LocalTaskSessionLink } from '../../../shared/local-tasks/local-task-link-types'

type PortalCandidate = Omit<ActivityTerminalPortalTarget, 'active'>

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
