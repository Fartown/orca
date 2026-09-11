import { getAgentRowConversationName } from '../../../../shared/agent-row-conversation-name'
import { mintAgentSessionFallbackTitle } from '../../../../shared/agent-session-fallback-title'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import { resolveAgentRowPaneLiveTitle } from './agent-row-pane-live-title'
import { useAppStore } from '@/store'
import { useCanonicalSessionTitle } from '@/lib/canonical-session-titles'
import { useSessionNameRecord } from '@/session-names/session-name-subscriptions'
import { isAiVaultTitleAgent } from '../../../../shared/ai-vault-session-title'
import { projectSessionNameSlot } from '../../../../shared/session-names/session-name-slot'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import type { AppState } from '@/store/types'
import type { DashboardAgentRow } from './useDashboardData'

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

/** The row's conversation name, or null when nothing usable exists. */
export function useAgentRowConversationName(agent: DashboardAgentRow): string | null {
  const parentPaneKey = agent.entry.orchestration?.parentPaneKey
  const usesParentTab =
    agent.lineage?.depth === 1 &&
    parentPaneKey !== undefined &&
    parsePaneKey(parentPaneKey)?.tabId === agent.tab.id
  const cannotOwnTabName = agent.rowSource === 'subagent' || usesParentTab
  const generatedTitlesEnabled = useAppStore(
    (s) => !cannotOwnTabName && s.settings?.tabAutoGenerateTitle === true
  )
  const liveTab = useAppStore((s) =>
    cannotOwnTabName
      ? undefined
      : getIndexedTab(s.tabsByWorktree[agent.tab.worktreeId], agent.tab.id)
  )
  const executionHostId = useAppStore((s) => getExecutionHostIdForWorktree(s, agent.tab.worktreeId))
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
  // Why: parsed per render rather than inside the selector, which runs on every
  // store update and must stay allocation-free.
  const ownLeafId = cannotOwnTabName ? null : parsePaneKey(agent.paneKey)?.leafId
  // Why: in a split tab the tab title belongs to whichever pane has focus, so
  // this row reads its OWN pane's title. Returns a primitive, so a row
  // re-renders only when its own pane's title changes.
  const paneLiveTitle = useAppStore((s) =>
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
    return null
  }
  // Why: retained row snapshots need a fallback after their live tab disappears.
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
  return getAgentRowConversationName(
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
}
