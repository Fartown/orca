import {
  structuredAgentSessionPaneKey,
  structuredAgentSessionTabId
} from '../../shared/agent-session/view/structured-agent-session-projection'
import { parsePaneKey } from '../../shared/stable-pane-id'
import type { LocalTaskStatusRow } from '../../shared/local-tasks/local-task-attention-rules'
import type { LocalTaskSessionLink } from '../../shared/local-tasks/local-task-link-types'

/** The host's own pane for a session recorded before its pane reported. */
export function findLocalTaskPane(
  link: LocalTaskSessionLink,
  knownPaneKeys: () => readonly string[],
  claimedPanes: ReadonlySet<string>
): string | null {
  if (link.surface === 'chat') {
    return link.sessionId
      ? structuredAgentSessionPaneKey(structuredAgentSessionTabId(link.sessionId), link.sessionId)
      : null
  }
  if (!link.tabId) {
    return null
  }
  // Why only a lone candidate: in a split tab any reporting pane may be another agent's.
  const candidates = knownPaneKeys().filter(
    (paneKey) => parsePaneKey(paneKey)?.tabId === link.tabId && !claimedPanes.has(paneKey)
  )
  return candidates.length === 1 ? candidates[0] : null
}

/** A structured session can hold several subjects on one pane; the newest report speaks. */
export function latestLocalTaskRow(rows: readonly LocalTaskStatusRow[]): LocalTaskStatusRow | null {
  let latest: LocalTaskStatusRow | null = null
  for (const row of rows) {
    if (!latest || row.receivedAt > latest.receivedAt) {
      latest = row
    }
  }
  return latest
}
