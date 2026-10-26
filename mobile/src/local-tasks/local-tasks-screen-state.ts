import type { LocalTasksStatus } from '../../../src/shared/local-tasks/local-task-types'
import type { LocalTasksAccess } from './local-tasks-access'
import type { LocalTasksCopy } from './local-tasks-copy'

export type LocalTasksScreenState =
  | {
      kind: 'gate'
      title: string
      message?: string
      /** The raw error, behind a "details" toggle: it is for a bug report, not for reading. */
      details?: string
      busy?: boolean
      retry?: boolean
    }
  | { kind: 'library'; readOnly: boolean; notice: string | null }

/** What the task page shows for one host, from its access and the library's own state. */
export function localTasksScreenState(
  copy: LocalTasksCopy,
  input: {
    access: LocalTasksAccess
    machineName: string
    status: LocalTasksStatus | null
    ready: boolean
    loaded: boolean
    error: string | null
  }
): LocalTasksScreenState {
  const { access, status } = input
  if (access === 'offline') {
    return {
      kind: 'gate',
      title: copy.desktopClosed(input.machineName),
      message: copy.desktopClosedHint(input.machineName)
    }
  }
  if (access === 'unsupported' || status?.state === 'not-task-host') {
    return { kind: 'gate', title: copy.unsupported }
  }
  if (access === 'unreadable') {
    return { kind: 'gate', title: copy.statusUnreadable }
  }
  if (status?.state === 'unavailable') {
    return {
      kind: 'gate',
      title: copy.libraryUnavailable,
      message: copy.libraryUnavailableHint,
      details: status.reason ?? undefined
    }
  }
  if (!input.ready || !input.loaded) {
    if (input.ready && input.error !== null) {
      return {
        kind: 'gate',
        title: copy.loadFailed,
        message: copy.loadFailedHint,
        details: input.error,
        retry: true
      }
    }
    return {
      kind: 'gate',
      title: status?.state === 'starting' ? copy.libraryStarting : copy.checking,
      busy: true
    }
  }
  const readOnly = status?.state === 'read-only'
  return {
    kind: 'library',
    readOnly,
    notice: readOnly ? copy.libraryReadOnly : input.error ? copy.loadFailed : null
  }
}
