import type { Tab } from './tab-types'
import type { TerminalTab } from './terminal-tab-types'
import { resolveAgentConversationLiveTitle } from './agent-row-conversation-name'
import { mintAgentSessionFallbackTitle } from './agent-session-fallback-title'
import { isMeaningfulOpenCodeTerminalTitle } from './opencode-terminal-title'
import { resolveSessionDisplayTitle } from './session-display-title'
import type { TuiAgent } from './tui-agent'
import { sessionNameSlotCandidates } from './session-names/session-name-slot'

export function resolveTerminalTabTitle(
  tab: Pick<
    TerminalTab,
    | 'customTitle'
    | 'quickCommandLabel'
    | 'aiVaultTitle'
    | 'generatedTitle'
    | 'title'
    | 'defaultTitle'
    | 'launchAgent'
  >,
  generatedTitlesEnabled: boolean,
  fallback = ''
): string {
  const liveTitle = tab.title?.trim() ?? ''
  const sessionTitle = tab.aiVaultTitle
  // Why: agents outside the aiVaultTitle slot domain still rewrite the OSC title every frame.
  const agent =
    sessionTitle?.agent ??
    tab.launchAgent ??
    (isMeaningfulOpenCodeTerminalTitle(liveTitle) ? 'opencode' : null)
  const sessionNames = sessionNameSlotCandidates(sessionTitle)
  const resolved = resolveSessionDisplayTitle({
    ...sessionNames,
    providerTitle:
      sessionNames.providerTitle ??
      (agent === 'opencode' && isMeaningfulOpenCodeTerminalTitle(liveTitle) ? liveTitle : null),
    generatedTitle:
      sessionNames.generatedTitle ?? (generatedTitlesEnabled ? tab.generatedTitle : null),
    liveTitle: agent
      ? resolveAgentConversationLiveTitle(liveTitle, agent, tab.defaultTitle)
      : liveTitle,
    labelTitle: agent ? tab.customTitle?.trim() || tab.quickCommandLabel : null,
    identityFallbackTitle: sessionTitle
      ? mintAgentSessionFallbackTitle(sessionTitle.agent, sessionTitle.sessionId)
      : // Slotless agent panes have no session id to mint from; the tab's own label is the
        // only stable name left, and callers pass the live title as `fallback`.
        (agent && tab.defaultTitle?.trim()) || null
  })
  return (
    (!agent && (tab.customTitle?.trim() || tab.quickCommandLabel?.trim())) ||
    resolved?.title ||
    fallback
  )
}

export function resolveUnifiedTabLabel(
  tab:
    | (Pick<
        Tab,
        'customLabel' | 'quickCommandLabel' | 'aiVaultTitle' | 'generatedLabel' | 'label'
      > & { launchAgent?: TuiAgent })
    | undefined,
  generatedTitlesEnabled: boolean,
  fallback = ''
): string {
  const liveLabel = tab?.label?.trim() ?? ''
  const sessionTitle = tab?.aiVaultTitle
  const agent =
    sessionTitle?.agent ??
    tab?.launchAgent ??
    (isMeaningfulOpenCodeTerminalTitle(liveLabel) ? 'opencode' : null)
  const sessionNames = sessionNameSlotCandidates(sessionTitle)
  const resolved = resolveSessionDisplayTitle({
    ...sessionNames,
    providerTitle:
      sessionNames.providerTitle ??
      (agent === 'opencode' && isMeaningfulOpenCodeTerminalTitle(liveLabel) ? liveLabel : null),
    generatedTitle:
      sessionNames.generatedTitle ?? (generatedTitlesEnabled ? tab?.generatedLabel : null),
    liveTitle: agent ? resolveAgentConversationLiveTitle(liveLabel, agent, undefined) : liveLabel,
    labelTitle: agent ? tab?.customLabel?.trim() || tab?.quickCommandLabel : null,
    identityFallbackTitle: sessionTitle
      ? mintAgentSessionFallbackTitle(sessionTitle.agent, sessionTitle.sessionId)
      : null
  })
  return (
    (!agent && (tab?.customLabel?.trim() || tab?.quickCommandLabel?.trim())) ||
    resolved?.title ||
    fallback
  )
}
