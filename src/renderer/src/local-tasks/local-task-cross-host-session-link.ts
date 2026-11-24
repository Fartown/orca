import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { resolveOwner } from '@/lib/workspace/ownership/resolve-owner'
import { lastVerifiedRuntimeStatus } from '../../../shared/remote-runtime/host-status/runtime-host-status'
import { parseExecutionHostId } from '../../../shared/execution-host/execution-host'
import { localTaskForeignSessionHostId } from '../../../shared/local-tasks/local-task-session-origin'
import type { LocalTasksLinksRecordSessionInput } from '../../../shared/local-tasks/local-tasks-link-rpc-params'
import { selectLocalTaskHostLabel } from './local-task-host-label'
import { localTaskEndpointForHost, localTaskIdEndpoint } from './local-task-endpoints'
import { localTaskOwnerSessionTabIds } from './local-task-client-rows'
import { localTasksDomainStore, selectLocalTasksPartition } from './local-tasks-domain-store'
import { isLocalTaskHostInContact } from './local-task-host-contact'
import { resolveLocalTaskSessionOriginRoute } from './local-task-session-origin-route'
import { isLocalTaskSessionOriginInContact } from './local-task-foreign-session-progress'

type SessionInput = Omit<LocalTasksLinksRecordSessionInput, 'clientOperationId'>

/** Explicit linking preserves the execution owner's raw ids, independently of the task library. */
export function crossHostLocalTaskSessionInput(input: SessionInput): SessionInput {
  const state = useAppStore.getState()
  const source = localTaskEndpointForHost(input.hostId)
  const owner = localTaskIdEndpoint(input.taskId)
  const domain = localTasksDomainStore.getState()
  if (!source || !isLocalTaskHostInContact(state, input.hostId)) {
    throw new Error(
      translate('localTasks.crossHost.executionUnavailable', 'The session’s host is not connected.')
    )
  }
  const sourceHost = parseExecutionHostId(input.hostId)
  const installationId =
    selectLocalTasksPartition(domain, source)?.installationId ??
    (sourceHost?.kind === 'runtime'
      ? lastVerifiedRuntimeStatus(state.runtimeStatusByEnvironmentId.get(sourceHost.environmentId))
          ?.hostDescriptor?.installationId
      : null)
  if (!selectLocalTasksPartition(domain, owner)?.installationId || !installationId) {
    throw new Error(
      translate(
        'localTasks.crossHost.updateRequired',
        'Update the task library’s Orca to link sessions across hosts.'
      )
    )
  }
  const workspaceOwner =
    input.worktreeId && sourceHost
      ? resolveOwner(state, { workspaceId: input.worktreeId, hostId: sourceHost.id })
      : null
  const hostId =
    sourceHost?.kind === 'runtime'
      ? workspaceOwner?.kind === 'resolved' &&
        workspaceOwner.owner.endpoint.kind === 'environment' &&
        workspaceOwner.owner.endpoint.environmentId === sourceHost.environmentId
        ? workspaceOwner.owner.at
        : null
      : sourceHost?.kind === 'local' || sourceHost?.kind === 'ssh'
        ? sourceHost.id
        : null
  if (!hostId) {
    throw new Error(
      translate('localTasks.crossHost.ownerUnknown', 'The session’s execution host is unknown.')
    )
  }
  const executionOrigin = {
    installationId,
    hostId,
    hostLabel: selectLocalTaskHostLabel(state, input.hostId)
  }
  const foreignHostId = localTaskForeignSessionHostId(executionOrigin)
  if (!foreignHostId) {
    throw new Error(
      translate('localTasks.crossHost.ownerUnknown', 'The session’s execution host is unknown.')
    )
  }
  const route = resolveLocalTaskSessionOriginRoute(
    state,
    selectLocalTasksPartition(domain, 'local')?.installationId,
    executionOrigin
  )
  if (!isLocalTaskSessionOriginInContact(state, route)) {
    throw new Error(
      translate('localTasks.crossHost.executionUnavailable', 'The session’s host is not connected.')
    )
  }
  const ids = localTaskOwnerSessionTabIds(source, {
    surface: input.surface,
    tabId: input.tabId ?? null,
    paneKey: input.paneKey ?? null
  })
  return {
    ...input,
    hostId: foreignHostId,
    tabId: ids.tabId ?? undefined,
    paneKey: ids.paneKey ?? undefined,
    executionOrigin
  }
}
