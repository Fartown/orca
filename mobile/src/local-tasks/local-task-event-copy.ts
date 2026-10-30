import {
  localTaskEventText as text,
  localTaskEventTexts,
  localTaskEventPriority
} from '../../../src/shared/local-tasks/local-task-event-payload'
import type {
  LocalTaskEvent,
  LocalTaskStatusDef
} from '../../../src/shared/local-tasks/local-task-types'
import { formatAgentTypeLabel } from '../../../src/shared/agent-type-label'
import type { LocalTasksCopy } from './local-tasks-copy'

/** "Claude", as the rest of the app names it, not the payload's `claude`. */
function agentName(agent: string | null): string {
  return agent ? formatAgentTypeLabel(agent) : '?'
}

function priorityName(
  copy: LocalTasksCopy,
  payload: Record<string, unknown> | null,
  key: string
): string {
  const priority = localTaskEventPriority(payload, key)
  return priority === null ? '?' : (copy.priorities[priority] ?? '?')
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
      return copy.eventPriority(
        priorityName(copy, payload, 'from'),
        priorityName(copy, payload, 'to')
      )
    case 'labels': {
      const added = localTaskEventTexts(payload, 'added').map((label) => `+${label}`)
      const removed = localTaskEventTexts(payload, 'removed').map((label) => `−${label}`)
      const changes = [...added, ...removed].join(' ')
      return changes ? `${copy.eventLabels} ${changes}` : copy.eventLabels
    }
    case 'parent':
      return copy.eventParent
    case 'moved':
      return copy.eventMoved(text(payload, 'from') ?? '?', text(payload, 'to') ?? '?')
    case 'workspace-linked':
      return copy.eventWorkspaceLinked(text(payload, 'name') ?? text(payload, 'branch') ?? '?')
    case 'workspace-unlinked':
      return copy.eventWorkspaceUnlinked(text(payload, 'name') ?? text(payload, 'branch') ?? '?')
    case 'workspace-host':
      return copy.eventWorkspaceHost(
        text(payload, 'toHostLabel') ?? text(payload, 'toHostId') ?? '?'
      )
    case 'session-linked':
      return copy.eventSessionLinked(agentName(text(payload, 'agent')))
    case 'session-unlinked':
      return copy.eventSessionUnlinked(agentName(text(payload, 'agent')))
  }
}
