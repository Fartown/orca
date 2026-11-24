import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { resolveOwner } from '@/lib/workspace/ownership/resolve-owner'
import { runtimeEnvironmentIdOrLocalUnlessTwin } from '@/lib/workspace/ownership/worktree-runtime-owner'
import {
  structuredAgentSessionOwnerForTab,
  structuredAgentSessionTargetForTab
} from '@/runtime/native-chat/session-ownership/structured-agent-session-owner'
import type { Tab } from '../../../shared/workspace-layout/tab-groups/tab-types'
import { authorityKey } from '../../../shared/execution-host/host-authority'
import type { LocalTaskSessionLink } from '../../../shared/local-tasks/local-task-link-types'
import { isLocalTaskHostInContact } from './local-task-host-contact'
import { isLocalTaskSessionOriginInContact } from './local-task-foreign-session-progress'
import { resolveLocalTaskSessionOriginRoute } from './local-task-session-origin-route'
import {
  localTasksDomainStore,
  selectLocalTasksPartition,
  useLocalTasksDomain
} from './local-tasks-domain-store'

export function isLocalTaskSessionInContact(
  state: AppState,
  session: LocalTaskSessionLink
): boolean {
  if (!session.executionOrigin) {
    return isLocalTaskHostInContact(state, session.hostId)
  }
  const selfId = selectLocalTasksPartition(
    localTasksDomainStore.getState(),
    'local'
  )?.installationId
  const route = resolveLocalTaskSessionOriginRoute(state, selfId, session.executionOrigin)
  return route.hostId === session.hostId && isLocalTaskSessionOriginInContact(state, route)
}

export function useLocalTaskSessionInContact(session: LocalTaskSessionLink): boolean {
  const selfId = useLocalTasksDomain(
    (state) => selectLocalTasksPartition(state, 'local')?.installationId
  )
  return useAppStore((state) => {
    if (!session.executionOrigin) {
      return isLocalTaskHostInContact(state, session.hostId)
    }
    const route = resolveLocalTaskSessionOriginRoute(state, selfId, session.executionOrigin)
    return route.hostId === session.hostId && isLocalTaskSessionOriginInContact(state, route)
  })
}

/** The upstream sender derives its own route; reject disagreement before even reading terminals. */
export function isLocalTaskSessionReplyRouteCurrent(
  state: AppState,
  session: LocalTaskSessionLink
): boolean {
  if (!session.executionOrigin) {
    return true
  }
  if (!session.worktreeId || !isLocalTaskSessionInContact(state, session)) {
    return false
  }
  const selfId = selectLocalTasksPartition(
    localTasksDomainStore.getState(),
    'local'
  )?.installationId
  const route = resolveLocalTaskSessionOriginRoute(state, selfId, session.executionOrigin)
  if (!route.authority) {
    return false
  }
  const expectedEnvironment =
    route.authority.endpoint.kind === 'environment' ? route.authority.endpoint.environmentId : null
  if (session.surface === 'chat') {
    const tab = (state.unifiedTabsByWorktree[session.worktreeId] ?? []).find(
      (candidate) =>
        candidate.contentType === 'agent-session' && candidate.entityId === session.sessionId
    )
    const target = tab ? structuredAgentSessionTargetForTab(state, tab) : null
    return (
      route.authority.at === 'local' &&
      target !== null &&
      (target.kind === 'environment' ? target.environmentId : null) === expectedEnvironment
    )
  }
  const owner = resolveOwner(state, { workspaceId: session.worktreeId })
  return (
    owner.kind === 'resolved' &&
    authorityKey(owner.owner) === authorityKey(route.authority) &&
    runtimeEnvironmentIdOrLocalUnlessTwin(state, session.worktreeId) === expectedEnvironment
  )
}

export function findLocalTaskSessionChatTab(
  state: AppState,
  session: LocalTaskSessionLink
): Tab | null {
  const tabs = (state.unifiedTabsByWorktree[session.worktreeId ?? ''] ?? []).filter(
    (tab) =>
      tab.contentType === 'agent-session' &&
      (tab.id === session.tabId ||
        (session.sessionId !== null && tab.entityId === session.sessionId))
  )
  if (!session.executionOrigin) {
    return tabs[0] ?? null
  }
  if (
    session.surface !== 'chat' ||
    session.executionOrigin.hostId !== 'local' ||
    !isLocalTaskSessionInContact(state, session)
  ) {
    return null
  }
  const owned = tabs.filter(
    (tab) => structuredAgentSessionOwnerForTab(state, tab) === session.hostId
  )
  return owned.length === 1 ? owned[0] : null
}

export function isLocalTaskSessionTerminalSurfaceCurrent(
  state: AppState,
  session: LocalTaskSessionLink
): boolean {
  if (!session.executionOrigin) {
    return true
  }
  if (session.surface !== 'terminal' || !isLocalTaskSessionReplyRouteCurrent(state, session)) {
    return false
  }
  const tabs = (state.unifiedTabsByWorktree[session.worktreeId ?? ''] ?? []).filter(
    (tab) =>
      tab.contentType === 'terminal' && (tab.id === session.tabId || tab.entityId === session.tabId)
  )
  return tabs.length === 1 && structuredAgentSessionOwnerForTab(state, tabs[0]) === session.hostId
}
