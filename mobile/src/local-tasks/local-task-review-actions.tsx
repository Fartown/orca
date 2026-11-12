import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Check, CircleCheck, Undo2 } from 'lucide-react-native'
import { parseLocalTaskProgressSections } from '../../../src/shared/local-tasks/local-task-progress-sections'
import { localTaskFinishedSessions } from '../../../src/shared/local-tasks/local-task-finished-sessions'
import { localTaskNeedsReview } from '../../../src/shared/local-tasks/local-task-review-items'
import { localTaskWritebackSection } from '../../../src/shared/local-tasks/local-task-writebacks'
import type { LocalTask, LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import { translate } from '../i18n/mobile-i18n'
import { colors, spacing, typography } from '../theme/mobile-theme'
import type { LocalTasksApi } from './local-tasks-api'
import type { LocalTasksCopy } from './local-tasks-copy'
import type { LocalTaskSite } from './local-task-endpoint'
import { localTaskWriteMessage } from './local-task-failure-message'
import { createLocalTaskOperationIds, sendLocalTaskWrite } from './local-task-operation-ids'
import { LocalTaskReplyDrawer } from './local-task-reply-drawer'
import { sendLocalTaskReply } from './local-task-reply-send'
import { localTasksPageCopy } from './local-tasks-page-copy'
import { localTaskStyles } from './local-tasks-styles'
import type { LocalTasksLibrary } from './use-local-tasks-library'

function rejectCopy() {
  return {
    noFinishedSession: translate(
      'localTasks.rejectNoFinishedSession',
      'Reason saved. No session has finished a turn to take it; open one, or start a new session from the task.'
    ),
    notSent: (missed: number, total: number, reason: string): string =>
      translate(
        'localTasks.rejectNotSent',
        'Reason saved, but {{missed}} of {{total}} sessions did not get it: {{reason}}',
        { missed, total, reason }
      )
  }
}

export function LocalTaskReviewActions(props: {
  task: LocalTask
  project: LocalTaskProject | null
  api: LocalTasksApi
  site: LocalTaskSite
  library: LocalTasksLibrary
  copy: LocalTasksCopy
  readOnly: boolean
  /** The PR as its host has it, when read. */
  detail?: string | null
  /** The latest writeback, whose 自检 / 验收 lines the block repeats. */
  latestBody?: string | null
  onUpdateStatus: (statusId: string) => Promise<boolean>
  onError: (message: string | null) => void
}) {
  const [commentIds] = useState(() => createLocalTaskOperationIds())
  const [rejecting, setRejecting] = useState(false)
  const [reasonDraft, setReasonDraft] = useState('')
  const [savedReason, setSavedReason] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  // Why a ref too: two taps land before the state above re-renders the button disabled.
  const inFlight = useRef(false)
  const statusFor = (category: 'started' | 'completed') =>
    props.project?.statuses.find((entry) => entry.category === category)?.id ?? null
  const connected = props.site.connState === 'connected'
  const sendBack = async (reason: string) => {
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
    const progress = new Map(
      (props.library.work.progress?.sessions ?? []).map((entry) => [entry.taskSessionId, entry])
    )
    const sessions = localTaskFinishedSessions({
      taskId: props.task.id,
      tasks: props.library.tasks,
      sessions: props.library.work.links.sessions,
      stateOf: (sessionLinkId) => progress.get(sessionLinkId)?.state
    })
    if (sessions.length === 0) {
      props.onError(rejectCopy().noFinishedSession)
      return
    }
    const work = props.copy.work
    const reasons: string[] = []
    for (const session of sessions) {
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
        reasons.push(outcome.reason ?? '')
      }
    }
    if (reasons.length > 0) {
      props.onError(rejectCopy().notSent(reasons.length, sessions.length, reasons[0] ?? ''))
    }
  }
  const reject = async () => {
    const reason = reasonDraft.trim()
    if (!reason || !connected || inFlight.current) {
      return
    }
    inFlight.current = true
    setSending(true)
    try {
      await sendBack(reason)
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }
  if (!localTaskNeedsReview(props.task, props.project ?? undefined)) {
    return null
  }
  const acceptDisabled = props.readOnly || !connected || !statusFor('completed')
  const rejectDisabled = props.readOnly || !connected
  const page = localTasksPageCopy()
  // Only facts the host or the agent's writeback actually gave (m7).
  const sections = props.latestBody ? parseLocalTaskProgressSections(props.latestBody) : null
  const facts = [
    [page.mergedInto, props.detail ?? null],
    [page.selfCheck, localTaskWritebackSection(sections, 'selfCheck')],
    [page.whereToVerify, localTaskWritebackSection(sections, 'verify')]
  ].flatMap(([label, text]) => (label && text ? [{ label, text }] : []))
  return (
    <>
      <View style={[localTaskStyles.card, styles.block]} testID="local-task-review-block">
        <View style={styles.head}>
          <CircleCheck size={14} color={colors.statusGreen} />
          <Text style={styles.title}>{props.copy.work.card.awaitingAcceptance}</Text>
        </View>
        {facts.map((fact) => (
          <View key={fact.label} style={styles.fact}>
            <Text style={[localTaskStyles.meta, styles.factLabel]}>{fact.label}</Text>
            <Text style={[localTaskStyles.body, styles.factText]}>{fact.text}</Text>
          </View>
        ))}
        <View style={styles.actions}>
          <Pressable
            style={[
              localTaskStyles.secondaryButton,
              styles.action,
              rejectDisabled && localTaskStyles.disabled
            ]}
            disabled={rejectDisabled}
            onPress={() => setRejecting(true)}
            accessibilityRole="button"
          >
            <Undo2 size={15} color={colors.textPrimary} />
            <Text style={localTaskStyles.secondaryButtonText}>{props.copy.rejectReview}</Text>
          </Pressable>
          <Pressable
            style={[
              localTaskStyles.primaryButton,
              styles.action,
              acceptDisabled && localTaskStyles.disabled
            ]}
            disabled={acceptDisabled}
            onPress={() => {
              const completed = statusFor('completed')
              if (completed) {
                void props.onUpdateStatus(completed)
              }
            }}
            accessibilityRole="button"
          >
            <Check size={15} color={colors.bgBase} />
            <Text style={localTaskStyles.primaryButtonText}>{props.copy.acceptReview}</Text>
          </Pressable>
        </View>
      </View>
      <LocalTaskReplyDrawer
        visible={rejecting}
        title={props.copy.rejectReason}
        draft={reasonDraft}
        connected={connected}
        sending={sending}
        hostLabel={props.site.label}
        onChangeDraft={setReasonDraft}
        onSend={() => void reject()}
        onClose={() => setRejecting(false)}
      />
    </>
  )
}

const styles = StyleSheet.create({
  block: { marginTop: spacing.md, padding: spacing.md, gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: colors.statusGreen, fontSize: typography.bodySize, fontWeight: '600' },
  fact: { flexDirection: 'row', gap: spacing.md },
  factLabel: { width: 72, paddingTop: 2 },
  factText: { flex: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 }
})
