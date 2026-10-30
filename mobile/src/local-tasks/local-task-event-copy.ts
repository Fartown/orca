import {
  localTaskEventText as text,
  localTaskEventTexts,
  localTaskEventPriority
} from '../../../src/shared/local-tasks/local-task-event-payload'
import type {
  LocalTask,
  LocalTaskEvent,
  LocalTaskStatusDef
} from '../../../src/shared/local-tasks/local-task-types'
import { formatAgentTypeLabel } from '../../../src/shared/agent-type-label'
import type { LocalTasksCopy } from './local-tasks-copy'

type Payload = Record<string, unknown> | null

/** One activity line: who did it (null when nobody did, e.g. a host move), then what happened. */
export type LocalTaskEventLine = { actor: string | null; text: string }

/** "Claude", as the rest of the app names it, not the payload's `claude`. */
function agentName(copy: LocalTasksCopy, payload: Payload): string {
  const agent = text(payload, 'agent')
  return agent ? formatAgentTypeLabel(agent) : copy.eventUnknownAgent
}

function workspaceName(copy: LocalTasksCopy, payload: Payload): string {
  return text(payload, 'name') ?? text(payload, 'branch') ?? copy.eventUnnamedWorkspace
}

function priorityName(copy: LocalTasksCopy, payload: Payload, key: string): string {
  const priority = localTaskEventPriority(payload, key)
  return priority === null ? '?' : (copy.priorities[priority] ?? '?')
}

/** A parent named by its title, the task's main text; a deleted one is said so. */
function taskTitle(
  copy: LocalTasksCopy,
  id: string | null,
  tasksById: ReadonlyMap<string, Pick<LocalTask, 'title'>>
): string {
  return (id ? tasksById.get(id)?.title : undefined) ?? copy.eventDeletedTask
}

function describeLabels(copy: LocalTasksCopy, payload: Payload): string {
  const added = localTaskEventTexts(payload, 'added').join(', ')
  const removed = localTaskEventTexts(payload, 'removed').join(', ')
  if (added && removed) {
    return copy.eventLabelsChanged(added, removed)
  }
  return added ? copy.eventLabelsAdded(added) : copy.eventLabelsRemoved(removed)
}

function describeStatus(
  copy: LocalTasksCopy,
  payload: Payload,
  statuses: ReadonlyMap<string, LocalTaskStatusDef>,
  actor: string
): LocalTaskEventLine {
  const name = (nameKey: string, idKey: string) =>
    text(payload, nameKey) ??
    statuses.get(text(payload, idKey) ?? '')?.name ??
    copy.eventRemovedStatus
  const from = name('fromName', 'from')
  const to = name('toName', 'to')
  switch (text(payload, 'rule')) {
    case 'start':
      return { actor: null, text: copy.eventRuleStart(from, to) }
    case 'pr-merged': {
      const pr = payload?.prNumber
      return {
        actor: null,
        text: copy.eventRulePrMerged(typeof pr === 'number' ? String(pr) : '?', from, to)
      }
    }
    case null:
    default:
      return { actor, text: copy.eventStatus(from, to) }
  }
}

type LinkEventKind = Extract<
  LocalTaskEvent['kind'],
  'workspace-linked' | 'workspace-unlinked' | 'session-linked' | 'session-unlinked'
>

function describeLink(copy: LocalTasksCopy, kind: LinkEventKind, payload: Payload): string {
  const started = text(payload, 'via') === 'start'
  switch (kind) {
    case 'workspace-linked':
      return started
        ? copy.eventWorkspaceStarted(workspaceName(copy, payload), text(payload, 'hostLabel') ?? '')
        : copy.eventWorkspaceLinked(workspaceName(copy, payload))
    case 'workspace-unlinked':
      return copy.eventWorkspaceUnlinked(workspaceName(copy, payload))
    case 'session-linked':
      return started
        ? copy.eventSessionOpened(agentName(copy, payload))
        : copy.eventSessionLinked(agentName(copy, payload))
    case 'session-unlinked':
      return copy.eventSessionUnlinked(agentName(copy, payload))
  }
}

/**
 * One activity line, worded as the desktop words it (REQ-005): a rule's change names the rule, a
 * start names where it ran. Payloads are read defensively: they are free-form JSON on the wire,
 * and a desktop that writes a field differently should cost a detail, never the whole timeline.
 */
export function describeLocalTaskEvent(
  copy: LocalTasksCopy,
  event: LocalTaskEvent,
  statuses: ReadonlyMap<string, LocalTaskStatusDef>,
  tasksById: ReadonlyMap<string, Pick<LocalTask, 'title'>>
): LocalTaskEventLine {
  const payload = event.payload
  const actor = copy.eventSources[event.source]
  const said = (line: string): LocalTaskEventLine => ({ actor, text: line })
  switch (event.kind) {
    case 'comment':
      return said(copy.eventComment)
    case 'created':
      return said(copy.eventCreated)
    case 'title':
      return said(copy.eventTitle(text(payload, 'to') ?? ''))
    case 'description':
      return said(copy.eventDescription)
    case 'criteria':
      return said(copy.eventCriteria)
    case 'status':
      return describeStatus(copy, payload, statuses, actor)
    case 'priority':
      return said(
        copy.eventPriority(priorityName(copy, payload, 'from'), priorityName(copy, payload, 'to'))
      )
    case 'labels':
      return said(describeLabels(copy, payload))
    case 'parent': {
      const to = text(payload, 'to')
      return said(
        to
          ? copy.eventParentSet(taskTitle(copy, to, tasksById))
          : copy.eventParentRemoved(taskTitle(copy, text(payload, 'from'), tasksById))
      )
    }
    case 'moved':
      return said(copy.eventMoved(text(payload, 'from') ?? '?', text(payload, 'to') ?? '?'))
    case 'workspace-host':
      return {
        actor: null,
        text: copy.eventWorkspaceHost(
          workspaceName(copy, payload),
          text(payload, 'toHostLabel') ?? text(payload, 'toHostId') ?? '?',
          text(payload, 'fromHostLabel') ?? text(payload, 'fromHostId') ?? '?'
        )
      }
    case 'workspace-linked':
    case 'workspace-unlinked':
    case 'session-linked':
    case 'session-unlinked':
      return said(describeLink(copy, event.kind, payload))
  }
}
