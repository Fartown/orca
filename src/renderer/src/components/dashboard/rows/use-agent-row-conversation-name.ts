import { useAppStateValue } from '@/store/retained-views/app-state-view'
import { getAgentRowConversationName } from '../../../../../shared/agent-status/presentation/agent-row-conversation-name'
import { mintAgentSessionFallbackTitle } from '../../../../../shared/agent-session-fallback-title'
import { parsePaneKey } from '../../../../../shared/workspace-layout/stable-pane-id'
import { isTuiAgent } from '../../../../../shared/agent-launch/catalog/tui-agent-config'
import { structuredChatDisplayName } from '../../../../../shared/agent-session/view/structured-chat-row-name'
import { resolveAgentRowPaneLiveTitle } from './agent-row-pane-live-title'
import { useCanonicalSessionTitle } from '@/lib/canonical-session-titles'
import { useSessionNameRecord } from '@/session-names/session-name-subscriptions'
import { isAiVaultTitleAgent } from '../../../../../shared/ai-vault/contracts/ai-vault-session-title'
import { projectSessionNameSlot } from '../../../../../shared/session-names/session-name-slot'
import { getExecutionHostIdForWorktree } from '@/lib/workspace/ownership/worktree-runtime-owner'
import { structuredChatTabById } from '@/lib/agent-session/tab-identity/structured-chat-tab-index'
import { useStructuredChatTabNaming } from '@/runtime/native-chat/naming/structured-conversation-name'
import type { AppState } from '@/store/types'
import type { DashboardAgentRow } from './dashboard-agent-row'

type WorktreeTabs = NonNullable<AppState['tabsByWorktree'][string]>

const tabIndexByTabs = new WeakMap<WorktreeTabs, ReadonlyMap<string, WorktreeTabs[number]>>()

function getIndexedTab(
  tabs: WorktreeTabs | undefined,
  tabId: string
): WorktreeTabs[number] | undefined {
  if (!tabs) {
    return undefined
  }
  let tabIndex = tabIndexByTabs.get(tabs)
  if (!tabIndex) {
    tabIndex = new Map(tabs.map((tab) => [tab.id, tab]))
    tabIndexByTabs.set(tabs, tabIndex)
  }
  return tabIndex.get(tabId)
}

export function useAgentRowConversationName(agent: DashboardAgentRow): string | null {
  return useAgentRowConversationNaming(agent).name
}

/** The row's name, and whether it names a forked native chat (drawn with the fork mark). */
export function useAgentRowConversationNaming(agent: DashboardAgentRow): {
  name: string | null
  forked: boolean
} {
  const parentPaneKey = agent.entry.orchestration?.parentPaneKey
  const usesParentTab =
    agent.lineage?.depth === 1 &&
    parentPaneKey !== undefined &&
    parsePaneKey(parentPaneKey)?.tabId === agent.tab.id
  const cannotOwnTabName = agent.rowSource === 'subagent' || usesParentTab
  const generatedTitlesEnabled = useAppStateValue(
    (s) => !cannotOwnTabName && s.settings?.tabAutoGenerateTitle === true
  )
  const liveTab = useAppStateValue((s) =>
    cannotOwnTabName
      ? undefined
      : getIndexedTab(s.tabsByWorktree[agent.tab.worktreeId], agent.tab.id)
  )
  const executionHostId = useAppStateValue((s) =>
    getExecutionHostIdForWorktree(s, agent.tab.worktreeId)
  )
  const rowSessionId = agent.entry.providerSession?.id
  const userTitle = useCanonicalSessionTitle(executionHostId, agent.agentType, rowSessionId)
  const nameRecord = useSessionNameRecord(
    !cannotOwnTabName && rowSessionId && isAiVaultTitleAgent(agent.agentType)
      ? {
          executionHostId,
          agent: agent.agentType,
          sessionId: rowSessionId,
          ...(agent.entry.providerSession?.transcriptPath
            ? { transcriptPath: agent.entry.providerSession.transcriptPath }
            : {})
        }
      : null
  )
  const structuredTab = useAppStateValue((s) =>
    cannotOwnTabName
      ? undefined
      : structuredChatTabById(s.unifiedTabsByWorktree, agent.tab.worktreeId, agent.tab.id)
  )
  const chatNaming = useStructuredChatTabNaming(structuredTab)
  const conversationName = chatNaming.name
  // Parse once per render; selectors run on every store write and must stay allocation-free.
  const ownLeafId = cannotOwnTabName ? null : parsePaneKey(agent.paneKey)?.leafId
  // Select this split pane’s primitive title so sibling focus/title changes cannot rename or re-render its row.
  const paneLiveTitle = useAppStateValue((s) =>
    cannotOwnTabName
      ? undefined
      : resolveAgentRowPaneLiveTitle(
          s.terminalLayoutsByTabId?.[agent.tab.id],
          s.runtimePaneTitlesByTabId?.[agent.tab.id],
          ownLeafId
        )
  )
  // Why: synthetic and same-tab child rows do not own the parent tab's name.
  if (cannotOwnTabName) {
    return { name: null, forked: false }
  }
  const structuredName =
    structuredTab &&
    structuredChatDisplayName(structuredTab.customLabel, conversationName, structuredTab.label)
  if (structuredName) {
    return { name: structuredName, forked: chatNaming.forkSourceId !== null }
  }
  // Why: attributed rows can arrive before their tab metadata.
  const tab = liveTab ?? agent.tab
  // The aiVaultTitle slot is per-tab but names ONE pane's session; in a split
  // tab a sibling row must not wear the winning pane's conversation name.
  const slotNamesThisRow =
    tab.aiVaultTitle == null ||
    (tab.aiVaultTitle.agent === agent.agentType && tab.aiVaultTitle.sessionId === rowSessionId)
  const ownSlot = slotNamesThisRow ? tab.aiVaultTitle : null
  const aiVaultTitle = nameRecord
    ? projectSessionNameSlot({
        agent: nameRecord.agent,
        sessionId: nameRecord.sessionId,
        previous: ownSlot,
        title: nameRecord,
        manualTitle: userTitle ?? null
      })
    : ownSlot
  const name = getAgentRowConversationName(
    aiVaultTitle === tab.aiVaultTitle ? tab : { ...tab, aiVaultTitle },
    agent.agentType,
    generatedTitlesEnabled,
    paneLiveTitle,
    {
      userTitle,
      identityFallbackTitle:
        rowSessionId && isTuiAgent(agent.agentType)
          ? mintAgentSessionFallbackTitle(agent.agentType, rowSessionId)
          : null
    }
  )
  return { name, forked: false }
}
