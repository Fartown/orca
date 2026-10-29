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
    authFailed?: boolean
    streamEnded?: boolean
  }
): LocalTasksScreenState {
  const { access, status } = input
  if (input.loaded) {
    const readOnly =
      access !== 'ready' || status?.state !== 'ready' || !input.ready || input.streamEnded === true
    return {
      kind: 'library',
      readOnly,
      notice: input.authFailed
        ? copy.pairingInvalid
        : access === 'offline'
          ? copy.desktopDisconnected(input.machineName)
          : access === 'checking'
            ? copy.checking
            : access === 'unsupported'
              ? copy.unsupported
              : access === 'unreadable'
                ? copy.statusUnreadable
                : !status
                  ? input.error
                    ? copy.loadFailed
                    : copy.checking
                  : status.state === 'starting'
                    ? copy.libraryStarting
                    : status?.state === 'unavailable'
                      ? copy.libraryUnavailable
                      : input.error
                        ? copy.loadFailed
                        : input.streamEnded
                          ? copy.streamEnded
                          : readOnly
                            ? copy.libraryReadOnly
                            : null
    }
  }
  if (access === 'offline') {
    return {
      kind: 'gate',
      title: input.authFailed ? copy.pairingInvalid : copy.desktopDisconnected(input.machineName)
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
  return { kind: 'library', readOnly: false, notice: null }
}
