import type { AiVaultSessionTitle } from '../../ai-vault/contracts/ai-vault-session-title'
import type { Tab } from './tab-types'
import type { TerminalTab } from '../terminal-tab-types'
import { resolveAgentConversationLiveTitle } from '../../agent-status/presentation/agent-row-conversation-name'
import { mintAgentSessionFallbackTitle } from '../../agent-session-fallback-title'
import { isMeaningfulOpenCodeTerminalTitle } from '../../agent-status/title/providers/opencode-terminal-title'
import { resolveSessionDisplayTitle } from '../../session-display-title'
import type { TuiAgent } from '../../agent-launch/catalog/tui-agent'
import { sessionNameSlotCandidates } from '../../session-names/session-name-slot'

export type TabNameSources = {
  /** A name the user typed into the tab. */
  customTitle?: string | null
  quickCommandLabel?: string | null
  /** The program's own terminal title right now. */
  liveTitle: string
  /** The agent session's title, already checked to belong to this tab's session. */
  sessionTitle?: Pick<AiVaultSessionTitle, 'title' | 'kind'> | null
  generatedTitle?: string | null
}

/** Upstream's name order, kept for mobile's agent-title evidence check; desktop tabs use resolveTerminalTabTitle. */
export function resolveTabNameSource(
  sources: TabNameSources,
  generatedTitlesEnabled: boolean
): string {
  const sessionTitle = sources.sessionTitle?.title.trim() ?? ''
  const sessionNamed = sources.sessionTitle?.kind === 'named'
  return (
    sources.customTitle?.trim() ||
    (isMeaningfulOpenCodeTerminalTitle(sources.liveTitle) ? sources.liveTitle : '') ||
    (sessionNamed ? sessionTitle : '') ||
    sources.quickCommandLabel?.trim() ||
    sessionTitle ||
    (generatedTitlesEnabled ? sources.generatedTitle?.trim() : '') ||
    ''
  )
}

// Why: agent tabs follow the shared session-name order (D-010): a typed name first, then the provider's
// own name, then the first eligible task; a quick-command label only names the tab below those.
export function resolveTerminalTabTitle(
  tab: Pick<
    TerminalTab,
    | 'quickCommandLabel'
    | 'aiVaultTitle'
    | 'generatedTitle'
    | 'title'
    | 'defaultTitle'
    | 'launchAgent'
  > & {
    customTitle?: string | null
  },
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
    // The tab rename is the user's explicit name for this pane's session.
    userTitle: (agent && tab.customTitle?.trim()) || sessionNames.userTitle,
    providerTitle:
      sessionNames.providerTitle ??
      (agent === 'opencode' && isMeaningfulOpenCodeTerminalTitle(liveTitle) ? liveTitle : null),
    generatedTitle:
      sessionNames.generatedTitle ?? (generatedTitlesEnabled ? tab.generatedTitle : null),
    liveTitle: agent
      ? resolveAgentConversationLiveTitle(liveTitle, agent, tab.defaultTitle)
      : liveTitle,
    labelTitle: agent ? tab.quickCommandLabel : null,
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
    userTitle: (agent && tab?.customLabel?.trim()) || sessionNames.userTitle,
    providerTitle:
      sessionNames.providerTitle ??
      (agent === 'opencode' && isMeaningfulOpenCodeTerminalTitle(liveLabel) ? liveLabel : null),
    generatedTitle:
      sessionNames.generatedTitle ?? (generatedTitlesEnabled ? tab?.generatedLabel : null),
    liveTitle: agent ? resolveAgentConversationLiveTitle(liveLabel, agent, undefined) : liveLabel,
    labelTitle: agent ? tab?.quickCommandLabel : null,
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
