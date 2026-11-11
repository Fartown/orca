import { Pressable, StyleSheet, Text, View } from 'react-native'
import { formatAgentTypeLabel } from '../../../src/shared/agent-type-label'
import type {
  LocalTaskAttentionItem,
  LocalTaskAttentionKind
} from '../../../src/shared/local-tasks/local-task-link-types'
import type { LocalTaskStatusDef } from '../../../src/shared/local-tasks/local-task-types'
import { AgentStateDot } from '../components/AgentStateDot'
import { colors, spacing, typography } from '../theme/mobile-theme'
import {
  LocalTaskCardButton,
  LocalTaskCardLatestLine,
  LocalTaskCardMeta,
  LocalTaskSubtaskSummary,
  localTaskCardStyles,
  localTaskLeadItem
} from './local-task-card'
import type { LocalTaskCardFacts } from './local-task-card-facts'
import { formatLocalTaskAgo, localTasksCopy } from './local-tasks-copy'
import type { LocalTaskAttentionRow } from './local-task-progress-projection'
import { localTaskStyles } from './local-tasks-styles'
import { LocalTaskStatusIcon } from './local-tasks-visuals'
import type { LocalTaskReplyStatus } from './use-local-task-attention-actions'

export type LocalTaskAttentionItemHandlers = {
  errors: Record<string, string>
  replyFor: (itemKey: string) => LocalTaskReplyStatus | null
  /** A chat session opens in the drawer; a terminal one opens its session page. */
  onPreview: (taskSessionId: string) => void
  onOpenSession: (taskSessionId: string) => void
  onReply: (item: LocalTaskAttentionItem) => void
  /** Snoozing writes to the library, so it is off while it cannot take writes. */
  canWrite: boolean
  onSnooze: (items: LocalTaskAttentionItem[]) => void
}

const ATTENTION_DOT: Record<LocalTaskAttentionKind, 'waiting' | 'blocked' | 'done'> = {
  approval: 'waiting',
  question: 'waiting',
  blocked: 'blocked',
  'unread-done': 'done'
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

/** A reply typed from the list: only a finished turn takes one; its outcome stays on the card. */
function ReplyButton(props: {
  item: LocalTaskAttentionItem
  handlers: LocalTaskAttentionItemHandlers
}) {
  const work = localTasksCopy().work
  const reply = props.handlers.replyFor(props.item.key)
  return (
    <Pressable
      testID={`reply-${props.item.key}`}
      style={[localTaskStyles.smallButton, reply?.kind === 'sending' && localTaskStyles.disabled]}
      disabled={reply?.kind === 'sending'}
      accessibilityRole="button"
      onPress={() => props.handlers.onReply(props.item)}
    >
      <Text style={localTaskStyles.smallButtonText}>
        {reply?.kind === 'not-sent' ? work.editReply : work.reply}
      </Text>
    </Pressable>
  )
}

function ItemOutcome(props: {
  item: LocalTaskAttentionItem
  handlers: LocalTaskAttentionItemHandlers
}) {
  const reply = props.handlers.replyFor(props.item.key)
  const error = props.handlers.errors[props.item.key]
  return (
    <>
      {reply ? <ReplyState item={props.item} reply={reply} /> : null}
      {error ? <Text style={localTaskStyles.errorText}>{error}</Text> : null}
    </>
  )
}

/** Another session of the same task waiting too: what it waits for, and its own way in. */
function OtherItemLine(props: {
  item: LocalTaskAttentionItem
  handlers: LocalTaskAttentionItemHandlers
}) {
  const work = localTasksCopy().work
  const { item, handlers } = props
  return (
    <View style={styles.other}>
      <Pressable
        style={styles.otherLine}
        onPress={() => handlers.onPreview(item.taskSessionId)}
        accessibilityRole="button"
      >
        <AgentStateDot state={ATTENTION_DOT[item.kind]} />
        <Text style={[localTaskStyles.meta, styles.shrink]} numberOfLines={1}>
          {`${work.attentionKinds[item.kind]} · ${localTaskAttentionLine(item)}`}
        </Text>
      </Pressable>
      {item.replyable ? <ReplyButton item={item} handlers={handlers} /> : null}
      <ItemOutcome item={item} handlers={handlers} />
    </View>
  )
}

/**
 * One task in "Needs you": a session waiting on the user (its question and three ways to act on
 * it), or a task awaiting acceptance (its latest line, its subtasks, Preview, Review, Remind later).
 */
export function LocalTaskAttentionCard(props: {
  row: LocalTaskAttentionRow
  facts: LocalTaskCardFacts
  status: LocalTaskStatusDef | null
  /** For a review card: the PR as its host has it, when read. */
  reviewDetail: string | null
  now: number
  first: boolean
  handlers: LocalTaskAttentionItemHandlers
  onOpenTask: (taskId: string) => void
  onMore: () => void
}) {
  const copy = localTasksCopy()
  const card = copy.work.card
  const { row, facts, handlers } = props
  // A review card leads with acceptance; any session also waiting lists under it.
  const lead = row.review ? null : localTaskLeadItem(row.items)
  const others = row.items.filter((item) => item !== lead)
  const snooze = (
    <LocalTaskCardButton
      testID={`snooze-${row.task.id}`}
      label={card.remindLater}
      icon="later"
      disabled={!handlers.canWrite || row.items.length === 0}
      onPress={() => handlers.onSnooze(row.items)}
    />
  )
  return (
    <View style={[styles.block, styles.card, props.first && styles.blockFirst]}>
      <View style={styles.icon}>
        {row.review || !lead ? (
          <LocalTaskStatusIcon
            category={props.status?.category ?? 'review'}
            color={props.status?.color ?? 'green'}
          />
        ) : (
          <AgentStateDot state={ATTENTION_DOT[lead.kind]} />
        )}
      </View>
      <View style={styles.main}>
        <Pressable
          style={({ pressed }) => [styles.main, pressed && styles.pressed]}
          onPress={() => props.onOpenTask(row.task.id)}
          onLongPress={props.onMore}
          delayLongPress={350}
          accessibilityRole="button"
          accessibilityLabel={`${row.task.title} ${row.task.ref}`}
        >
          <View style={styles.titleLine}>
            <Text style={styles.title} numberOfLines={1}>
              {row.task.title}
            </Text>
            <Text style={localTaskStyles.meta}>
              {formatLocalTaskAgo(
                copy,
                row.review ? row.task.updatedAt : (lead?.since ?? row.since),
                props.now
              )}
            </Text>
          </View>
          {row.review ? (
            <LocalTaskCardMeta
              task={row.task}
              facts={facts}
              kind={{ label: card.awaitingAcceptance, tone: 'review' }}
              detail={
                props.reviewDetail ??
                (facts.workspace
                  ? [facts.workspace.name, facts.hostName].filter(Boolean).join(' · ')
                  : card.noWorkspace)
              }
            />
          ) : (
            <LocalTaskCardMeta
              task={row.task}
              facts={facts}
              kind={
                lead
                  ? {
                      label: copy.work.attentionKinds[lead.kind],
                      tone: lead.kind === 'unread-done' ? 'muted' : 'attention'
                    }
                  : undefined
              }
              detail={lead?.agent ? formatAgentTypeLabel(lead.agent) : null}
            />
          )}
          {row.review ? (
            <>
              <LocalTaskCardLatestLine facts={facts} />
              <LocalTaskSubtaskSummary facts={facts} />
            </>
          ) : lead?.lastMessage ? (
            <Text style={localTaskCardStyles.question} numberOfLines={3}>
              {lead.lastMessage}
            </Text>
          ) : null}
        </Pressable>
        <View style={localTaskCardStyles.actions}>
          {row.review ? (
            <>
              <LocalTaskCardButton
                label={card.preview}
                icon="preview"
                disabled={!facts.lead}
                onPress={() => facts.lead && handlers.onPreview(facts.lead.link.id)}
              />
              <LocalTaskCardButton
                label={card.goReview}
                icon="review"
                onPress={() => props.onOpenTask(row.task.id)}
              />
              {snooze}
            </>
          ) : lead ? (
            <>
              <LocalTaskCardButton
                testID={`preview-${lead.key}`}
                label={card.preview}
                icon="preview"
                onPress={() => handlers.onPreview(lead.taskSessionId)}
              />
              <LocalTaskCardButton
                label={card.openFullSession}
                icon="open"
                onPress={() => handlers.onOpenSession(lead.taskSessionId)}
              />
              {snooze}
              {lead.replyable ? <ReplyButton item={lead} handlers={handlers} /> : null}
            </>
          ) : null}
        </View>
        {lead ? <ItemOutcome item={lead} handlers={handlers} /> : null}
        {others.map((item) => (
          <OtherItemLine key={item.key} item={item} handlers={handlers} />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  block: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },
  blockFirst: { borderTopWidth: 0 },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  pressed: { backgroundColor: colors.bgRaised },
  icon: { paddingTop: 2 },
  main: { flex: 1, minWidth: 0, gap: 4 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, color: colors.textPrimary, fontSize: typography.bodySize, fontWeight: '600' },
  shrink: { flexShrink: 1, minWidth: 0 },
  other: { gap: 4, marginTop: 4 },
  otherLine: { flexDirection: 'row', alignItems: 'center', gap: 6 }
})
