import { useAppStore } from '@/store'
import {
  AGENT_STATUS_STALE_AFTER_MS,
  agentStatusEvidenceObservedAt
} from '../../../shared/agent-status/contracts/agent-status-freshness'
import type { LocalTaskSessionProgress } from '../../../shared/local-tasks/local-task-link-types'
import { subscribeLocalTaskAppStore } from './local-task-app-store-subscription'
import {
  localTasksDomainStore,
  type LocalTaskSessionExecutionProjection
} from './local-tasks-domain-store'
import { projectLocalTaskSessionExecutionOrigin } from './local-task-session-origin-route'
import { projectLocalTaskForeignSessionProgress } from './local-task-foreign-session-progress'

/** Reprojects cached execution facts; task libraries and execution hosts keep separate authority. */
export function bindLocalTaskSessionExecutions(): () => void {
  let inputs: readonly unknown[] = []
  let output: ReturnType<LocalTaskSessionExecutionProjection> | null = null
  let deadline: ReturnType<typeof setTimeout> | null = null
  const project: LocalTaskSessionExecutionProjection = (derived, partitions) => {
    if (!derived.links.sessions.some((link) => link.executionOrigin)) {
      if (deadline) {
        clearTimeout(deadline)
        deadline = null
      }
      inputs = []
      output = null
      return derived
    }
    const state = useAppStore.getState()
    const selfId = partitions.find((partition) => partition.endpoint === 'local')?.installationId
    const nextInputs = [
      derived.links,
      derived.progress,
      selfId,
      state.runtimeStatusByEnvironmentId,
      state.agentStatusByPaneKey,
      state.unifiedTabsByWorktree,
      state.acknowledgedAgentsByPaneKey,
      state.sshConnectionStates,
      state.sshStateByEnvironment,
      state.runtimeEnvironments,
      state.settings
    ]
    if (
      output &&
      inputs.length === nextInputs.length &&
      inputs.every((item, i) => item === nextInputs[i])
    ) {
      return { ...derived, links: output.links, progress: output.progress }
    }
    inputs = nextInputs
    const now = Date.now()
    const links = {
      ...derived.links,
      sessions: derived.links.sessions.map((link) =>
        projectLocalTaskSessionExecutionOrigin(state, selfId, link)
      )
    }
    const sessions = new Map<string, LocalTaskSessionProgress>(derived.progress?.sessions)
    let staleAt: number | null = null
    for (const link of links.sessions) {
      if (!link.executionOrigin) {
        continue
      }
      const progress = projectLocalTaskForeignSessionProgress(state, selfId, link, {
        now,
        previous: output?.progress?.sessions.get(link.id) ?? sessions.get(link.id)
      })
      if (progress) {
        sessions.set(link.id, progress)
      }
      const row = link.paneKey ? state.agentStatusByPaneKey.get(link.paneKey) : null
      const nextStale = row
        ? agentStatusEvidenceObservedAt(row) + AGENT_STATUS_STALE_AFTER_MS + 1
        : null
      if (nextStale !== null && nextStale > now) {
        staleAt = Math.min(staleAt ?? nextStale, nextStale)
      }
    }
    if (deadline) {
      clearTimeout(deadline)
      deadline = null
    }
    if (staleAt !== null) {
      deadline = setTimeout(() => {
        deadline = null
        inputs = []
        localTasksDomainStore.getState().refreshSessionExecutions()
      }, staleAt - now)
    }
    output = {
      ...derived,
      links,
      progress: {
        sessions,
        items: derived.progress?.items ?? [],
        unverifiable: [...sessions.values()].some((session) => session.state === 'unverifiable')
      }
    }
    return output
  }
  localTasksDomainStore.getState().setSessionExecutionProjection(project)
  const stop = subscribeLocalTaskAppStore('linked session execution', (state, previous) => {
    if (
      state.agentStatusByPaneKey !== previous.agentStatusByPaneKey ||
      state.runtimeStatusByEnvironmentId !== previous.runtimeStatusByEnvironmentId ||
      state.unifiedTabsByWorktree !== previous.unifiedTabsByWorktree ||
      state.acknowledgedAgentsByPaneKey !== previous.acknowledgedAgentsByPaneKey ||
      state.sshConnectionStates !== previous.sshConnectionStates ||
      state.sshStateByEnvironment !== previous.sshStateByEnvironment ||
      state.runtimeEnvironments !== previous.runtimeEnvironments ||
      state.settings !== previous.settings
    ) {
      localTasksDomainStore.getState().refreshSessionExecutions()
    }
  })
  return () => {
    stop()
    if (deadline) {
      clearTimeout(deadline)
    }
    localTasksDomainStore.getState().setSessionExecutionProjection(null)
  }
}
