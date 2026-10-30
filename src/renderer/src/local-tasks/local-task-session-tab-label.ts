import { resolvePinnedTabLabel } from '@/store/pinned-tab-close-guard'
import type { AppState } from '@/store/types'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import type { LocalTaskSessionLink } from '../../../shared/local-tasks/local-task-link-types'

/**
 * The session's tab as the tab strip names it, which tells two sessions in one state apart; null
 * when this window does not have the tab. Ids are this client's (`local-task-client-rows.ts`).
 */
export function selectLocalTaskSessionTabLabel(
  state: AppState,
  link: LocalTaskSessionLink
): string | null {
  if (!link.worktreeId) {
    return null
  }
  const paneTabId = link.paneKey ? (parsePaneKey(link.paneKey)?.tabId ?? null) : null
  for (const id of [paneTabId, link.tabId, link.sessionId]) {
    const label = id ? resolvePinnedTabLabel(state, link.worktreeId, id).trim() : ''
    if (label) {
      return label
    }
  }
  return null
}
