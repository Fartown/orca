import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import { firstStatusInCategory } from '@/local-tasks/local-task-grouping'
import { updateLocalTaskFields, runLocalTaskWrite } from '@/local-tasks/local-task-writes'
import { localTasksClient } from '@/local-tasks/local-tasks-runtime-client'
import { localTasksDomainStore } from '@/local-tasks/local-tasks-domain-store'
import { sendLocalTaskReply } from '@/local-tasks/local-task-needs-you-actions'
import { isLocalTaskHostInContact } from '@/local-tasks/local-task-host-contact'
import { useAppStore } from '@/store'
import { runLocalTaskStart } from '@/local-tasks/local-task-work-actions'
import { localTaskLinkDialogStore } from '@/local-tasks/local-task-link-dialog-store'
import { localTaskPromptFor } from '@/local-tasks/local-task-session-launch'
import { findLocalTaskEffectiveWorkspace } from '@/local-tasks/local-task-link-selectors'
import type { LocalTask, LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'

export function LocalTaskAcceptanceStrip({
  task,
  project,
  writable
}: {
  task: LocalTask
  project: LocalTaskProject | undefined
  writable: boolean
}): React.JSX.Element | null {
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  if (project?.statuses.find((status) => status.id === task.statusId)?.category !== 'review') {
    return null
  }
  const completed = firstStatusInCategory(project, 'completed')
  const started = firstStatusInCategory(project, 'started')
  const reject = async (): Promise<void> => {
    if (!started || !reason.trim() || busy) {
      return
    }
    setBusy(true)
    try {
      const comment = await runLocalTaskWrite(() =>
        localTasksClient.addComment(task.id, reason.trim())
      )
      if (!comment) {
        return
      }
      const result = await updateLocalTaskFields(task, { statusId: started.id })
      if (result === false) {
        return
      }
      const domain = localTasksDomainStore.getState()
      const sessions = domain.links.sessions.filter(
        (session) =>
          session.taskId === task.id && domain.progress?.sessions.get(session.id)?.state === 'done'
      )
      let unsent = false
      for (const session of sessions) {
        if (!isLocalTaskHostInContact(useAppStore.getState(), session.hostId)) {
          unsent = true
          continue
        }
        if ((await sendLocalTaskReply(session, reason.trim())).status !== 'sent') {
          unsent = true
        }
      }
      if (sessions.length === 0) {
        const workspace = findLocalTaskEffectiveWorkspace(
          domain.links,
          task,
          new Map(domain.tasks.map((candidate) => [candidate.id, candidate]))
        )
        if (workspace) {
          localTaskLinkDialogStore.getState().open({
            kind: 'session',
            taskId: task.id,
            prompt: `${reason.trim()}\n\n${localTaskPromptFor(task)}`
          })
        } else {
          runLocalTaskStart(task, project, null, {
            prompt: `${reason.trim()}\n\n${localTaskPromptFor(task)}`
          })
        }
      }
      if (unsent) {
        toast.info(
          translate('localTasks.acceptance.notSent', 'Feedback saved. Open the session to send it.')
        )
      }
      setRejecting(false)
      setReason('')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-3 border-b border-border pb-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-sm font-medium">
          {translate('localTasks.acceptance.title', 'Ready for acceptance')}
        </span>
        <Button
          size="sm"
          disabled={!writable || busy || !completed}
          onClick={async () => {
            if (!completed) {
              return
            }
            setBusy(true)
            try {
              await updateLocalTaskFields(task, { statusId: completed.id })
            } finally {
              setBusy(false)
            }
          }}
        >
          {translate('localTasks.acceptance.accept', 'Accept')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!writable || busy || !started}
          onClick={() => setRejecting(!rejecting)}
        >
          {translate('localTasks.acceptance.reject', 'Send back')}
        </Button>
      </div>
      {rejecting ? (
        <div className="flex flex-col gap-2">
          <Textarea
            autoFocus
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={busy}
            aria-label={translate('localTasks.acceptance.reason', 'What needs to change?')}
            placeholder={translate('localTasks.acceptance.reason', 'What needs to change?')}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRejecting(false)}>
              {translate('localTasks.common.cancel', 'Cancel')}
            </Button>
            <Button size="sm" disabled={!reason.trim() || busy} onClick={() => void reject()}>
              {translate('localTasks.acceptance.sendBack', 'Save and send feedback')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
