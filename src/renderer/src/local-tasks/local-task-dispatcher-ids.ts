import type { LocalTaskProposalItem } from '../../../shared/local-tasks/local-task-dispatcher-rpc-params'
import type { LocalTaskProposal } from '../../../shared/local-tasks/local-task-dispatcher-types'
import { UNRESOLVED_OWNER_HOST_ID } from '../../../shared/execution-host/execution-host'
import { toLocalTaskOwnedHostId } from '../../../shared/local-tasks/local-task-endpoint-ids'
import {
  localTaskClientId,
  localTaskIdEndpoint,
  localTaskOwnerId,
  type LocalTaskEndpointKey
} from './local-task-endpoints'
import { localTasksDomainStore } from './local-tasks-domain-store'

type Identity = { endpoint: LocalTaskEndpointKey; installationId?: string | null }
const TOKEN = /^runtime:dispatcher-([^/]+)\/(.+)$/

export function dispatcherClientTaskId(
  source: LocalTaskEndpointKey,
  id: string,
  identities: readonly Identity[] = localTasksDomainStore.getState().partitions
): string {
  if (id.startsWith('ref:')) {
    return id
  }
  const token = TOKEN.exec(id)
  if (token) {
    const matches = identities.filter((entry) => entry.installationId === token[1])
    if (matches.length !== 1) {
      return id
    }
    try {
      return localTaskClientId(matches[0].endpoint, decodeURIComponent(token[2]))
    } catch {
      return id
    }
  }
  if (source === 'local') {
    return id
  }
  return id.startsWith('runtime:')
    ? `runtime:dispatcher-unresolved/${encodeURIComponent(id)}`
    : localTaskClientId(source, id)
}

export function dispatcherSourceTaskId(
  source: LocalTaskEndpointKey,
  id: string,
  identities: readonly Identity[] = localTasksDomainStore.getState().partitions
): string {
  if (id.startsWith('ref:') || source === 'local') {
    return id
  }
  if (TOKEN.test(id)) {
    throw new Error('The task library identity is unavailable')
  }
  const endpoint = localTaskIdEndpoint(id)
  if (endpoint === source) {
    return localTaskOwnerId(id)
  }
  return stableExternalId(id, identities)
}

function stableExternalId(id: string, identities: readonly Identity[]): string {
  const endpoint = localTaskIdEndpoint(id)
  const installationId = identities.find((entry) => entry.endpoint === endpoint)?.installationId
  if (
    !installationId ||
    identities.filter((entry) => entry.installationId === installationId).length !== 1
  ) {
    throw new Error('The task library identity is unavailable')
  }
  return `runtime:dispatcher-${installationId}/${encodeURIComponent(localTaskOwnerId(id))}`
}

/** Event deduplication survives a different desktop's pairing ids for the same installation. */
export function dispatcherFactSourceId(
  taskId: string,
  eventId: string,
  identities: readonly Identity[] = localTasksDomainStore.getState().partitions
): string {
  let stable = taskId
  try {
    stable = stableExternalId(taskId, identities)
  } catch {}
  return `${stable}#${localTaskOwnerId(eventId)}`
}

export function isResolvedDispatcherTaskId(id: string): boolean {
  return !id.startsWith('ref:') && !TOKEN.test(id)
}

/** Forgetting an unresolved watch only names its source record; it never contacts that task. */
export function dispatcherSourceUnwatchId(source: LocalTaskEndpointKey, id: string): string {
  const prefix = 'runtime:dispatcher-unresolved/'
  if (id.startsWith(prefix)) {
    return decodeURIComponent(id.slice(prefix.length))
  }
  return TOKEN.test(id) ? id : dispatcherSourceTaskId(source, id)
}

function clientTarget(
  source: LocalTaskEndpointKey,
  target: { hostId?: string; worktreeId?: string; repoId?: string }
) {
  if (source === 'local') {
    return target
  }
  const hostId = toLocalTaskOwnedHostId(target.hostId ?? 'local')
    ? source
    : UNRESOLVED_OWNER_HOST_ID
  return { ...target, hostId }
}

export function dispatcherClientProposalItem(
  source: LocalTaskEndpointKey,
  item: LocalTaskProposalItem
): LocalTaskProposalItem {
  const task = (id: string) =>
    /^[A-Z][A-Z\d_-]*-\d+$/i.test(id) ? id : dispatcherClientTaskId(source, id)
  switch (item.kind) {
    case 'start':
      return { ...item, target: { ...item.target, ...clientTarget(source, item.target) } }
    case 'record':
      return { ...item, target: { ...item.target, ...clientTarget(source, item.target) } }
    case 'subtask':
      return { ...item, parentTaskId: task(item.parentTaskId) }
    case 'link':
      return {
        ...item,
        taskId: task(item.taskId),
        target: { ...item.target, ...clientTarget(source, item.target) }
      }
    case 'append':
    case 'stop':
      return {
        ...item,
        taskId: task(item.taskId),
        ...(item.sessionLinkId ? { sessionLinkId: task(item.sessionLinkId) } : {})
      }
  }
}

export function dispatcherClientProposal(
  source: LocalTaskEndpointKey,
  proposal: LocalTaskProposal
): LocalTaskProposal {
  return {
    ...proposal,
    id: localTaskClientId(source, proposal.id),
    conversationId: localTaskClientId(source, proposal.conversationId),
    items: proposal.items.map((item) => dispatcherClientProposalItem(source, item)),
    results:
      proposal.results?.map((result) => ({
        ...result,
        ...(result.taskId ? { taskId: dispatcherClientTaskId(source, result.taskId) } : {})
      })) ?? null
  }
}
