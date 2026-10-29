import { translate } from '@/i18n/i18n'
import { localTaskEventText as text } from '../../../shared/local-tasks/local-task-event-payload'
import { getAgentCatalog } from '@/lib/agent-catalog'
import type { LocalTaskEvent } from '../../../shared/local-tasks/local-task-types'

type Payload = Record<string, unknown> | null

export type LocalTaskLinkEventKind = Extract<
  LocalTaskEvent['kind'],
  | 'workspace-linked'
  | 'workspace-unlinked'
  | 'workspace-host'
  | 'session-linked'
  | 'session-unlinked'
>

function workspaceName(payload: Payload): string {
  return (
    text(payload, 'name') ??
    text(payload, 'branch') ??
    translate('localTasks.activity.unnamedWorkspace', 'a workspace')
  )
}

function agentName(payload: Payload): string {
  const agent = text(payload, 'agent')
  return (
    getAgentCatalog().find((entry) => entry.id === agent)?.label ??
    agent ??
    translate('localTasks.activity.unknownAgent', 'an agent')
  )
}

/** Activity sentences for workspace and session links (REQ-005, REQ-011). */
export function describeLocalTaskLinkEvent(
  kind: LocalTaskLinkEventKind,
  actor: string,
  payload: Payload
): string {
  switch (kind) {
    case 'workspace-linked': {
      const name = workspaceName(payload)
      const host = text(payload, 'hostLabel')
      if (text(payload, 'via') === 'start') {
        return host
          ? translate(
              'localTasks.activity.workspaceStartedOn',
              '{{actor}} started work in {{name}} on {{host}}',
              {
                actor,
                name,
                host
              }
            )
          : translate(
              'localTasks.activity.workspaceStarted',
              '{{actor}} started work in {{name}}',
              {
                actor,
                name
              }
            )
      }
      return translate(
        'localTasks.activity.workspaceLinked',
        '{{actor}} linked workspace {{name}}',
        {
          actor,
          name
        }
      )
    }
    case 'workspace-unlinked':
      return translate(
        'localTasks.activity.workspaceUnlinked',
        '{{actor}} unlinked workspace {{name}}',
        { actor, name: workspaceName(payload) }
      )
    case 'workspace-host':
      return translate(
        'localTasks.activity.workspaceMoved',
        'Workspace {{name}} now runs on {{to}} (was {{from}})',
        {
          name: workspaceName(payload),
          to: text(payload, 'toHostLabel') ?? text(payload, 'toHostId') ?? '?',
          from: text(payload, 'fromHostLabel') ?? text(payload, 'fromHostId') ?? '?'
        }
      )
    case 'session-linked':
      return text(payload, 'via') === 'start'
        ? translate('localTasks.activity.sessionOpened', '{{actor}} opened a {{agent}} session', {
            actor,
            agent: agentName(payload)
          })
        : translate('localTasks.activity.sessionLinked', '{{actor}} linked a {{agent}} session', {
            actor,
            agent: agentName(payload)
          })
    case 'session-unlinked':
      return translate(
        'localTasks.activity.sessionUnlinked',
        '{{actor}} unlinked a {{agent}} session',
        { actor, agent: agentName(payload) }
      )
  }
}

/** A status change an automatic rule made says which rule did it (REQ-013). */
export function describeLocalTaskRuleStatus(
  payload: Payload,
  from: string,
  to: string
): string | null {
  switch (text(payload, 'rule')) {
    case 'start':
      return translate(
        'localTasks.activity.ruleStart',
        'Work started, so the status moved: {{from}} → {{to}}',
        { from, to }
      )
    case 'pr-merged': {
      const prNumber = payload?.prNumber
      return translate(
        'localTasks.activity.rulePrMerged',
        '#{{number}} was merged, so the task completed: {{from}} → {{to}}',
        { number: typeof prNumber === 'number' ? prNumber : '?', from, to }
      )
    }
    case null:
    default:
      return null
  }
}
