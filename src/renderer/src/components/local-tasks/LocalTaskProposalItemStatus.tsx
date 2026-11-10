import {
  Check,
  Circle,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleX,
  LoaderCircle,
  Unplug,
  X
} from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { getAgentLabel } from '@/lib/agent-catalog'
import { localTaskPageStore } from '@/local-tasks/local-task-page-store'
import type { LocalTaskProposalNames } from '@/local-tasks/local-task-proposal-copy'
import type { LocalTaskProposalLock } from '@/local-tasks/local-task-proposal-item-facts'
import type {
  LocalTaskProposalItemProgress,
  LocalTaskProposalItemStage
} from '@/local-tasks/local-task-proposal-progress'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import { useLocalTaskHostLabel } from './LocalTaskHostLabel'
import { localTaskSessionStateLabel } from './LocalTaskProgress'

// Where a proposal item stands: why it cannot be kept yet, and how it went once confirmed.

export function localTaskProposalStageLabel(stage: LocalTaskProposalItemStage): string {
  switch (stage) {
    case 'done':
      return translate('localTasks.dispatcher.stage.done', 'Done')
    case 'failed':
      return translate('localTasks.dispatcher.stage.failed', 'Didn’t work')
    case 'running':
      return translate('localTasks.dispatcher.running', 'Running…')
    case 'waiting':
      return translate('localTasks.dispatcher.stage.waiting', 'Waiting')
    case 'unknown':
      return translate('localTasks.dispatcher.stage.unknown', 'Result unknown')
    case 'skipped':
      return translate('localTasks.dispatcher.stage.skipped', 'Not run')
    case 'unverifiable':
      return translate('localTasks.links.state.unverifiable', 'Can’t confirm')
    case 'dropped':
      return translate('localTasks.dispatcher.stage.dropped', 'Dropped')
  }
}

export function LocalTaskProposalStageIcon({
  stage
}: {
  stage: LocalTaskProposalItemStage
}): React.JSX.Element {
  switch (stage) {
    case 'done':
      return <CircleCheck className="size-3.5 text-status-success" aria-hidden />
    case 'failed':
      return <CircleX className="size-3.5 text-status-warning" aria-hidden />
    case 'running':
      return (
        <LoaderCircle
          className="size-3.5 animate-spin text-muted-foreground motion-reduce:animate-none"
          aria-hidden
        />
      )
    case 'unknown':
      return <CircleDashed className="size-3.5 text-status-warning" aria-hidden />
    case 'unverifiable':
      return <CircleDashed className="size-3.5 text-muted-foreground" aria-hidden />
    case 'dropped':
      return <X className="size-3.5 text-muted-foreground" aria-hidden />
    case 'waiting':
    case 'skipped':
      return <Circle className="size-2.5 text-muted-foreground" aria-hidden />
  }
}

function lockText(lock: LocalTaskProposalLock, host: string): string {
  switch (lock.kind) {
    case 'host-offline':
      return lock.item === 'append'
        ? translate(
            'localTasks.dispatcher.lock.appendOffline',
            '{{host}} is not connected: this can’t be sent, and the session’s state can’t be confirmed. Confirm this step once it is back in contact.',
            { host }
          )
        : lock.item === 'stop'
          ? translate(
              'localTasks.dispatcher.lock.stopOffline',
              '{{host}} is not connected: the session can’t be stopped, and whether it still runs can’t be confirmed. Confirm this step once it is back in contact.',
              { host }
            )
          : translate(
              'localTasks.dispatcher.lock.hostOffline',
              '{{host}} is not connected: confirm this step once it is back in contact.',
              { host }
            )
    case 'project-unpicked':
      return translate(
        'localTasks.dispatcher.lock.pickProject',
        'This repository belongs to several projects. Pick one first.'
      )
    case 'session-ended':
      return translate('localTasks.dispatcher.lock.ended', 'This session has ended.')
    case 'session-missing':
      return translate('localTasks.dispatcher.lock.missing', 'This session can’t be found here.')
    case 'session-unverifiable':
      return translate(
        'localTasks.dispatcher.lock.unverifiable',
        'The session’s state can’t be confirmed right now.'
      )
    case 'session-busy':
      return translate(
        'localTasks.dispatcher.lock.busy',
        '{{agent}} is “{{state}}”: append once it finishes a turn.',
        {
          agent: isTuiAgent(lock.agent)
            ? getAgentLabel(lock.agent)
            : translate('localTasks.links.agent', 'Agent'),
          state: localTaskSessionStateLabel(lock.state)
        }
      )
  }
}

/** Why the item cannot be kept right now, said under it. */
export function LocalTaskProposalLockNote({
  lock,
  hostId
}: {
  lock: LocalTaskProposalLock
  hostId: string | null
}): React.JSX.Element {
  const host = useLocalTaskHostLabel(hostId)
  return (
    <p className="flex min-w-0 items-start gap-1.5 text-2xs text-status-warning">
      {lock.kind === 'host-offline' ? (
        <Unplug className="mt-px size-3 shrink-0" aria-hidden />
      ) : (
        <CircleAlert className="mt-px size-3 shrink-0" aria-hidden />
      )}
      <span className="min-w-0 break-words">{lockText(lock, host)}</span>
    </p>
  )
}

function TaskRef({ taskId, label }: { taskId: string; label: string }): React.JSX.Element {
  const known = useLocalTasksDomain((state) => state.tasks.some((task) => task.id === taskId))
  return known ? (
    <button
      type="button"
      onClick={() => localTaskPageStore.getState().openDetail(taskId)}
      className="rounded-sm bg-muted px-1.5 font-mono text-2xs leading-4 text-foreground hover:bg-accent"
    >
      {label}
    </button>
  ) : (
    <span className="rounded-sm bg-muted px-1.5 font-mono text-2xs leading-4 text-muted-foreground">
      {label}
    </span>
  )
}

/** What a recorded result says, or why an item's result is unknown. */
export function LocalTaskProposalItemOutcome({
  progress,
  names
}: {
  progress: LocalTaskProposalItemProgress
  names: LocalTaskProposalNames
}): React.JSX.Element | null {
  const { stage, result } = progress
  const ref = result?.taskId ? (
    <TaskRef taskId={result.taskId} label={names.taskRef(result.taskId)} />
  ) : null
  if (stage === 'done') {
    return ref ? (
      <span className="flex items-center gap-1.5 text-2xs text-status-success">
        <Check className="size-3 shrink-0" aria-hidden />
        {ref}
      </span>
    ) : null
  }
  if (stage === 'failed') {
    return (
      <span className="flex min-w-0 items-start gap-1.5 text-2xs text-status-warning">
        <CircleX className="mt-px size-3 shrink-0" aria-hidden />
        <span className="min-w-0 break-words">
          {translate('localTasks.dispatcher.result.failed', 'Didn’t work: {{detail}}', {
            detail: result?.detail ?? '—'
          })}
        </span>
        {ref}
      </span>
    )
  }
  if (stage === 'unknown') {
    return (
      <span className="flex min-w-0 items-start gap-1.5 text-2xs text-status-warning">
        <CircleDashed className="mt-px size-3 shrink-0" aria-hidden />
        <span className="min-w-0 break-words">
          {translate(
            'localTasks.dispatcher.result.unknown',
            'The execution window disconnected before this step reported. Check the task before deciding whether to redo it.'
          )}
        </span>
      </span>
    )
  }
  return null
}
