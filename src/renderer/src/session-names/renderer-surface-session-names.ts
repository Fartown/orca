import { isTuiAgent } from '../../../shared/agent-launch/catalog/tui-agent-config'
import { mintAgentSessionFallbackTitle } from '../../../shared/agent-session-fallback-title'
import type {
  AgentStatusEntry,
  AgentType
} from '../../../shared/agent-status/contracts/agent-status-types'
import {
  isAiVaultTitleAgent,
  type AiVaultSessionTitle
} from '../../../shared/ai-vault/contracts/ai-vault-session-title'
import { structuredChatDisplayName } from '../../../shared/agent-session/view/structured-chat-row-name'
import { findBotGroupRoomOfSession, isBotGroupMemberSession } from '../../../shared/bots/bot-group'
import {
  parseExecutionHostId,
  type ExecutionHostId
} from '../../../shared/execution-host/execution-host'
import { projectSessionNameSlot } from '../../../shared/session-names/session-name-slot'
import { parsePaneKey } from '../../../shared/workspace-layout/stable-pane-id'
import {
  resolveTerminalTabTitle,
  resolveUnifiedTabLabel
} from '../../../shared/workspace-layout/tab-groups/tab-title-resolution'
import type { StructuredTab } from '@/components/native-chat/session/status/structured-agent-session-tabs'
import { tabFromWorktreeAttributedStatusEntry } from '@/components/sidebar/workspace-card/activity/worktree-agent-row-fallback-tab'
import { resolveAgentRowPaneLiveTitle } from '@/components/dashboard/rows/agent-row-pane-live-title'
import { getReachableRuntimeEnvironmentIds } from '@/hooks/ipc-events/runtime-events/runtime-environment-subscription-selection'
import { readBots } from '@/lib/bot-catalog'
import { readBotGroups } from '@/lib/bot-group-catalog-snapshot'
import { canonicalSessionTitleKey, getCanonicalSessionTitle } from '@/lib/canonical-session-titles'
import { getExecutionHostIdForWorktree } from '@/lib/workspace/ownership/worktree-runtime-owner'
import { getStructuredChatTabNames } from '@/runtime/native-chat/naming/structured-chat-name-observation'
import { projectedStructuredChatTabSavedName } from '@/runtime/native-chat/naming/structured-chat-tab-name'
import { folderWorkspaceKey } from '../../../shared/workspace/identity/workspace-scope'
import type { AppState } from '@/store/types'
import { useAppStore } from '@/store'
import type { TerminalTab } from '../../../shared/workspace-layout/terminal-tab-types'
import { livePaneNameSession, sessionNameSlotForPane } from './live-pane-name-session'
import { getActivitySessionName } from './activity-session-name'
import { sessionNameStore } from './session-name-store'

export function captureStructuredNotificationSessionName(
  _state: AppState,
  tab: StructuredTab
): string | undefined {
  if (isBotGroupMemberSession(tab.entityId)) {
    const room = findBotGroupRoomOfSession(readBotGroups(), tab.entityId)
    const roomName = room?.group.name?.trim()
    if (roomName) {
      return roomName
    }
  }
  const bot = readBots().find(
    (candidate) => folderWorkspaceKey(candidate.folderWorkspaceId) === tab.worktreeId
  )
  const botName = bot?.name?.trim()
  if (botName) {
    return botName
  }
  const savedName = projectedStructuredChatTabSavedName(tab, getStructuredChatTabNames())
  const resolved = structuredChatDisplayName(tab.customLabel, savedName, tab.label)
  return resolved.trim() || undefined
}

export function resolveDashboardCardSessionSlot({
  tab,
  entry,
  agentType
}: {
  tab: TerminalTab
  entry: AgentStatusEntry
  agentType: AgentType
}): {
  aiVaultTitle: AiVaultSessionTitle | null | undefined
  userTitle: string | undefined
  identityFallbackTitle: string | null
} {
  const state = typeof useAppStore.getState === 'function' ? useAppStore.getState() : undefined
  const host = state ? getExecutionHostIdForWorktree(state, tab.worktreeId) : 'local'
  const sessionId = livePaneNameSession(state, entry, host)?.id
  const ownSlot = sessionNameSlotForPane(tab, agentType, sessionId)
  const hostNamed = ownSlot && tab.sessionTitleFromHost
  const transcriptPath = entry.providerSession?.transcriptPath
  const userTitle =
    !hostNamed && sessionId ? getCanonicalSessionTitle(host, agentType, sessionId) : undefined
  const record =
    !hostNamed && sessionId
      ? sessionNameStore.getSnapshot().get(canonicalSessionTitleKey(host, agentType, sessionId))
      : undefined
  if (
    entry.providerSession &&
    !record &&
    !ownSlot &&
    agentType &&
    sessionId &&
    isAiVaultTitleAgent(agentType) &&
    typeof window !== 'undefined' &&
    typeof window.api?.aiVault?.resolveSessionTitles === 'function'
  ) {
    const parsed = parseExecutionHostId(host)
    const canReadHost =
      parsed?.kind === 'local' ||
      (parsed?.kind === 'runtime' &&
        state !== undefined &&
        getReachableRuntimeEnvironmentIds(state).includes(parsed.environmentId))
    if (canReadHost) {
      void sessionNameStore.read([
        {
          executionHostId: host,
          agent: agentType,
          sessionId,
          ...(transcriptPath ? { transcriptPath } : {})
        }
      ])
    }
  }
  const aiVaultTitle = record
    ? projectSessionNameSlot({
        agent: record.agent,
        sessionId: record.sessionId,
        previous: ownSlot,
        title: record,
        manualTitle: userTitle ?? null
      })
    : ownSlot
  const identityFallbackTitle =
    agentType && sessionId && isTuiAgent(agentType)
      ? mintAgentSessionFallbackTitle(agentType, sessionId)
      : null
  return { aiVaultTitle, userTitle, identityFallbackTitle }
}

export function resolveSidebarSlotTargetSessionName(
  state: AppState,
  target: {
    worktreeId: string
    executionHostId?: ExecutionHostId
    paneKey: string | null
    tabId?: string
    agentType: AgentType | null
    entry: AgentStatusEntry | null
  }
): string | null {
  const generatedTitlesEnabled = state.settings?.tabAutoGenerateTitle === true
  if (target.entry) {
    const entry = target.entry
    const pane = parsePaneKey(entry.paneKey)
    const tabId = target.tabId ?? entry.tabId ?? pane?.tabId
    const parent = entry.orchestration?.parentPaneKey
    if (parent && (target.paneKey === parent || (tabId && parsePaneKey(parent)?.tabId === tabId))) {
      return null
    }
    const unified = tabId
      ? state.unifiedTabsByWorktree[target.worktreeId]?.find((item) => item.id === tabId)
      : undefined
    if (unified?.contentType === 'agent-session') {
      const savedName = projectedStructuredChatTabSavedName(unified, getStructuredChatTabNames())
      return structuredChatDisplayName(unified.customLabel, savedName, unified.label) || null
    }
    const tab =
      (tabId
        ? state.tabsByWorktree[target.worktreeId]?.find((item) => item.id === tabId)
        : undefined) ?? tabFromWorktreeAttributedStatusEntry(entry, entry.stateStartedAt, unified)
    if (!tab) {
      return null
    }
    const host = target.executionHostId ?? getExecutionHostIdForWorktree(state, target.worktreeId)
    const sessionId = livePaneNameSession(state, entry, host)?.id
    const hostNamed =
      tab.sessionTitleFromHost && sessionNameSlotForPane(tab, entry.agentType, sessionId)
    const agent = entry.agentType
    const record =
      !hostNamed && agent && sessionId
        ? sessionNameStore.getSnapshot().get(canonicalSessionTitleKey(host, agent, sessionId))
        : undefined
    const manualTitle =
      !hostNamed && agent && sessionId
        ? getCanonicalSessionTitle(host, agent, sessionId)
        : undefined
    const layout = state.terminalLayoutsByTabId[tab.id]
    const ownsContainer =
      layout?.root?.type !== 'split' && (!layout?.root || layout.root.leafId === pane?.leafId)
    const paneLiveTitle = resolveAgentRowPaneLiveTitle(
      layout,
      state.runtimePaneTitlesByTabId[tab.id],
      pane?.leafId
    )
    return getActivitySessionName(entry, tab, generatedTitlesEnabled, {
      sessionId,
      record,
      manualTitle,
      ownsContainer,
      paneLiveTitle
    })
  }
  if (target.tabId !== undefined) {
    const terminal = state.tabsByWorktree[target.worktreeId]?.find((tab) => tab.id === target.tabId)
    if (terminal) {
      return resolveTerminalTabTitle(terminal, generatedTitlesEnabled, terminal.title) || null
    }
    const unified = state.unifiedTabsByWorktree[target.worktreeId]?.find(
      (tab) => tab.id === target.tabId
    )
    if (unified) {
      return resolveUnifiedTabLabel(unified, generatedTitlesEnabled, unified.label) || null
    }
  }
  return null
}
