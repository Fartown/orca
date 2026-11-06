import { localTaskEventText } from './local-task-event-payload'
import { isLocalTaskProgressPayload } from './local-task-progress'
import type { LocalTaskInboxKind } from './local-task-dispatcher-types'
import type { LocalTaskStatusCategory } from './local-task-model'
import type { LocalTaskEvent } from './local-task-types'

const SUMMARY_MAX = 240

/** One line for the dispatcher, never longer than a glance. */
export function inboxLine(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > SUMMARY_MAX ? `${flat.slice(0, SUMMARY_MAX - 1)}…` : flat
}

/** What a dispatcher reports on; titles, labels and links are bookkeeping. */
export const LOCAL_TASK_INBOX_EVENT_KINDS = [
  'comment',
  'status',
  'session-linked',
  'session-unlinked'
] as const

export type LocalTaskInboxEventCopy = {
  kind: LocalTaskInboxKind
  summary: string
  needsYou?: string
  /** The task moved into a completed or canceled status. */
  finished: boolean
}

/**
 * One event on a followed task as the dispatcher reads it (REQ-031), the same words whichever
 * library holds the task. Null for what the dispatcher does not hear: the CLI's own notes.
 */
export function describeLocalTaskInboxEvent(
  event: { kind: string; source: string } & Pick<LocalTaskEvent, 'body' | 'payload'>,
  task: { title: string } | null,
  statusCategory: (statusId: string | null) => LocalTaskStatusCategory | null
): LocalTaskInboxEventCopy | null {
  const title = task?.title ?? 'A task'
  const body = event.body ?? ''
  if (event.kind === 'comment') {
    if (isLocalTaskProgressPayload(event.payload)) {
      const needsYou = localTaskEventText(event.payload, 'needsYou')
      return {
        kind: 'progress',
        summary: inboxLine(`${title}: ${body}`),
        ...(needsYou ? { needsYou } : {}),
        finished: false
      }
    }
    // Why: the dispatcher's own notes and agents' plain comments come through the CLI.
    return event.source === 'cli'
      ? null
      : { kind: 'comment', summary: inboxLine(`${title}: ${body}`), finished: false }
  }
  if (event.kind === 'status') {
    const toName = localTaskEventText(event.payload, 'toName') ?? 'another status'
    const category = statusCategory(localTaskEventText(event.payload, 'to'))
    const review = category === 'review' ? ' — waiting for the user to review' : ''
    return {
      kind: 'status',
      summary: inboxLine(`${title} moved to ${toName}${review}`),
      finished: category === 'completed' || category === 'canceled'
    }
  }
  if (event.kind === 'session-linked' || event.kind === 'session-unlinked') {
    const change = event.kind === 'session-linked' ? 'got a new session' : 'lost a session'
    return { kind: 'session', summary: inboxLine(`${title} ${change}`), finished: false }
  }
  return null
}

const OTHER_LIBRARY_PREFIX = 'runtime:'

/**
 * A task id as a desktop client keys a task of another Orca's library (`runtime:{env}/{id}`,
 * D-008). The dispatcher's library keeps such ids for tasks it follows on other hosts.
 */
export function isOtherLibraryTaskId(id: string): boolean {
  return id.startsWith(OTHER_LIBRARY_PREFIX) && id.indexOf('/') > OTHER_LIBRARY_PREFIX.length
}
