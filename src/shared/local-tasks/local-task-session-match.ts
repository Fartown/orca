import { parsePaneKey } from '../stable-pane-id'
import type { LocalTaskLinks, LocalTaskSessionLink } from './local-task-link-types'

export type LocalTaskSessionIdentity = {
  paneKey?: string | null
  sessionId?: string | null
  tabId?: string | null
}

/** Prefer an exact pane or agent session; a tab-only link matches only before claiming its pane. */
export function findLocalTaskSessionForIdentity(
  links: LocalTaskLinks,
  identity: LocalTaskSessionIdentity
): LocalTaskSessionLink | null {
  const paneKey = identity.paneKey || null
  const sessionId = identity.sessionId || null
  const tabId = identity.tabId || (paneKey ? parsePaneKey(paneKey)?.tabId : null)
  return (
    (paneKey ? links.sessions.find((link) => link.paneKey === paneKey) : undefined) ??
    (sessionId ? links.sessions.find((link) => link.sessionId === sessionId) : undefined) ??
    (tabId
      ? links.sessions.find((link) => link.paneKey === null && link.tabId === tabId)
      : undefined) ??
    null
  )
}
