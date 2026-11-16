import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { LocalTaskSessionLink } from '../../../shared/local-tasks/local-task-link-types'
import type { LocalTask } from '../../../shared/local-tasks/local-task-types'
import type { LocalTaskDispatchCandidate } from './local-task-dispatch-candidates'
import type { LocalTaskDispatchReceipt } from './local-task-dispatch-launch'
import { isLocalTaskSessionInContact } from './local-task-session-execution-contact'
import { sendLocalTaskReply } from './local-task-needs-you-actions'
import { localTasksClient } from './local-tasks-runtime-client'

/** Sends the line into every finished session (REQ-029); the comment keeps it on the task. */
export async function appendToFinishedSessions(
  task: LocalTask,
  sessions: readonly LocalTaskSessionLink[],
  target: LocalTaskDispatchCandidate,
  text: string
): Promise<LocalTaskDispatchReceipt> {
  const refused = (message: string): LocalTaskDispatchReceipt => ({
    kind: 'failed',
    taskId: task.id,
    createdTaskIds: [],
    target,
    text,
    message
  })
  const state = useAppStore.getState()
  const reachable = sessions.filter((session) => isLocalTaskSessionInContact(state, session))
  if (reachable.length === 0) {
    return refused(translate('localTasks.dispatch.hostNotConnected', 'Host not connected'))
  }
  let sent = 0
  let appendedSession: LocalTaskSessionLink | null = null
  for (const session of reachable) {
    if ((await sendLocalTaskReply(session, text)).status === 'sent') {
      sent += 1
      appendedSession ??= session
    }
  }
  if (sent === 0) {
    return refused(
      translate('localTasks.dispatch.appendFailed', 'Could not send to the finished session')
    )
  }
  // Why caught: the line already went out, so a failed record must not invite a resend.
  const commented = await localTasksClient.addComment(task.id, text).then(
    (result) => result.ok,
    () => false
  )
  const notes = [
    sent < sessions.length
      ? translate(
          'localTasks.dispatch.appendPartial',
          '{{missed}} of {{total}} finished sessions did not get it',
          { missed: sessions.length - sent, total: sessions.length }
        )
      : null,
    commented
      ? null
      : translate(
          'localTasks.dispatch.appendNotRecorded',
          'Sent, but it could not be recorded on the task'
        )
  ].filter((note) => note !== null)
  return {
    kind: 'appended',
    taskId: task.id,
    createdTaskIds: [],
    target,
    text,
    ...(appendedSession ? { appendedSession } : {}),
    message: notes.length > 0 ? notes.join(' ') : null
  }
}
