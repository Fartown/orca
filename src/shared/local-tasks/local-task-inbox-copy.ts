import { localTaskEventText } from './local-task-event-payload'
import { isLocalTaskProgressPayload } from './local-task-progress'
import type { LocalTaskInboxKind } from './local-task-dispatcher-types'
import type { LocalTaskStatusCategory } from './local-task-model'
import type { LocalTaskEvent } from './local-task-types'

const SUMMARY_MAX = 240
const TITLE_QUOTE_MAX = 80
const BODY_QUOTE_MAX = 160

function isControlCode(code: number): boolean {
  return code < 0x20 || (code >= 0x7f && code < 0xa0)
}

/**
 * One line for the dispatcher, never longer than a glance. Why control characters go: quoting
 * spells each as six characters, which would push a quoted line past its limit.
 */
export function inboxLine(text: string, max = SUMMARY_MAX): string {
  const printable = Array.from(text, (char) => (isControlCode(char.charCodeAt(0)) ? ' ' : char))
  const flat = printable.join('').replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/**
 * Text a task, an agent or an outside source wrote, as one quoted line. Why JSON quoting: a quote
 * or newline inside cannot close the quote, so the dispatcher reads it as data, never as an order.
 */
export function quotedTaskText(text: string, max = BODY_QUOTE_MAX): string {
  return JSON.stringify(inboxLine(text, max))
}

/** A task title inside an inbox line. */
export function quotedTaskTitle(title: string | null | undefined): string {
  return title ? quotedTaskText(title, TITLE_QUOTE_MAX) : 'A task'
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
  const title = quotedTaskTitle(task?.title)
  const body = quotedTaskText(event.body ?? '')
  if (event.kind === 'comment') {
    if (isLocalTaskProgressPayload(event.payload)) {
      const needsYou = localTaskEventText(event.payload, 'needsYou')
      return {
        kind: 'progress',
        summary: `${title}: ${body}`,
        ...(needsYou ? { needsYou } : {}),
        finished: false
      }
    }
    // Why: the dispatcher's own notes and agents' plain comments come through the CLI.
    return event.source === 'cli'
      ? null
      : { kind: 'comment', summary: `${title}: ${body}`, finished: false }
  }
  if (event.kind === 'status') {
    const toName = localTaskEventText(event.payload, 'toName')
    const category = statusCategory(localTaskEventText(event.payload, 'to'))
    const review = category === 'review' ? ' — waiting for the user to review' : ''
    return {
      kind: 'status',
      summary: `${title} moved to ${toName ? quotedTaskText(toName, TITLE_QUOTE_MAX) : 'another status'}${review}`,
      finished: category === 'completed' || category === 'canceled'
    }
  }
  if (event.kind === 'session-linked' || event.kind === 'session-unlinked') {
    const change = event.kind === 'session-linked' ? 'got a new session' : 'lost a session'
    return { kind: 'session', summary: `${title} ${change}`, finished: false }
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

const PENDING_REF_PREFIX = 'ref:'

/**
 * A watch on a ref the dispatcher's library does not hold (REQ-031): a desktop window finds the
 * task in another host's library and follows it there in its place.
 */
export function pendingRefWatchId(ref: string): string {
  return `${PENDING_REF_PREFIX}${ref.trim().toUpperCase()}`
}

/** The ref a pending watch waits to find; null for a watch on a task id. */
export function pendingWatchRef(id: string): string | null {
  return id.startsWith(PENDING_REF_PREFIX) && id.length > PENDING_REF_PREFIX.length
    ? id.slice(PENDING_REF_PREFIX.length)
    : null
}
