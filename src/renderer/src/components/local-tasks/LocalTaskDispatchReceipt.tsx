import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { localTasksClient } from '@/local-tasks/local-tasks-runtime-client'
import { localTasksDomainStore, useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { openLocalTaskReceiptPreview } from '@/local-tasks/local-task-receipt-preview'
import {
  openLocalTaskSession,
  revealLocalTaskSession
} from '@/local-tasks/local-task-session-reveal'
import {
  dispatchLocalTask,
  type LocalTaskDispatchReceipt as Receipt
} from '@/local-tasks/local-task-dispatch-launch'
import {
  dispatchedSessionIds,
  finishLocalTaskDispatchRecord,
  revealDispatchedSession
} from '@/local-tasks/local-task-dispatch-record'
import { offerLocalTaskDispatchUndo } from '@/local-tasks/local-task-dispatch-undo'
import type { TuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent'
import type { LocalTaskSessionLink } from '../../../../shared/local-tasks/local-task-link-types'

function startedSession(receipt: Receipt): LocalTaskSessionLink | null {
  if (receipt.kind !== 'launched' || !receipt.launch) {
    return null
  }
  const { launch } = receipt
  const ids = dispatchedSessionIds(launch.outcome)
  return (
    localTasksDomainStore
      .getState()
      .links.sessions.find(
        (link) =>
          link.taskId === receipt.taskId &&
          link.hostId === launch.hostId &&
          link.worktreeId === launch.worktreeId &&
          ((ids.sessionId && link.sessionId === ids.sessionId) ||
            (ids.paneKey && link.paneKey === ids.paneKey) ||
            (ids.tabId && link.tabId === ids.tabId))
      ) ?? null
  )
}

function openStartedSession(receipt: Receipt): void {
  const link = startedSession(receipt)
  if (link) {
    openLocalTaskSession(link)
  } else if (receipt.launch) {
    const ids = dispatchedSessionIds(receipt.launch.outcome)
    revealLocalTaskSession({
      id: '',
      taskId: receipt.taskId,
      hostId: receipt.launch.hostId,
      worktreeId: receipt.launch.worktreeId,
      instanceId: null,
      surface: ids.surface,
      tabId: ids.tabId ?? null,
      paneKey: ids.paneKey ?? null,
      sessionId: ids.sessionId ?? null,
      providerSession: null,
      agent: null,
      linkedVia: 'start',
      openedAt: 0
    })
  }
}

export function LocalTaskDispatchReceipt({
  receipt,
  agent,
  onChange
}: {
  receipt: Receipt
  agent: TuiAgent
  onChange: (receipt: Receipt | null) => void
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const task = useLocalTasksDomain((state) =>
    state.tasks.find((item) => item.id === receipt.taskId)
  )
  const retry = async (): Promise<void> => {
    setBusy(true)
    try {
      const next = await dispatchLocalTask({
        target: receipt.target,
        text: receipt.text,
        agent,
        existingTaskId: receipt.taskId || undefined
      })
      onChange(next)
      offerLocalTaskDispatchUndo(next)
    } finally {
      setBusy(false)
    }
  }
  // Why no relaunch: the session already runs; only its record under the task is missing.
  const recordAgain = async (): Promise<void> => {
    setBusy(true)
    try {
      onChange(await finishLocalTaskDispatchRecord(receipt))
    } finally {
      setBusy(false)
    }
  }
  const remove = async (): Promise<void> => {
    setBusy(true)
    try {
      if (!receipt.taskId || !receipt.createdTaskIds.includes(receipt.taskId)) {
        return
      }
      const result = await localTasksClient.removeTask(receipt.taskId)
      if (result.ok) {
        onChange(null)
      }
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3 text-xs">
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground" title={task?.title ?? receipt.text}>
          {task?.title ?? receipt.text}
        </div>
        {task ? <div className="font-mono text-2xs text-muted-foreground">{task.ref}</div> : null}
      </div>
      <div
        className={receipt.kind === 'unrecorded' ? 'text-status-warning' : 'text-muted-foreground'}
      >
        {receipt.kind === 'launched'
          ? receipt.message
            ? translate('localTasks.dispatch.sessionStarted', 'Session started')
            : translate('localTasks.dispatch.started', 'Task dispatched')
          : receipt.kind === 'appended'
            ? translate('localTasks.dispatch.appended', 'Sent to session')
            : (receipt.message ?? translate('localTasks.dispatch.failed', 'Dispatch failed'))}
      </div>
      {(receipt.kind === 'launched' || receipt.kind === 'appended') && receipt.message ? (
        <div className="text-status-warning">{receipt.message}</div>
      ) : null}
      {(receipt.kind === 'launched' || receipt.kind === 'appended') && task ? (
        <div className="flex flex-wrap gap-2">
          <Button size="xs" variant="outline" onClick={() => openLocalTaskReceiptPreview(task)}>
            {translate('localTasks.dispatch.previewTask', 'Preview task')}
          </Button>
          {(receipt.kind === 'launched' && receipt.launch) || receipt.appendedSession ? (
            <Button
              size="xs"
              variant="ghost"
              onClick={() =>
                receipt.appendedSession
                  ? openLocalTaskSession(receipt.appendedSession)
                  : openStartedSession(receipt)
              }
            >
              {translate('localTasks.dispatch.previewSession', 'Preview session')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {receipt.kind === 'unrecorded' ? (
        <div className="flex gap-2">
          <Button size="xs" variant="outline" disabled={busy} onClick={() => void recordAgain()}>
            {translate('localTasks.dispatch.recordAgain', 'Record again')}
          </Button>
          <Button
            size="xs"
            variant="ghost"
            disabled={busy}
            onClick={() => revealDispatchedSession(receipt)}
          >
            {translate('localTasks.needsYou.item.open', 'Open session')}
          </Button>
        </div>
      ) : null}
      {receipt.kind === 'failed' ? (
        <div className="flex gap-2">
          <Button size="xs" variant="outline" disabled={busy} onClick={() => void retry()}>
            {translate('localTasks.dispatch.retry', 'Retry')}
          </Button>
          {receipt.createdTaskIds.includes(receipt.taskId) ? (
            <Button size="xs" variant="ghost" disabled={busy} onClick={() => void remove()}>
              {translate('localTasks.dispatch.deleteTask', 'Delete task')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {receipt.kind === 'unconfirmed' ? (
        <span className="text-muted-foreground">
          {translate(
            'localTasks.dispatch.checkBeforeRetry',
            'Check the workspace before trying again'
          )}
        </span>
      ) : null}
    </div>
  )
}
