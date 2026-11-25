import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../store'
import type {
  ActivityEvent,
  ActivityLiveAgentSnapshot
} from '../components/activity/threads/activity-thread-types'
import {
  buildActivityTabHostIndex,
  resolveActivityExecutionHostId
} from '../components/activity/events/activity-event-builder-context'
import { resolveAgentRowPaneLiveTitle } from '../components/dashboard/rows/agent-row-pane-live-title'
import { canonicalSessionTitleKey, getCanonicalSessionTitle } from '../lib/canonical-session-titles'
import { isAiVaultTitleAgent } from '../../../shared/ai-vault/contracts/ai-vault-session-title'
import { getWorktreeExecutionHostId } from '../../../shared/execution-host/execution-host'
import { parsePaneKey } from '../../../shared/workspace-layout/stable-pane-id'
import { getActivitySessionName } from './activity-session-name'
import { useSessionNameIndex } from './session-name-subscriptions'
import { sessionNameStore, type SessionNameRequest } from './session-name-store'

export type ActivitySessionNameTarget = ActivityEvent | ActivityLiveAgentSnapshot

export function useActivitySessionNames(
  events: ActivityEvent[],
  live: Record<string, ActivityLiveAgentSnapshot>
) {
  const state = useAppStore(
    useShallow((s) => ({
      layouts: s.terminalLayoutsByTabId,
      paneTitles: s.runtimePaneTitlesByTabId,
      tabs: s.unifiedTabsByWorktree,
      status: s.agentStatusByPaneKey,
      sleeping: s.sleepingAgentSessionsByPaneKey,
      generated: s.settings?.tabAutoGenerateTitle === true
    }))
  )
  const hostIndex = useMemo(() => buildActivityTabHostIndex(state.tabs), [state.tabs])
  const chatTabIds = useMemo(
    () =>
      new Set(
        Object.values(state.tabs ?? {}).flatMap((tabs) =>
          tabs.filter((tab) => tab.contentType === 'agent-session').map((tab) => tab.id)
        )
      ),
    [state.tabs]
  )
  const hostFor = useCallback(
    (target: ActivitySessionNameTarget) => {
      const leafId = parsePaneKey(target.entry.paneKey)?.leafId
      const ptyId =
        (leafId ? state.layouts[target.tab.id]?.ptyIdsByLeafId?.[leafId] : undefined) ??
        target.tab.ptyId
      const worktreeHost = getWorktreeExecutionHostId(target.worktree, target.repo ?? undefined)
      const resolved = resolveActivityExecutionHostId(
        { worktreeId: target.worktree.id, tab: target.tab },
        target.entry,
        ptyId,
        hostIndex
      )
      if (
        resolved === 'local' &&
        target.entry.connectionId === null &&
        worktreeHost.startsWith('runtime:')
      ) {
        return worktreeHost
      }
      return resolved ?? worktreeHost
    },
    [hostIndex, state.layouts]
  )
  const requests = useMemo(() => {
    const unique = new Map<string, SessionNameRequest>()
    for (const target of [...events, ...Object.values(live)]) {
      const agent = target.entry.agentType
      const session = target.entry.providerSession
      if (!agent || !session?.id || !isAiVaultTitleAgent(agent)) {
        continue
      }
      const executionHostId = hostFor(target)
      unique.set(canonicalSessionTitleKey(executionHostId, agent, session.id), {
        executionHostId,
        agent,
        sessionId: session.id,
        ...(session.transcriptPath ? { transcriptPath: session.transcriptPath } : {})
      })
    }
    return [...unique.values()]
  }, [events, live, hostFor])
  const names = useSessionNameIndex(requests)
  return useCallback(
    (target: ActivitySessionNameTarget) => {
      const { entry, tab } = target
      const sessionId = entry.providerSession?.id
      const agent = entry.agentType
      const host = hostFor(target)
      const key = agent && sessionId ? canonicalSessionTitleKey(host, agent, sessionId) : null
      const record = key ? sessionNameStore.getSnapshot().get(key) : undefined
      const pane = parsePaneKey(entry.paneKey)
      const layout = state.layouts[tab.id]
      const current = state.status.get(entry.paneKey)
      const sleeping = state.sleeping?.[entry.paneKey]
      const ownsSession = sessionId
        ? current
          ? current.agentType === agent && current.providerSession?.id === sessionId
          : Boolean(
              agent &&
              ((sleeping?.agent === agent && sleeping.providerSession?.id === sessionId) ||
                (tab.aiVaultTitle?.agent === agent && tab.aiVaultTitle.sessionId === sessionId))
            )
        : Boolean(
            current &&
            current.agentType === agent &&
            !current.providerSession?.id &&
            current.stateStartedAt === entry.stateStartedAt
          )
      const isChatTab = chatTabIds.has(tab.id)
      const isSinglePaneContainer =
        layout?.root?.type !== 'split' && (!layout?.root || layout.root.leafId === pane?.leafId)
      // A native chat tab holds exactly one session, so its label names that session.
      const ownsContainer = isChatTab || (ownsSession && isSinglePaneContainer)
      const paneLiveTitle = ownsSession
        ? resolveAgentRowPaneLiveTitle(layout, state.paneTitles[tab.id], pane?.leafId)
        : null
      // A native chat's projected customTitle is its host-saved name, the one its tab shows.
      const chatSavedName = isChatTab ? tab.customTitle : null
      // The confirmed index already ranks shared manual names; a tab-level one still outranks it.
      const tabManualName = ownsContainer ? tab.customTitle?.trim() : undefined
      const confirmedName =
        !tabManualName && key && record?.providerName?.kind === 'named' ? names.get(key) : undefined
      if (confirmedName) {
        return confirmedName
      }
      return getActivitySessionName(entry, tab, state.generated, {
        record,
        manualTitle:
          (agent && sessionId ? getCanonicalSessionTitle(host, agent, sessionId) : undefined) ??
          chatSavedName ??
          undefined,
        ownsContainer,
        paneLiveTitle
      })
      // Public name changes are independent of Activity status/tab writes.
    },
    [state, hostFor, names, chatTabIds]
  )
}
