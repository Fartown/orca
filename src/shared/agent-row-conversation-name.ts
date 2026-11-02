// Conversation names share the Provider-first order; task/status previews remain separate.
import type { AgentType } from './agent-status-types'
import { isClaudeManagementTitle } from './agent-title-core'
import { stripLeadingAgentTitleDecorationOrEmpty } from './agent-title-decoration'
import { formatAgentTypeLabel } from './agent-type-label'
import { isJcodeIdentityTerminalTitle } from './jcode-terminal-title'
import { isMeaningfulOpenCodeTerminalTitle } from './opencode-terminal-title'
import { SYNTHETIC_AGENT_TITLE_PROFILES } from './synthetic-agent-title'
import type { TerminalTab } from './terminal-tab-types'
import { resolveSessionDisplayTitle } from './session-display-title'
import { sessionNameSlotCandidates } from './session-names/session-name-slot'

export type ConversationNameTab = Pick<
  TerminalTab,
  'customTitle' | 'quickCommandLabel' | 'aiVaultTitle' | 'generatedTitle' | 'title' | 'defaultTitle'
>

export type AgentRowConversationNameOptions = {
  /** Omission keeps legacy lookup; explicit undefined means the caller found no owning session. */
  providerSessionId?: string
  userTitle?: string | null
  identityFallbackTitle?: string | null
}

// Synthetic status labels describe state rather than a conversation name.
const SYNTHETIC_STATUS_TITLES_LOWER: ReadonlySet<string> = new Set(
  Object.values(SYNTHETIC_AGENT_TITLE_PROFILES).flatMap((profile) => [
    profile.workingLabel.toLowerCase(),
    profile.permissionLabel.toLowerCase(),
    profile.idleLabel.toLowerCase()
  ])
)

// Retained-tab fallback Agent is a placeholder, never a conversation name.
const FALLBACK_TAB_TITLE_LOWER = 'agent'

const AGENT_IDENTITY_ALIASES_LOWER: Readonly<Record<string, readonly string[]>> = {
  claude: ['claude code'],
  gemini: ['gemini cli']
}

const STATUS_WITH_CONTEXT_RE = /^(?:ready|idle|done)(?:\s+\([^)]*\))?$/i
const DEFAULT_TERMINAL_TITLE_RE = /^terminal \d+$/i

function isIdentityStatusTitle(titleLower: string, identityLower: string): boolean {
  return (
    titleLower === identityLower ||
    titleLower === `${identityLower} ready` ||
    titleLower === `${identityLower} idle` ||
    titleLower === `${identityLower} done` ||
    titleLower === `${identityLower} working` ||
    titleLower === `${identityLower} thinking` ||
    titleLower === `${identityLower} running` ||
    titleLower === `${identityLower} - action required`
  )
}

function isAgentIdentityStatusTitle(
  titleLower: string,
  agentType: AgentType | null | undefined,
  agentTypeLabelLower: string
): boolean {
  if (isIdentityStatusTitle(titleLower, agentTypeLabelLower)) {
    return true
  }
  return (
    AGENT_IDENTITY_ALIASES_LOWER[agentType ?? '']?.some((identity) =>
      isIdentityStatusTitle(titleLower, identity)
    ) ?? false
  )
}

function isCwdLikeTitle(title: string): boolean {
  // Hookless SSH titles may contain only spinner+cwd, never a conversation name (#8711).
  if (/^(?:~|[\\/]|[A-Za-z]:[\\/])/.test(title)) {
    return true
  }
  // A single path-ish token ("orca/workspaces") is still a cwd, not a name.
  return !/\s/.test(title) && /[\\/]/.test(title)
}

export function resolveAgentConversationLiveTitle(
  liveTitle: string,
  agentType: AgentType | null | undefined,
  defaultTitle: string | undefined
): string | null {
  const stripped = stripLeadingAgentTitleDecorationOrEmpty(liveTitle.trim()).trim()
  if (!stripped) {
    return null
  }
  const lower = stripped.toLowerCase()
  if (
    SYNTHETIC_STATUS_TITLES_LOWER.has(lower) ||
    lower === FALLBACK_TAB_TITLE_LOWER ||
    isAgentIdentityStatusTitle(lower, agentType, formatAgentTypeLabel(agentType).toLowerCase()) ||
    STATUS_WITH_CONTEXT_RE.test(stripped) ||
    DEFAULT_TERMINAL_TITLE_RE.test(stripped) ||
    isClaudeManagementTitle(stripped) ||
    // jcode repaints codename/diff/duration each second; accepting that identity hides the prompt preview.
    isJcodeIdentityTerminalTitle(stripped) ||
    isCwdLikeTitle(stripped)
  ) {
    return null
  }
  if (defaultTitle && stripped === defaultTitle.trim()) {
    return null
  }
  return stripped
}

/** Return null without a usable name so the row retains its last-message label. */
export function getAgentRowConversationName(
  tab: ConversationNameTab,
  agentType: AgentType | null | undefined,
  generatedTitlesEnabled: boolean,
  // Tab live title names the focused pane; split callers supply their own title/null. Container aliases and generated titles cannot name an unidentified sibling.
  paneLiveTitle?: string | null,
  options: AgentRowConversationNameOptions = {}
): string | null {
  const liveTitle =
    paneLiveTitle === undefined ? (tab.title?.trim() ?? '') : (paneLiveTitle?.trim() ?? '')
  const slot =
    Object.hasOwn(options, 'providerSessionId') &&
    (!options.providerSessionId ||
      tab.aiVaultTitle?.sessionId !== options.providerSessionId ||
      tab.aiVaultTitle.agent !== agentType)
      ? undefined
      : tab.aiVaultTitle
  const sessionNames = sessionNameSlotCandidates(slot)
  const resolved = resolveSessionDisplayTitle({
    ...sessionNames,
    userTitle: options.userTitle ?? sessionNames.userTitle,
    providerTitle:
      sessionNames.providerTitle ??
      (agentType === 'opencode' && isMeaningfulOpenCodeTerminalTitle(liveTitle) ? liveTitle : null),
    generatedTitle:
      sessionNames.generatedTitle ??
      (generatedTitlesEnabled && paneLiveTitle === undefined ? tab.generatedTitle : null),
    liveTitle: liveTitle
      ? resolveAgentConversationLiveTitle(liveTitle, agentType, tab.defaultTitle)
      : null,
    labelTitle:
      paneLiveTitle === undefined ? tab.customTitle?.trim() || tab.quickCommandLabel : null,
    identityFallbackTitle: options.identityFallbackTitle
  })
  return resolved?.title ?? null
}
