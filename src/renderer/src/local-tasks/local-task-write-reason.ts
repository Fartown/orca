import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { selectExecutionHostDisplayLabel } from '@/lib/execution-host-display-label'
import type { LocalTaskBoardColumn } from '../../../shared/local-tasks/local-task-list-groups'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import { localTaskIdEndpoint, type LocalTaskEndpointKey } from './local-task-endpoints'
import {
  isLocalTaskRowWritable,
  localTasksDomainStore,
  selectLocalTasksPartition,
  useLocalTasksDomain,
  type LocalTasksDomainState
} from './local-tasks-domain-store'
import type { LocalTasksPartition } from './local-tasks-partition'
import { canCreateLocalTask } from './local-task-write-access'

/*
 * Why a control that changes tasks is greyed, said where the control is: a page-wide notice is
 * not on screen in a session header, a picker or a tooltip.
 */

type AccessState = Pick<LocalTasksDomainState, 'partitions' | 'home' | 'projects'>

/** Null while the library takes writes; out of contact it only waits, nothing redials it. */
export function localTaskLibraryWriteReason(
  partition: Pick<LocalTasksPartition, 'inContact' | 'connection' | 'hostState'> | undefined,
  hostLabel: string
): string | null {
  if (!partition) {
    return translate(
      'localTasks.writeBlocked.unavailable',
      'The task library is not available now.'
    )
  }
  if (!partition.inContact) {
    return translate(
      'localTasks.writeBlocked.offline',
      '{{host}} is not connected, so its tasks can’t be changed now.',
      { host: hostLabel }
    )
  }
  if (partition.hostState === 'read-only') {
    return translate(
      'localTasks.writeBlocked.readOnly',
      'Read only: a newer version of Orca saved these tasks.'
    )
  }
  if (partition.connection === 'connecting') {
    return translate('localTasks.writeBlocked.connecting', 'Reconnecting to the task library…')
  }
  if (partition.connection !== 'live' || partition.hostState !== 'ready') {
    return translate(
      'localTasks.writeBlocked.unavailable',
      'The task library is not available now.'
    )
  }
  return null
}

/** The library of the first row that takes no writes now; null when every row's does. */
function blockedRowEndpoint(
  state: AccessState,
  ids: readonly string[]
): LocalTaskEndpointKey | null {
  const blocked = ids.find((id) => !isLocalTaskRowWritable(state, id))
  return blocked === undefined ? null : localTaskIdEndpoint(blocked)
}

/** The library a new task cannot go into: the scoped project's, else the first project's. */
function blockedCreateEndpoint(
  state: AccessState,
  scopeProjectId: string | null
): LocalTaskEndpointKey | null {
  if (canCreateLocalTask(state, scopeProjectId)) {
    return null
  }
  const projectId = scopeProjectId ?? state.projects[0]?.id ?? null
  return projectId ? localTaskIdEndpoint(projectId) : state.home
}

function describeEndpoint(
  state: AccessState,
  endpoint: LocalTaskEndpointKey | null
): string | null {
  if (endpoint === null) {
    return null
  }
  return localTaskLibraryWriteReason(
    selectLocalTasksPartition(state, endpoint),
    selectExecutionHostDisplayLabel(useAppStore.getState(), endpoint)
  )
}

function useEndpointReason(endpoint: LocalTaskEndpointKey | null): string | null {
  const label = useAppStore((state) =>
    endpoint ? selectExecutionHostDisplayLabel(state, endpoint) : ''
  )
  return useLocalTasksDomain((state) =>
    endpoint ? localTaskLibraryWriteReason(selectLocalTasksPartition(state, endpoint), label) : null
  )
}

/** For a key or a drop handler, which read the stores once instead of subscribing. */
export function localTaskRowsWriteReason(ids: readonly string[]): string | null {
  const state = localTasksDomainStore.getState()
  return describeEndpoint(state, blockedRowEndpoint(state, ids))
}

export function localTaskCreateWriteReason(scopeProjectId: string | null): string | null {
  const state = localTasksDomainStore.getState()
  return describeEndpoint(state, blockedCreateEndpoint(state, scopeProjectId))
}

/**
 * Why a board card can't land in this column, or null: its own library must take writes, and a
 * status column only takes its own project's tasks. A refused drop otherwise does nothing at all.
 */
export function localTaskBoardDropRefusal(
  column: LocalTaskBoardColumn,
  task: Pick<LocalTask, 'id' | 'title' | 'projectId'>,
  projectName: (projectId: string) => string
): string | null {
  const writeReason = localTaskRowsWriteReason([task.id])
  if (writeReason) {
    return writeReason
  }
  if (column.kind === 'status' && column.status.projectId !== task.projectId) {
    return translate(
      'localTasks.board.otherProject',
      '“{{title}}” is in {{project}}; this column’s status belongs to {{target}}. Move the task to that project first.',
      {
        title: task.title,
        project: projectName(task.projectId),
        target: projectName(column.status.projectId)
      }
    )
  }
  return null
}

/** Why these rows can't be changed now, or null; a tooltip reads it instead of the action. */
export function useLocalTaskRowsWriteReason(ids: readonly string[]): string | null {
  return useEndpointReason(useLocalTasksDomain((state) => blockedRowEndpoint(state, ids)))
}

export function useLocalTaskRowWriteReason(id: string | null): string | null {
  return useEndpointReason(
    useLocalTasksDomain((state) => (id === null ? null : blockedRowEndpoint(state, [id])))
  )
}

export function useLocalTaskCreateWriteReason(scopeProjectId: string | null): string | null {
  return useEndpointReason(
    useLocalTasksDomain((state) => blockedCreateEndpoint(state, scopeProjectId))
  )
}
