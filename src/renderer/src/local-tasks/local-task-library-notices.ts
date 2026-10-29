import { translate } from '@/i18n/i18n'
import type { LocalTaskChangeScope } from '../../../shared/local-tasks/local-task-types'
import type { LocalTaskEndpointKey } from './local-task-endpoints'
import type { LocalTasksPartition } from './local-tasks-partition'

/** What the user's Retry does: open the library's stream again, or re-read what failed. */
export type LocalTaskLibraryRetry =
  | { kind: 'resubscribe' }
  | { kind: 'read'; scopes: LocalTaskChangeScope[] | null }

export type LocalTaskLibraryNotice = {
  endpoint: LocalTaskEndpointKey
  tone: 'muted' | 'warning'
  text: string
  detail: string | null
  retry: LocalTaskLibraryRetry | null
}

const READ_SCOPES: readonly LocalTaskChangeScope[] = [
  'projects',
  'tasks',
  'preferences',
  'links',
  'attention'
]

/** Failed whole-library reads; a task's activity read reports on that task instead. */
function libraryReadFailure(
  partition: LocalTasksPartition
): { detail: string; retry: LocalTaskLibraryRetry } | null {
  const { readErrors } = partition
  if (readErrors.status) {
    return { detail: readErrors.status, retry: { kind: 'read', scopes: null } }
  }
  const failed = READ_SCOPES.filter((scope) => readErrors[scope] !== undefined)
  const [first] = failed
  return first
    ? { detail: readErrors[first] ?? '', retry: { kind: 'read', scopes: [...failed] } }
    : null
}

function streamNotice(
  partition: LocalTasksPartition,
  text: string
): Omit<LocalTaskLibraryNotice, 'endpoint'> {
  return {
    tone: 'warning',
    text,
    detail: partition.connection === 'failed' ? partition.hostReason : null,
    retry: { kind: 'resubscribe' }
  }
}

/**
 * The page's own library once it has shown tasks: a stream that broke afterwards keeps the last
 * read on screen, so the line says so and offers the retry the empty-page panel would.
 */
function homeNotice(
  partition: LocalTasksPartition
): Omit<LocalTaskLibraryNotice, 'endpoint'> | null {
  const shown =
    partition.projectsLoaded &&
    partition.tasksLoaded &&
    (partition.hostState === 'ready' || partition.hostState === 'read-only')
  if (!shown || !partition.inContact) {
    return null
  }
  if (partition.connection === 'failed') {
    return streamNotice(
      partition,
      translate('localTasks.state.failed', 'Could not reach the task library.')
    )
  }
  if (partition.connection === 'ended') {
    return streamNotice(
      partition,
      translate('localTasks.state.ended', 'The task library stopped sending updates.')
    )
  }
  return null
}

function pairedNotice(
  partition: LocalTasksPartition,
  host: string
): Omit<LocalTaskLibraryNotice, 'endpoint'> | null {
  const muted = { tone: 'muted' as const, detail: null, retry: null }
  if (partition.connection === 'unsupported') {
    return {
      ...muted,
      text: translate(
        'localTasks.state.pairedUnsupported',
        '{{host}}: the Orca there needs an update to share its tasks.',
        { host }
      )
    }
  }
  if (!partition.inContact) {
    return partition.projectsLoaded
      ? {
          ...muted,
          text: translate(
            'localTasks.state.pairedOutOfContact',
            '{{host}} is not connected. Its tasks are shown as last read, and its sessions can’t be confirmed.',
            { host }
          )
        }
      : null
  }
  const unreadable = translate(
    'localTasks.state.pairedFailed',
    'Could not read the tasks on {{host}}.',
    { host }
  )
  if (partition.connection === 'failed' || partition.connection === 'ended') {
    return streamNotice(partition, unreadable)
  }
  if (partition.connection !== 'live') {
    return null
  }
  if (partition.hostState === 'unavailable') {
    return {
      tone: 'warning',
      text: translate(
        'localTasks.state.pairedUnavailable',
        '{{host}}: its task library cannot be opened right now, so its tasks are not shown.',
        { host }
      ),
      detail: partition.hostReason,
      retry: null
    }
  }
  const failure = libraryReadFailure(partition)
  if (failure) {
    return { tone: 'warning', text: unreadable, ...failure }
  }
  if (partition.hostState === 'read-only') {
    return {
      ...muted,
      text: translate(
        'localTasks.state.pairedReadOnly',
        '{{host}}: read only. A newer version of Orca saved these tasks; update Orca on {{host}} to edit them.',
        { host }
      )
    }
  }
  return null
}

/**
 * One line per library the page cannot fully show now. Another Orca's failures stay on their own
 * line, never in the page's notice, which speaks for its own library only.
 */
export function describeLocalTaskLibraryNotices(
  partitions: readonly LocalTasksPartition[],
  home: LocalTaskEndpointKey | null,
  hostLabel: (endpoint: LocalTaskEndpointKey) => string
): LocalTaskLibraryNotice[] {
  return partitions.flatMap((partition) => {
    const notice =
      partition.endpoint === home
        ? homeNotice(partition)
        : pairedNotice(partition, hostLabel(partition.endpoint))
    return notice ? [{ endpoint: partition.endpoint, ...notice }] : []
  })
}
