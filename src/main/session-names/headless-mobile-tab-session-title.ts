import { isTuiAgent } from '../../shared/agent-launch/catalog/tui-agent-config'
import { mintAgentSessionFallbackTitle } from '../../shared/agent-session-fallback-title'
import type { AgentStatusIpcPayload } from '../../shared/agent-status/contracts/agent-status-ipc-payload'
import { getAgentRowConversationName } from '../../shared/agent-status/presentation/agent-row-conversation-name'
import { structuredAgentSessionTabId } from '../../shared/agent-session/view/structured-agent-session-projection'
import { parsePaneKey } from '../../shared/workspace-layout/stable-pane-id'
import { resolveTerminalTabTitle } from '../../shared/workspace-layout/tab-groups/tab-title-resolution'
import type { AiVaultSessionTitle } from '../../shared/ai-vault/contracts/ai-vault-session-title'
import type { RuntimeMobileSessionTabsResult } from '../../shared/remote-runtime/session-graph/runtime-session-contracts'
import type { RuntimeWorktreeAgentSource } from '../runtime/workspaces/process-listing/runtime-worktree-agent-source'
import type { RuntimeOrchestrationSenderNames } from '../runtime/orchestration/mailbox/senders/runtime-orchestration-sender-names'
import {
  getCachedHostProviderTitleMap,
  mergeWorktreeAgentRowProviderTitle,
  resolveWorktreeAgentRowProviderNames,
  warmHostProviderSessionTitle,
  worktreeAgentRowProviderTitleKey
} from './worktree-agent-row-provider-names'

function collectHeadlessMobileTabSources(
  snapshots: readonly RuntimeMobileSessionTabsResult[]
): Map<string, RuntimeWorktreeAgentSource> {
  const sources = new Map<string, RuntimeWorktreeAgentSource>()
  for (const snapshot of snapshots) {
    for (const tab of snapshot.tabs) {
      if (tab.type !== 'terminal' || tab.resolvesSessionTitle === true) {
        continue
      }
      const status = tab.agentStatus
      const sessionId = status?.providerSession?.id?.trim()
      if (!status?.agentType || !sessionId || status.connectionId != null) {
        continue
      }
      sources.set(`${snapshot.worktree}:${tab.id}`, {
        paneKey: `${tab.parentTabId}:${tab.leafId}`,
        tabId: tab.parentTabId,
        worktreeId: snapshot.worktree,
        connectionId: null,
        state: status.state,
        agentType: status.agentType,
        providerSessionId: sessionId,
        prompt: status.prompt,
        lastAssistantMessage: status.lastAssistantMessage ?? null,
        toolName: status.toolName ?? null,
        toolInput: status.toolInput ?? null,
        interrupted: status.interrupted === true,
        stateStartedAt: status.stateStartedAt,
        updatedAt: status.updatedAt,
        ...(status.providerSession?.transcriptPath
          ? { transcriptPath: status.providerSession.transcriptPath }
          : {})
      })
    }
  }
  return sources
}

export async function warmHeadlessMobileSessionTabTitles(
  snapshots: readonly RuntimeMobileSessionTabsResult[],
  clientKind: 'mobile' | 'runtime' | undefined
): Promise<void> {
  if (clientKind !== 'mobile') {
    return
  }
  const sources = collectHeadlessMobileTabSources(snapshots)
  if (sources.size > 0) {
    await resolveWorktreeAgentRowProviderNames(sources)
  }
}

export function applyHeadlessMobileSessionTabTitles(
  snapshot: RuntimeMobileSessionTabsResult,
  clientKind: 'mobile' | 'runtime' | undefined,
  resolved: ReadonlyMap<string, AiVaultSessionTitle> = getCachedHostProviderTitleMap()
): RuntimeMobileSessionTabsResult {
  if (clientKind !== 'mobile') {
    return snapshot
  }
  let changed = false
  const tabs = snapshot.tabs.map((tab) => {
    if (tab.type !== 'terminal' || tab.resolvesSessionTitle === true) {
      return tab
    }
    const status = tab.agentStatus
    const sessionId = status?.providerSession?.id?.trim()
    const agent = status?.agentType
    if (!agent || !sessionId || status?.connectionId != null) {
      return tab
    }
    warmHostProviderSessionTitle({
      agent,
      sessionId,
      transcriptPath: status?.providerSession?.transcriptPath,
      connectionId: null
    })
    const isSplit = tab.parentLayout?.root?.type === 'split'
    const slot = resolved.get(worktreeAgentRowProviderTitleKey(agent, sessionId))
    if (!slot) {
      return tab
    }
    const mergedTab = isSplit
      ? {
          title: tab.title,
          customTitle: null,
          aiVaultTitle: slot,
          launchAgent: isTuiAgent(agent) ? agent : tab.launchAgent
        }
      : {
          ...mergeWorktreeAgentRowProviderTitle(
            {
              title: tab.title,
              customTitle: tab.customTitle ?? null,
              quickCommandLabel: tab.quickCommandLabel,
              generatedTitle: tab.generatedTitle,
              aiVaultTitle: tab.aiVaultTitle
            },
            { agentType: agent, providerSessionId: sessionId, connectionId: null },
            resolved
          )!,
          launchAgent: tab.launchAgent ?? (isTuiAgent(agent) ? agent : undefined)
        }
    const nextTitle = resolveTerminalTabTitle(mergedTab, !isSplit, tab.title)
    const nextAiVaultTitle = mergedTab.aiVaultTitle ?? tab.aiVaultTitle
    if (nextTitle === tab.title && nextAiVaultTitle === tab.aiVaultTitle) {
      return tab
    }
    changed = true
    return {
      ...tab,
      title: nextTitle,
      ...(nextAiVaultTitle ? { aiVaultTitle: nextAiVaultTitle } : {})
    }
  })
  return changed ? { ...snapshot, tabs } : snapshot
}

export function warmWindowlessTerminalNotificationTitle(row: AgentStatusIpcPayload): void {
  warmHostProviderSessionTitle({
    agent: row.agentType,
    sessionId: row.providerSession?.id,
    transcriptPath: row.providerSession?.transcriptPath,
    connectionId: row.connectionId
  })
}

export function resolveWindowlessRowNotificationTitle(
  row: AgentStatusIpcPayload,
  liveTerminalTitle?: string | null
): string | undefined {
  const sessionId = row.providerSession?.id?.trim()
  const agent = row.agentType ?? null
  const tab = mergeWorktreeAgentRowProviderTitle(
    null,
    { agentType: agent, providerSessionId: sessionId, connectionId: row.connectionId },
    getCachedHostProviderTitleMap()
  )
  const identityFallbackTitle =
    agent && sessionId && isTuiAgent(agent)
      ? mintAgentSessionFallbackTitle(agent, sessionId)
      : undefined
  const resolvedTab =
    tab ?? (identityFallbackTitle || liveTerminalTitle ? { title: '', customTitle: null } : null)
  if (!resolvedTab) {
    return undefined
  }
  return (
    getAgentRowConversationName(resolvedTab, agent, false, liveTerminalTitle, {
      providerSessionId: sessionId,
      identityFallbackTitle
    })?.trim() || undefined
  )
}

export function resolveWindowlessTerminalNotificationTitle(args: {
  senderNames: Pick<RuntimeOrchestrationSenderNames, 'agentRowNamer'>
  worktreeId: string
  paneKey: string
  ptyId?: string | null
  row: AgentStatusIpcPayload
}): string | undefined {
  const tabId = args.row.tabId ?? parsePaneKey(args.paneKey)?.tabId
  const name = args.senderNames.agentRowNamer(getCachedHostProviderTitleMap(), {
    mintIdentityFallback: true
  })({
    paneKey: args.paneKey,
    tabId,
    worktreeId: args.worktreeId,
    ptyId: args.ptyId ?? undefined,
    agentType: args.row.agentType ?? null,
    providerSessionId: args.row.providerSession?.id,
    connectionId: args.row.connectionId
  })
  return name?.trim() || undefined
}

export function resolveStructuredMobileNotificationTitle(args: {
  senderNames: Pick<RuntimeOrchestrationSenderNames, 'agentRowNamer'>
  workspaceId: string
  sessionId: string
  roomLabel?: string | null
}): string | undefined {
  const room = args.roomLabel?.trim()
  if (room) {
    return room
  }
  const tabId = structuredAgentSessionTabId(args.sessionId)
  const name = args.senderNames.agentRowNamer()({
    paneKey: `${tabId}:${args.sessionId}`,
    tabId,
    worktreeId: args.workspaceId,
    agentType: null
  })
  return name?.trim() || undefined
}
