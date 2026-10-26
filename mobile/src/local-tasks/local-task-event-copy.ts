import {
  LOCAL_TASK_PRIORITIES,
  type LocalTaskPriority
} from '../../../src/shared/local-tasks/local-task-model'
import type {
  LocalTaskEvent,
  LocalTaskStatusDef
} from '../../../src/shared/local-tasks/local-task-types'
import type { LocalTasksCopy } from './local-tasks-copy'

function text(payload: Record<string, unknown> | null, key: string): string | null {
  const value = payload?.[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function priorityName(copy: LocalTasksCopy, value: unknown): string {
  const priority: LocalTaskPriority | undefined = LOCAL_TASK_PRIORITIES.find(
    (candidate) => candidate === value
  )
  return priority === undefined ? '?' : (copy.priorities[priority] ?? '?')
}

/**
 * One activity line. Payloads are read defensively: they are free-form JSON on the wire, and a
 * desktop that writes a field differently should cost a detail, never the whole timeline.
 */
export function describeLocalTaskEvent(
  copy: LocalTasksCopy,
  event: LocalTaskEvent,
  statuses: Map<string, LocalTaskStatusDef>
): string {
  const payload = event.payload
  switch (event.kind) {
    case 'comment':
      return copy.eventComment
    case 'created':
      return copy.eventCreated
    case 'title':
      return copy.eventTitle
    case 'description':
      return copy.eventDescription
    case 'criteria':
      return copy.eventCriteria
    case 'status': {
      const name = (nameKey: string, idKey: string) =>
        text(payload, nameKey) ?? statuses.get(text(payload, idKey) ?? '')?.name ?? '?'
      return copy.eventStatus(name('fromName', 'from'), name('toName', 'to'))
    }
    case 'priority':
      return copy.eventPriority(priorityName(copy, payload?.from), priorityName(copy, payload?.to))
    case 'labels': {
      const list = (key: string): string[] => {
        const value: unknown = payload?.[key]
        return Array.isArray(value)
          ? value.filter((label): label is string => typeof label === 'string')
          : []
      }
      const added = list('added').map((label) => `+${label}`)
      const removed = list('removed').map((label) => `−${label}`)
      const changes = [...added, ...removed].join(' ')
      return changes ? `${copy.eventLabels} ${changes}` : copy.eventLabels
    }
    case 'parent':
      return copy.eventParent
    case 'moved':
      return copy.eventMoved(text(payload, 'from') ?? '?', text(payload, 'to') ?? '?')
  }
}
