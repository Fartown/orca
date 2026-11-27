import { isTuiAgent } from '../../shared/agent-launch/catalog/tui-agent-config'
import { mintAgentSessionFallbackTitle } from '../../shared/agent-session-fallback-title'
import type { AgentType } from '../../shared/agent-status/contracts/agent-status-types'
import {
  getAgentRowConversationName,
  type ConversationNameTab
} from '../../shared/agent-status/presentation/agent-row-conversation-name'
import { structuredAgentSessionTabId } from '../../shared/agent-session/view/structured-agent-session-projection'
import { structuredAgentSessionIdFromTabId } from '../../shared/agent-session/view/structured-agent-session-tab-id'
import type { SenderHookRow } from '../runtime/orchestration/mailbox/senders/orchestration-sender-name'
import {
  getCachedHostProviderTitleMap,
  mergeWorktreeAgentRowProviderTitle,
  warmHostProviderSessionTitle
} from './worktree-agent-row-provider-names'

export function resolveHostTerminalTabWithCachedTitle(
  paneTab: ConversationNameTab | null,
  args: {
    agent: AgentType | null
    providerSessionId: string | undefined
    connectionId: string | null
    wslDistro?: string | null
  }
): ConversationNameTab | null {
  const effectiveConnectionId = args.wslDistro ? `wsl:${args.wslDistro}` : args.connectionId
  warmHostProviderSessionTitle({
    agent: args.agent,
    sessionId: args.providerSessionId,
    connectionId: effectiveConnectionId
  })
  return mergeWorktreeAgentRowProviderTitle(
    paneTab,
    {
      agentType: args.agent,
      providerSessionId: args.providerSessionId,
      connectionId: effectiveConnectionId
    },
    getCachedHostProviderTitleMap()
  )
}

export function resolveHostAgentRowConversationName(args: {
  tabId?: string
  worktreeId?: string
  paneKey: string
  ptyId?: string | null
  agentType: AgentType | null
  providerSessionId?: string
  baseOptions: { providerSessionId: string | undefined }
  generatedTitlesEnabled: boolean
  mintIdentityFallback?: boolean
  readStructuredChatName: (chatSessionId: string) => string | null
  readPaneNaming: (
    record: { worktreeId: string; tabId: string; ptyId: string | null },
    paneKey: string
  ) => { tab: ConversationNameTab | null; paneTitle?: string | null }
  mergeTab: (tab: ConversationNameTab | null) => ConversationNameTab | null
}): string | null {
  if (args.tabId) {
    const chatSessionId = structuredAgentSessionIdFromTabId(args.tabId)
    if (chatSessionId !== null) {
      return args.readStructuredChatName(chatSessionId)
    }
  }
  const pane =
    args.tabId && args.worktreeId
      ? args.readPaneNaming(
          { worktreeId: args.worktreeId, tabId: args.tabId, ptyId: args.ptyId ?? null },
          args.paneKey
        )
      : { tab: null, paneTitle: undefined }
  const tab = args.mergeTab(pane.tab)
  const sessionId = args.baseOptions.providerSessionId
  const identityFallbackTitle =
    args.mintIdentityFallback && args.agentType && sessionId && isTuiAgent(args.agentType)
      ? mintAgentSessionFallbackTitle(args.agentType, sessionId)
      : undefined
  const resolvedTab = tab ?? (identityFallbackTitle ? { title: '', customTitle: null } : null)
  return resolvedTab
    ? getAgentRowConversationName(
        resolvedTab,
        args.agentType,
        args.generatedTitlesEnabled,
        pane.paneTitle,
        {
          ...args.baseOptions,
          ...(identityFallbackTitle ? { identityFallbackTitle } : {})
        }
      )
    : null
}

export function indexCrewSenderStatusRows(
  allStatuses: readonly SenderHookRow[] | undefined
): Map<string, SenderHookRow[]> {
  const statuses = new Map<string, SenderHookRow[]>()
  for (const row of allStatuses ?? []) {
    const rows = statuses.get(row.paneKey) ?? []
    rows.push({
      paneKey: row.paneKey,
      worktreeId: row.worktreeId,
      agentType: row.agentType,
      providerSession: row.providerSession
        ? { key: row.providerSession.key, id: row.providerSession.id }
        : row.providerSession,
      receivedAt: row.receivedAt,
      connectionId: row.connectionId,
      launchToken: row.launchToken
    })
    statuses.set(row.paneKey, rows)
  }
  return statuses
}

export function resolveHostStructuredChatNotificationName(
  namer: (source: {
    paneKey: string
    tabId: string
    worktreeId: string
    agentType: null
  }) => string | null,
  scope: { workspaceId: string },
  sessionId: string
): string | undefined {
  const tabId = structuredAgentSessionTabId(sessionId)
  return (
    namer({
      paneKey: `${tabId}:${sessionId}`,
      tabId,
      worktreeId: scope.workspaceId,
      agentType: null
    })?.trim() || undefined
  )
}
