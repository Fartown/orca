import type { Tab } from './tab-types'
import type { TerminalTab } from './terminal-tab-types'
import { resolveAgentConversationLiveTitle } from './agent-row-conversation-name'
import { mintAgentSessionFallbackTitle } from './agent-session-fallback-title'
import { isMeaningfulOpenCodeTerminalTitle } from './opencode-terminal-title'
import { resolveSessionDisplayTitle } from './session-display-title'

export function resolveTerminalTabTitle(
  tab: Pick<
    TerminalTab,
    | 'customTitle'
    | 'quickCommandLabel'
    | 'aiVaultTitle'
    | 'generatedTitle'
    | 'title'
    | 'defaultTitle'
  >,
  generatedTitlesEnabled: boolean,
  fallback = ''
): string {
  const liveTitle = tab.title?.trim() ?? ''
  const sessionTitle = tab.aiVaultTitle
  const resolved = resolveSessionDisplayTitle({
    userTitle: sessionTitle?.source === 'conversation-override' ? sessionTitle.title : null,
    providerTitle: sessionTitle?.source !== 'conversation-override' ? sessionTitle?.title : null,
    generatedTitle: generatedTitlesEnabled ? tab.generatedTitle : null,
    liveTitle: sessionTitle
      ? resolveAgentConversationLiveTitle(liveTitle, sessionTitle.agent, tab.defaultTitle)
      : liveTitle,
    identityFallbackTitle: sessionTitle
      ? mintAgentSessionFallbackTitle(sessionTitle.agent, sessionTitle.sessionId)
      : null
  })
  return (
    tab.customTitle?.trim() ||
    tab.quickCommandLabel?.trim() ||
    (isMeaningfulOpenCodeTerminalTitle(liveTitle) ? liveTitle : '') ||
    resolved?.title ||
    fallback
  )
}

export function resolveUnifiedTabLabel(
  tab:
    | Pick<Tab, 'customLabel' | 'quickCommandLabel' | 'aiVaultTitle' | 'generatedLabel' | 'label'>
    | undefined,
  generatedTitlesEnabled: boolean,
  fallback = ''
): string {
  const liveLabel = tab?.label?.trim() ?? ''
  const sessionTitle = tab?.aiVaultTitle
  const resolved = resolveSessionDisplayTitle({
    userTitle: sessionTitle?.source === 'conversation-override' ? sessionTitle.title : null,
    providerTitle: sessionTitle?.source !== 'conversation-override' ? sessionTitle?.title : null,
    generatedTitle: generatedTitlesEnabled ? tab?.generatedLabel : null,
    liveTitle: sessionTitle
      ? resolveAgentConversationLiveTitle(liveLabel, sessionTitle.agent, undefined)
      : liveLabel,
    identityFallbackTitle: sessionTitle
      ? mintAgentSessionFallbackTitle(sessionTitle.agent, sessionTitle.sessionId)
      : null
  })
  return (
    tab?.customLabel?.trim() ||
    tab?.quickCommandLabel?.trim() ||
    (isMeaningfulOpenCodeTerminalTitle(liveLabel) ? liveLabel : '') ||
    resolved?.title ||
    fallback
  )
}
