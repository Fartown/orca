import { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../store'
import type {
  ActivityEvent,
  ActivityLiveAgentSnapshot
} from '../components/activity/activity-thread-types'
import {
  buildActivityTabHostIndex,
  resolveActivityExecutionHostId
} from '../components/activity/activity-event-builder-context'
import { resolveAgentRowPaneLiveTitle } from '../components/dashboard/agent-row-pane-live-title'
import { canonicalSessionTitleKey, getCanonicalSessionTitle } from '../lib/canonical-session-titles'
import { isAiVaultTitleAgent } from '../../../shared/ai-vault-session-title'
import { getWorktreeExecutionHostId } from '../../../shared/execution-host'
import { parsePaneKey } from '../../../shared/stable-pane-id'
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
      generated: s.settings?.tabAutoGenerateTitle === true
    }))
  )
  const hostIndex = useMemo(() => buildActivityTabHostIndex(state.tabs), [state.tabs])
  const hostFor = useCallback(
    (target: ActivitySessionNameTarget) =>
      resolveActivityExecutionHostId(
        { worktreeId: target.worktree.id, tab: target.tab },
        target.entry,
        target.tab.ptyId,
        hostIndex
      ) ?? getWorktreeExecutionHostId(target.worktree, target.repo ?? undefined),
    [hostIndex]
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
      const confirmedName =
        key && record?.providerName?.kind === 'named' ? names.get(key) : undefined
      if (confirmedName) {
        return confirmedName
      }
      const pane = parsePaneKey(entry.paneKey)
      const layout = state.layouts[tab.id]
      const current = state.status[entry.paneKey]
      const ownsCurrent =
        current?.agentType === agent &&
        current?.providerSession?.id === sessionId &&
        current?.stateStartedAt === entry.stateStartedAt
      const ownsContainer =
        ownsCurrent && layout?.root?.type === 'leaf' && layout.root.leafId === pane?.leafId
      const paneLiveTitle = ownsCurrent
        ? resolveAgentRowPaneLiveTitle(layout, state.paneTitles[tab.id], pane?.leafId)
        : null
      return getActivitySessionName(entry, tab, state.generated, {
        record,
        manualTitle:
          agent && sessionId ? getCanonicalSessionTitle(host, agent, sessionId) : undefined,
        ownsContainer,
        paneLiveTitle
      })
      // Public name changes are independent of Activity status/tab writes.
    },
    [state, hostFor, names]
  )
}
