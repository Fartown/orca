import type { AppState } from '@/store/types'
import { selectRuntimeAwareSshStatus } from '@/store/slices/ssh/runtime-environment-ssh-selectors'
import { parseExecutionHostId } from '../../../shared/execution-host/execution-host'
import type { AgentStatusEntry } from '../../../shared/agent-status/contracts/agent-status-types'
import { agentStatusEvidenceObservedAt } from '../../../shared/agent-status/contracts/agent-status-freshness'
import { parsePaneKey } from '../../../shared/workspace-layout/stable-pane-id'
import { worktreeIdsEqual } from '../../../shared/worktree/id'
import {
  localTaskRowState,
  localTaskRowWords,
  type LocalTaskStatusRow
} from '../../../shared/local-tasks/local-task-attention-rules'
import type {
  LocalTaskSessionLink,
  LocalTaskSessionProgress
} from '../../../shared/local-tasks/local-task-link-types'
import { isLocalTaskHostInContact, type LocalTaskHostContactState } from './local-task-host-contact'
import {
  resolveLocalTaskSessionOriginRoute,
  type LocalTaskSessionOriginRoute
} from './local-task-session-origin-route'

export type LocalTaskSessionOriginContactState = LocalTaskHostContactState &
  Pick<AppState, 'sshConnectionStates'>

export type LocalTaskForeignSessionProgressState = LocalTaskSessionOriginContactState &
  Pick<
    AppState,
    | 'agentStatusByPaneKey'
    | 'unifiedTabsByWorktree'
    | 'acknowledgedAgentsByPaneKey'
    | 'runtimeStatusByEnvironmentId'
  >

export type LocalTaskForeignSessionProgressOptions = {
  now: number
  /** Only source-host evidence may prove liveness; a retained tab or missing renderer is not proof. */
  terminalLive?: boolean
  previous?: LocalTaskSessionProgress | null
}

export function isLocalTaskSessionOriginInContact(
  state: LocalTaskSessionOriginContactState,
  route: LocalTaskSessionOriginRoute
): boolean {
  if (!route.authority || !isLocalTaskHostInContact(state, route.hostId)) {
    return false
  }
  const location = parseExecutionHostId(route.authority.at)
  const environmentId =
    route.authority.endpoint.kind === 'environment' ? route.authority.endpoint.environmentId : null
  return (
    location?.kind === 'local' ||
    (location?.kind === 'ssh' &&
      selectRuntimeAwareSshStatus(
        state,
        state.runtimeStatusByEnvironmentId,
        environmentId,
        location.targetId
      ) === 'connected')
  )
}

function sourceStatusRow(
  state: LocalTaskForeignSessionProgressState,
  route: LocalTaskSessionOriginRoute,
  link: LocalTaskSessionLink
): AgentStatusEntry | null {
  const paneKey = link.paneKey
  const pane = paneKey ? parsePaneKey(paneKey) : null
  if (!paneKey || !pane || !route.authority || (link.tabId !== null && link.tabId !== pane.tabId)) {
    return null
  }
  const row = state.agentStatusByPaneKey.get(paneKey)
  if (
    !row ||
    row.paneKey !== link.paneKey ||
    (row.worktreeId && link.worktreeId && !worktreeIdsEqual(row.worktreeId, link.worktreeId))
  ) {
    return null
  }
  const { endpoint, at } = route.authority
  const location = parseExecutionHostId(at)
  if (
    row.connectionId != null &&
    row.connectionId !== (endpoint.kind === 'environment' ? endpoint.environmentId : null) &&
    !(location?.kind === 'ssh' && row.connectionId === location.targetId)
  ) {
    return null
  }
  const tabs = state.unifiedTabsByWorktree[link.worktreeId ?? row.worktreeId ?? ''] ?? []
  const owners = new Set(
    tabs
      .filter((tab) => tab.id === pane.tabId || tab.entityId === pane.tabId)
      .map((tab) => tab.executionHostId ?? 'local')
  )
  if (owners.size > 0) {
    return owners.size === 1 && owners.has(route.hostId) ? row : null
  }
  if (endpoint.kind === 'environment') {
    return row.connectionId === endpoint.environmentId ? row : null
  }
  return location?.kind === 'local'
    ? row.connectionId == null
      ? row
      : null
    : location?.kind === 'ssh' && row.connectionId === location.targetId
      ? row
      : null
}

function statusRow(entry: AgentStatusEntry): LocalTaskStatusRow {
  const observedAt = agentStatusEvidenceObservedAt(entry)
  return {
    paneKey: entry.paneKey,
    state: entry.state,
    stateStartedAt: entry.stateStartedAt,
    receivedAt: observedAt,
    evidenceObservedAt: observedAt,
    interactivePrompt: entry.interactivePrompt,
    toolName: entry.toolName,
    agentType: entry.agentType,
    programStatus: entry.programStatus,
    restoredUnconfirmed: entry.restoredUnconfirmed,
    sessionBoundary: entry.sessionBoundary,
    structuredHost: entry.structuredHostOwned ? 'owned' : undefined,
    lastAssistantMessage: entry.lastAssistantMessage,
    lastAssistantMessageIsToolOutput: entry.lastAssistantMessageIsToolOutput
  }
}

/** Project source-host push evidence onto a foreign link whose ids are already in client form. */
export function projectLocalTaskForeignSessionProgress(
  state: LocalTaskForeignSessionProgressState,
  selfInstallationId: string | null | undefined,
  link: LocalTaskSessionLink,
  options: LocalTaskForeignSessionProgressOptions
): LocalTaskSessionProgress | null {
  if (!link.executionOrigin) {
    return null
  }
  const previous = options.previous?.taskSessionId === link.id ? options.previous : null
  const progress: LocalTaskSessionProgress = {
    taskSessionId: link.id,
    state: 'unverifiable',
    lastMessage: previous?.lastMessage ?? null,
    stateSince: null,
    unread: false
  }
  const route = resolveLocalTaskSessionOriginRoute(state, selfInstallationId, link.executionOrigin)
  if (!isLocalTaskSessionOriginInContact(state, route)) {
    return progress
  }
  const entry = sourceStatusRow(state, route, link)
  if (!entry) {
    return { ...progress, state: 'unknown' }
  }
  const row = statusRow(entry)
  const projectedState = localTaskRowState(row, options.terminalLive === true, options.now)
  const stateVerdict =
    options.terminalLive === undefined && projectedState === 'idle'
      ? 'unverifiable'
      : projectedState
  return {
    taskSessionId: link.id,
    state: stateVerdict,
    lastMessage: localTaskRowWords(
      row,
      entry.lastCompletedAssistantMessage ?? previous?.lastMessage ?? null
    ),
    stateSince: entry.stateStartedAt,
    unread:
      stateVerdict === 'done' &&
      entry.sessionBoundary !== true &&
      entry.restoredUnconfirmed !== true &&
      (state.acknowledgedAgentsByPaneKey[entry.paneKey] ?? 0) < entry.stateStartedAt
  }
}
