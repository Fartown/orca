import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { localTasksClient } from '@/local-tasks/local-tasks-runtime-client'
import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import {
  dispatchLocalTask,
  type LocalTaskDispatchReceipt as Receipt
} from '@/local-tasks/local-task-dispatch-launch'
import { offerLocalTaskDispatchUndo } from '@/local-tasks/local-task-dispatch-undo'
import type { TuiAgent } from '../../../../shared/tui-agent'

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
  const task = localTasksDomainStore.getState().tasks.find((item) => item.id === receipt.taskId)
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
      <div className="font-medium text-foreground">
        {task ? `${task.ref} · ${task.title}` : receipt.text}
      </div>
      <div className="text-muted-foreground">
        {receipt.kind === 'launched'
          ? receipt.message
            ? translate('localTasks.dispatch.sessionStarted', 'Session started')
            : translate('localTasks.dispatch.started', 'Task dispatched')
          : receipt.kind === 'appended'
            ? translate('localTasks.dispatch.appended', 'Sent to session')
            : (receipt.message ?? translate('localTasks.dispatch.failed', 'Dispatch failed'))}
      </div>
      {receipt.kind === 'launched' && receipt.message ? (
        <div className="text-foreground">{receipt.message}</div>
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
