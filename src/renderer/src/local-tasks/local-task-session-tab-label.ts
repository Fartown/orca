import { resolvePinnedTabLabel } from '@/store/pinned-tab-close-guard'
import type { AppState } from '@/store/types'
import { firstSessionNamePrompt } from '@/session-names/session-name-prompt-projection'
import { resolveAgentConversationLiveTitle } from '../../../shared/agent-row-conversation-name'
import { deriveGeneratedTabTitle } from '../../../shared/agent-tab-title'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import type { LocalTaskSessionLink } from '../../../shared/local-tasks/local-task-link-types'

function tabLabel(state: AppState, link: LocalTaskSessionLink): string | null {
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

/**
 * What the agent itself reports for the pane, when this window has no tab for it: the terminal
 * title it set, else the name upstream derives from its first prompt, under the same setting that
 * lets upstream name tabs that way. Read from the status this window already holds; a pane on a
 * host out of contact has none, and nothing is asked for it.
 */
function agentStatusLabel(state: AppState, link: LocalTaskSessionLink): string | null {
  const entry = link.paneKey ? state.agentStatusByPaneKey[link.paneKey] : undefined
  if (!entry) {
    return null
  }
  const title = entry.terminalTitle
    ? resolveAgentConversationLiveTitle(entry.terminalTitle, entry.agentType, undefined)
    : null
  if (title || state.settings?.tabAutoGenerateTitle !== true) {
    return title
  }
  return deriveGeneratedTabTitle(firstSessionNamePrompt(entry) ?? '')
}

/**
 * The session's name as this window knows it, which tells two sessions in one state apart: the tab
 * strip's label, else the agent's own terminal title or prompt-derived name; null leaves the caller
 * to the agent's name. Ids are this client's (`local-task-client-rows.ts`).
 */
export function selectLocalTaskSessionTabLabel(
  state: AppState,
  link: LocalTaskSessionLink
): string | null {
  return tabLabel(state, link) ?? agentStatusLabel(state, link)
}
