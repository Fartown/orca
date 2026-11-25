import { useMemo } from 'react'
import type {
  ActivityEvent,
  ActivityLiveAgentSnapshot,
  AgentPaneThread
} from '../components/activity/threads/activity-thread-types'
import {
  activitySessionTitleTarget,
  applyActivitySessionTitles
} from '../components/activity/threads/activity-thread-builder'
import { useActivitySessionNames } from './use-activity-session-names'

type SessionNameTargets = {
  events: ActivityEvent[]
  live: Record<string, ActivityLiveAgentSnapshot>
}
const EMPTY_SESSION_NAME_TARGETS: SessionNameTargets = { events: [], live: {} }

function collectSessionNameTargets(threads: readonly AgentPaneThread[]): SessionNameTargets {
  const events: ActivityEvent[] = []
  const live: Record<string, ActivityLiveAgentSnapshot> = {}
  for (const thread of threads) {
    events.push(...thread.events)
    const target = activitySessionTitleTarget(thread)
    if (target && thread.currentAgentEntry && !('id' in target)) {
      live[thread.paneKey] = target
    }
  }
  return { events, live }
}

/**
 * Fork (session-names): the window's shared thread projection carries no public names, so every
 * reader that shows or publishes a thread title applies them here.
 */
export function useNamedAgentPaneThreads(
  projectedThreads: AgentPaneThread[],
  { enabled = true }: { enabled?: boolean } = {}
): AgentPaneThread[] {
  const targets = useMemo(
    () => (enabled ? collectSessionNameTargets(projectedThreads) : EMPTY_SESSION_NAME_TARGETS),
    [projectedThreads, enabled]
  )
  const resolveSessionTitle = useActivitySessionNames(targets.events, targets.live)
  return useMemo(
    () =>
      enabled
        ? applyActivitySessionTitles(projectedThreads, resolveSessionTitle)
        : projectedThreads,
    [projectedThreads, resolveSessionTitle, enabled]
  )
}
