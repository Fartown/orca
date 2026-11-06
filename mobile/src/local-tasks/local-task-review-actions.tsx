import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { localTaskNeedsReview } from '../../../src/shared/local-tasks/local-task-review-items'
import type { LocalTask, LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import { spacing } from '../theme/mobile-theme'
import type { LocalTasksApi } from './local-tasks-api'
import type { LocalTasksCopy } from './local-tasks-copy'
import type { LocalTaskSite } from './local-task-endpoint'
import { localTaskWriteMessage } from './local-task-failure-message'
import { createLocalTaskOperationIds, sendLocalTaskWrite } from './local-task-operation-ids'
import { LocalTaskReplyDrawer } from './local-task-reply-drawer'
import { sendLocalTaskReply } from './local-task-reply-send'
import { localTaskStyles } from './local-tasks-styles'
import type { LocalTasksLibrary } from './use-local-tasks-library'

export function LocalTaskReviewActions(props: {
  task: LocalTask
  project: LocalTaskProject | null
  api: LocalTasksApi
  site: LocalTaskSite
  library: LocalTasksLibrary
  copy: LocalTasksCopy
  readOnly: boolean
  onUpdateStatus: (statusId: string) => Promise<boolean>
  onError: (message: string | null) => void
}) {
  const [commentIds] = useState(() => createLocalTaskOperationIds())
  const [rejecting, setRejecting] = useState(false)
  const [reasonDraft, setReasonDraft] = useState('')
  const [savedReason, setSavedReason] = useState<string | null>(null)
  const statusFor = (category: 'started' | 'completed') =>
    props.project?.statuses.find((entry) => entry.category === category)?.id ?? null
  const connected = props.site.connState === 'connected'
  const reject = async () => {
    const reason = reasonDraft.trim()
    if (!reason || !connected) {
      return
    }
    if (savedReason !== reason) {
      const comment = await sendLocalTaskWrite(
        commentIds,
        { taskId: props.task.id, body: reason },
        props.api.addComment
      )
      props.onError(localTaskWriteMessage(props.copy, comment))
      if (comment.kind !== 'ok') {
        return
      }
      setSavedReason(reason)
    }
    const started = statusFor('started')
    if (!started || !(await props.onUpdateStatus(started))) {
      return
    }
    setRejecting(false)
    setReasonDraft('')
    setSavedReason(null)
    props.library.reload(['events', 'tasks'])
    const session = props.library.work.links.sessions.find(
      (entry) => entry.id === props.task.latestProgress?.sessionLinkId
    )
    if (!session) {
      return
    }
    const work = props.copy.work
    const outcome = await sendLocalTaskReply({
      client: props.site.client,
      session,
      text: reason,
      reasons: {
        missing: work.replySessionMissing,
        notConnected: work.replyNotConnected,
        inputNotCleared: work.replyInputNotCleared,
        inputRefused: work.replyInputRefused,
        chatNotReady: work.replyChatNotReady
      }
    })
    if (outcome.kind === 'not-sent') {
      props.onError(work.replyNotSentBecause(outcome.reason ?? ''))
    }
  }
  if (!localTaskNeedsReview(props.task, props.project ?? undefined)) {
    return null
  }
  return (
    <>
      <View style={styles.actions}>
        <Pressable
          style={localTaskStyles.smallButton}
          disabled={props.readOnly || !connected || !statusFor('completed')}
          onPress={() => {
            const completed = statusFor('completed')
            if (completed) {
              void props.onUpdateStatus(completed)
            }
          }}
          accessibilityRole="button"
        >
          <Text style={localTaskStyles.smallButtonText}>{props.copy.acceptReview}</Text>
        </Pressable>
        <Pressable
          style={localTaskStyles.smallButton}
          disabled={props.readOnly || !connected}
          onPress={() => setRejecting(true)}
          accessibilityRole="button"
        >
          <Text style={localTaskStyles.smallButtonText}>{props.copy.rejectReview}</Text>
        </Pressable>
      </View>
      <LocalTaskReplyDrawer
        visible={rejecting}
        title={props.copy.rejectReason}
        draft={reasonDraft}
        connected={connected}
        hostLabel={props.site.label}
        onChangeDraft={setReasonDraft}
        onSend={() => void reject()}
        onClose={() => setRejecting(false)}
      />
    </>
  )
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }
})
