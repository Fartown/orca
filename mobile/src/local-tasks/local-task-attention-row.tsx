import { Pressable, StyleSheet, Text, View } from 'react-native'
import { formatAgentTypeLabel } from '../../../src/shared/agent-type-label'
import type { LocalTaskAttentionItem } from '../../../src/shared/local-tasks/local-task-link-types'
import { colors, spacing, typography } from '../theme/mobile-theme'
import { formatLocalTaskAgo, localTasksCopy } from './local-tasks-copy'
import type { LocalTaskAttentionRow } from './local-task-progress-projection'
import { localTaskStyles } from './local-tasks-styles'
import type { LocalTaskReplyStatus } from './use-local-task-attention-actions'

type ItemHandlers = {
  errors: Record<string, string>
  replyFor: (itemKey: string) => LocalTaskReplyStatus | null
  onOpenSession: (item: LocalTaskAttentionItem) => void
  onReply: (item: LocalTaskAttentionItem) => void
  /** Both write to the library, so they are off while it cannot take writes. */
  canWrite: boolean
  onMarkSeen: (item: LocalTaskAttentionItem) => void
  onSnooze: (item: LocalTaskAttentionItem) => void
}

/** What an agent said, as the item states it: "finished a turn" names the agent, never the task. */
export function localTaskAttentionLine(item: LocalTaskAttentionItem): string {
  const work = localTasksCopy().work
  const agent = item.agent ? formatAgentTypeLabel(item.agent) : work.someAgent
  if (item.lastMessage) {
    return work.agentSaid(agent, item.lastMessage)
  }
  return item.kind === 'unread-done' ? work.agentStopped(agent) : agent
}

function ReplyState(props: { item: LocalTaskAttentionItem; reply: LocalTaskReplyStatus }) {
  const work = localTasksCopy().work
  const { reply } = props
  const label =
    reply.kind === 'not-sent'
      ? reply.reason
        ? work.replyNotSentBecause(reply.reason)
        : work.replyNotSent
      : work.replyStates[reply.kind]
  return (
    <Text
      testID={`reply-state-${props.item.key}`}
      style={reply.kind === 'not-sent' ? localTaskStyles.errorText : localTaskStyles.meta}
      numberOfLines={2}
    >
      {label}
    </Text>
  )
}

function ItemButton(props: {
  label: string
  testID?: string
  disabled?: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      testID={props.testID}
      style={[localTaskStyles.smallButton, props.disabled && localTaskStyles.disabled]}
      disabled={props.disabled}
      accessibilityRole="button"
      onPress={props.onPress}
    >
      <Text style={localTaskStyles.smallButtonText}>{props.label}</Text>
    </Pressable>
  )
}

/**
 * One item: what it waits for and whose it is on one line, as other rows pair an agent with its
 * state, then its last words and every action in view. Swiping the row still marks or snoozes it
 * whole; the buttons are what a page without swipe hints can be seen to offer.
 */
function AttentionItemLine(props: { item: LocalTaskAttentionItem; handlers: ItemHandlers }) {
  const work = localTasksCopy().work
  const { item, handlers } = props
  const reply = handlers.replyFor(item.key)
  const error = handlers.errors[item.key]
  const sending = reply?.kind === 'sending'
  return (
    <View style={styles.item}>
      <Text style={styles.kind} numberOfLines={1}>
        {work.attentionKinds[item.kind]}
        {item.agent ? (
          <Text style={styles.agent}> · {formatAgentTypeLabel(item.agent)}</Text>
        ) : null}
      </Text>
      {item.lastMessage ? (
        <Text style={localTaskStyles.body} numberOfLines={3}>
          {item.lastMessage}
        </Text>
      ) : null}
      <View style={styles.actions}>
        {item.replyable ? (
          <ItemButton
            testID={`reply-${item.key}`}
            label={reply?.kind === 'not-sent' ? work.editReply : work.reply}
            disabled={sending}
            onPress={() => handlers.onReply(item)}
          />
        ) : null}
        <ItemButton label={work.openSession} onPress={() => handlers.onOpenSession(item)} />
        <ItemButton
          testID={`mark-seen-${item.key}`}
          label={work.markSeen}
          disabled={!handlers.canWrite}
          onPress={() => handlers.onMarkSeen(item)}
        />
        <ItemButton
          testID={`snooze-${item.key}`}
          label={work.snooze}
          disabled={!handlers.canWrite}
          onPress={() => handlers.onSnooze(item)}
        />
      </View>
      {reply ? <ReplyState item={item} reply={reply} /> : null}
      {error ? <Text style={localTaskStyles.errorText}>{error}</Text> : null}
    </View>
  )
}

/** One task's items: ref and title once, then each item with its own actions. */
export function LocalTaskAttentionCard(props: {
  row: LocalTaskAttentionRow
  now: number
  handlers: ItemHandlers
  onOpenTask: (taskId: string) => void
  onMore: () => void
}) {
  const copy = localTasksCopy()
  const { row } = props
  return (
    <View style={styles.card}>
      <Pressable
        style={styles.header}
        onPress={() => props.onOpenTask(row.task.id)}
        onLongPress={props.onMore}
        accessibilityRole="button"
      >
        <Text style={localTaskStyles.mono}>{row.task.ref}</Text>
        <Text style={styles.title} numberOfLines={1}>
          {row.task.title}
        </Text>
        <Text style={localTaskStyles.meta}>{formatLocalTaskAgo(copy, row.since, props.now)}</Text>
      </Pressable>
      {row.items.map((item) => (
        <AttentionItemLine key={item.key} item={item} handlers={props.handlers} />
      ))}
    </View>
  )
}

export type LocalTaskAttentionItemHandlers = ItemHandlers

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgPanel,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, color: colors.textPrimary, fontSize: typography.bodySize, fontWeight: '600' },
  item: { gap: 4 },
  kind: { color: colors.statusAmber, fontSize: typography.metaSize, fontWeight: '600' },
  agent: { color: colors.textSecondary, fontWeight: '400' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 2 }
})
