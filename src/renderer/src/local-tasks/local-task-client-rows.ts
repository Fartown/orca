import {
  getRepoExecutionHostId,
  getRepoSshConnectionId,
  parseExecutionHostId,
  toSshExecutionHostId
} from '../../../shared/execution-host'
import {
  isLocalTaskOwnedHostId,
  localTaskClientHostId,
  localTaskClientSessionIds,
  localTaskOwnerSessionIds
} from '../../../shared/local-tasks/local-task-endpoint-ids'
import type {
  LocalTaskLinks,
  LocalTaskProgressSnapshot,
  LocalTaskSessionLink,
  LocalTaskWorkspaceLink
} from '../../../shared/local-tasks/local-task-link-types'
import type {
  LocalTask,
  LocalTaskEvent,
  LocalTaskProject
} from '../../../shared/local-tasks/local-task-types'
import type { Repo } from '../../../shared/repo-types'
import {
  SELF_LOCAL_TASK_ENDPOINT,
  localTaskClientId,
  localTaskEndpointAuthority,
  localTaskEndpointEnvironmentId,
  type LocalTaskEndpointKey
} from './local-task-endpoints'

/*
 * A library row as this client holds it: ids keyed by endpoint, hosts and terminal tabs spelled
 * the way this client's own stores spell them (CONTRACT §2.2). This app's own rows pass through
 * unchanged, so they keep their identity.
 */

function isSelf(endpoint: LocalTaskEndpointKey): boolean {
  return endpoint === SELF_LOCAL_TASK_ENDPOINT
}

function clientHost(endpoint: LocalTaskEndpointKey, hostId: string): string {
  // Why fall back: a leftover non-owned id stays visible and simply never matches a workspace.
  return localTaskClientHostId(localTaskEndpointAuthority(endpoint), hostId) ?? hostId
}

export function toClientLocalTaskProject(
  endpoint: LocalTaskEndpointKey,
  project: LocalTaskProject
): LocalTaskProject {
  if (isSelf(endpoint)) {
    return project
  }
  const id = localTaskClientId(endpoint, project.id)
  return {
    ...project,
    id,
    lastExecutionHostId: project.lastExecutionHostId
      ? clientHost(endpoint, project.lastExecutionHostId)
      : null,
    statuses: project.statuses.map((status) => ({
      ...status,
      id: localTaskClientId(endpoint, status.id),
      projectId: id
    }))
  }
}

export function toClientLocalTask(endpoint: LocalTaskEndpointKey, task: LocalTask): LocalTask {
  if (isSelf(endpoint)) {
    return task
  }
  return {
    ...task,
    id: localTaskClientId(endpoint, task.id),
    projectId: localTaskClientId(endpoint, task.projectId),
    statusId: localTaskClientId(endpoint, task.statusId),
    parentId: task.parentId ? localTaskClientId(endpoint, task.parentId) : null
  }
}

// Status and parent entries name library ids that the activity copy looks up.
const EVENT_ID_KEYS: Partial<Record<LocalTaskEvent['kind'], readonly string[]>> = {
  status: ['from', 'to'],
  parent: ['from', 'to']
}

export function toClientLocalTaskEvent(
  endpoint: LocalTaskEndpointKey,
  event: LocalTaskEvent
): LocalTaskEvent {
  if (isSelf(endpoint)) {
    return event
  }
  const keys = EVENT_ID_KEYS[event.kind] ?? []
  let payload = event.payload
  if (payload && keys.length > 0) {
    payload = { ...payload }
    for (const key of keys) {
      const value = payload[key]
      if (typeof value === 'string' && value.length > 0) {
        payload[key] = localTaskClientId(endpoint, value)
      }
    }
  }
  return {
    ...event,
    id: localTaskClientId(endpoint, event.id),
    taskId: localTaskClientId(endpoint, event.taskId),
    payload
  }
}

export function toClientLocalTaskWorkspaceLink(
  endpoint: LocalTaskEndpointKey,
  link: LocalTaskWorkspaceLink
): LocalTaskWorkspaceLink {
  if (isSelf(endpoint)) {
    return link
  }
  return {
    ...link,
    taskId: localTaskClientId(endpoint, link.taskId),
    hostId: clientHost(endpoint, link.hostId)
  }
}

export function toClientLocalTaskSessionLink(
  endpoint: LocalTaskEndpointKey,
  link: LocalTaskSessionLink
): LocalTaskSessionLink {
  if (isSelf(endpoint)) {
    return link
  }
  return {
    ...link,
    ...localTaskClientSessionIds(localTaskEndpointAuthority(endpoint), link),
    id: localTaskClientId(endpoint, link.id),
    taskId: localTaskClientId(endpoint, link.taskId),
    hostId: clientHost(endpoint, link.hostId)
  }
}

export function toClientLocalTaskLinks(
  endpoint: LocalTaskEndpointKey,
  links: LocalTaskLinks
): LocalTaskLinks {
  if (isSelf(endpoint)) {
    return links
  }
  return {
    workspaces: links.workspaces.map((link) => toClientLocalTaskWorkspaceLink(endpoint, link)),
    sessions: links.sessions.map((link) => toClientLocalTaskSessionLink(endpoint, link))
  }
}

/** Item keys stay the host's own: they are what `attention.acknowledge` names. */
export function toClientLocalTaskProgress(
  endpoint: LocalTaskEndpointKey,
  progress: LocalTaskProgressSnapshot
): LocalTaskProgressSnapshot {
  if (isSelf(endpoint)) {
    return progress
  }
  return {
    observedAt: progress.observedAt,
    sessions: progress.sessions.map((session) => ({
      ...session,
      taskSessionId: localTaskClientId(endpoint, session.taskSessionId)
    })),
    items: progress.items.map((item) => ({
      ...item,
      taskId: localTaskClientId(endpoint, item.taskId),
      taskSessionId: localTaskClientId(endpoint, item.taskSessionId)
    }))
  }
}

/**
 * The host id the owning library stores for a host this client names (`authority.at`): this app
 * keeps `local` / `ssh:{t}`; a paired Orca's own machine is its `local`, and an SSH target it
 * dials is the nested target on that Orca's repo row. Null when the library cannot hold it.
 */
export function localTaskOwnerHostId(
  repos: readonly Pick<Repo, 'id' | 'connectionId' | 'executionHostId'>[],
  endpoint: LocalTaskEndpointKey,
  clientHostId: string,
  repoId: string | null
): string | null {
  const environmentId = localTaskEndpointEnvironmentId(endpoint)
  if (environmentId === null) {
    return isLocalTaskOwnedHostId(clientHostId) ? clientHostId : null
  }
  const host = parseExecutionHostId(clientHostId)
  if (host?.kind !== 'runtime' || host.environmentId !== environmentId) {
    return null
  }
  const repo = repoId
    ? repos.find(
        (candidate) => candidate.id === repoId && getRepoExecutionHostId(candidate) === clientHostId
      )
    : undefined
  const nested = repo ? getRepoSshConnectionId(repo) : null
  return nested ? toSshExecutionHostId(nested) : 'local'
}

export function localTaskOwnerSessionTabIds(
  endpoint: LocalTaskEndpointKey,
  ids: Pick<LocalTaskSessionLink, 'surface' | 'tabId' | 'paneKey'>
): { tabId: string | null; paneKey: string | null } {
  return localTaskOwnerSessionIds(localTaskEndpointAuthority(endpoint), ids)
}
