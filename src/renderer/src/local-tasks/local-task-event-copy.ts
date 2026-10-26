import { translate } from '@/i18n/i18n'
import {
  LOCAL_TASK_PRIORITIES,
  type LocalTaskPriority
} from '../../../shared/local-tasks/local-task-model'
import type {
  LocalTaskEvent,
  LocalTaskEventSource
} from '../../../shared/local-tasks/local-task-types'
import type { LocalTaskIndex } from './local-task-grouping'
import { localTaskPriorityLabel } from './local-task-vocabulary-copy'

type Payload = Record<string, unknown> | null

function text(payload: Payload, key: string): string | null {
  const value = payload?.[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function texts(payload: Payload, key: string): string[] {
  const value = payload?.[key]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function priority(payload: Payload, key: string): LocalTaskPriority | null {
  const value = payload?.[key]
  return LOCAL_TASK_PRIORITIES.find((candidate) => candidate === value) ?? null
}

export function localTaskEventActor(source: LocalTaskEventSource): string {
  switch (source) {
    case 'desktop':
      return translate('localTasks.activity.actor.desktop', 'You')
    case 'mobile':
      return translate('localTasks.activity.actor.mobile', 'You (phone)')
    case 'cli':
      return translate('localTasks.activity.actor.cli', 'Orca CLI')
    case 'rule':
      return translate('localTasks.activity.actor.rule', 'Automatic rule')
  }
}

function statusName(
  payload: Payload,
  nameKey: string,
  idKey: string,
  index: LocalTaskIndex
): string {
  const id = text(payload, idKey)
  return (
    text(payload, nameKey) ??
    (id ? index.statusesById.get(id)?.name : undefined) ??
    translate('localTasks.activity.removedStatus', 'a removed status')
  )
}

function taskRef(id: string | null, index: LocalTaskIndex): string {
  return (
    (id ? index.tasksById.get(id)?.ref : undefined) ??
    translate('localTasks.activity.deletedTask', 'a deleted task')
  )
}

function describeLabels(actor: string, payload: Payload): string {
  const added = texts(payload, 'added').join(', ')
  const removed = texts(payload, 'removed').join(', ')
  if (added && removed) {
    return translate(
      'localTasks.activity.labelsChanged',
      '{{actor}} added labels {{added}} and removed {{removed}}',
      { actor, added, removed }
    )
  }
  return added
    ? translate('localTasks.activity.labelsAdded', '{{actor}} added labels {{added}}', {
        actor,
        added
      })
    : translate('localTasks.activity.labelsRemoved', '{{actor}} removed labels {{removed}}', {
        actor,
        removed
      })
}

function describeParent(actor: string, payload: Payload, index: LocalTaskIndex): string {
  const from = text(payload, 'from')
  const to = text(payload, 'to')
  if (!to) {
    return translate('localTasks.activity.parentRemoved', '{{actor}} detached it from {{from}}', {
      actor,
      from: taskRef(from, index)
    })
  }
  return translate('localTasks.activity.parentSet', '{{actor}} made it a subtask of {{to}}', {
    actor,
    to: taskRef(to, index)
  })
}

/** One readable sentence for an activity entry; comments render their body instead. */
export function describeLocalTaskEvent(event: LocalTaskEvent, index: LocalTaskIndex): string {
  const actor = localTaskEventActor(event.source)
  const payload = event.payload
  switch (event.kind) {
    case 'comment':
      return translate('localTasks.activity.commented', '{{actor}} commented', { actor })
    case 'created':
      return translate('localTasks.activity.created', '{{actor}} created the task', { actor })
    case 'title':
      return translate('localTasks.activity.renamed', '{{actor}} renamed it to “{{title}}”', {
        actor,
        title: text(payload, 'to') ?? ''
      })
    case 'description':
      return translate('localTasks.activity.description', '{{actor}} edited the description', {
        actor
      })
    case 'criteria':
      return translate('localTasks.activity.criteria', '{{actor}} edited the done criteria', {
        actor
      })
    case 'status':
      return translate(
        'localTasks.activity.status',
        '{{actor}} changed status: {{from}} → {{to}}',
        {
          actor,
          from: statusName(payload, 'fromName', 'from', index),
          to: statusName(payload, 'toName', 'to', index)
        }
      )
    case 'priority': {
      const from = priority(payload, 'from')
      const to = priority(payload, 'to')
      return translate(
        'localTasks.activity.priority',
        '{{actor}} changed priority: {{from}} → {{to}}',
        {
          actor,
          from: from === null ? '?' : localTaskPriorityLabel(from),
          to: to === null ? '?' : localTaskPriorityLabel(to)
        }
      )
    }
    case 'labels':
      return describeLabels(actor, payload)
    case 'parent':
      return describeParent(actor, payload, index)
    case 'moved':
      return translate('localTasks.activity.moved', '{{actor}} moved it: {{from}} → {{to}}', {
        actor,
        from: text(payload, 'from') ?? '?',
        to: text(payload, 'to') ?? '?'
      })
  }
}
