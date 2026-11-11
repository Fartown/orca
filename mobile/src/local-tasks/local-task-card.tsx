import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Check, Clock, CornerDownRight, Eye, SquareTerminal } from 'lucide-react-native'
import { formatAgentTypeLabel } from '../../../src/shared/agent-type-label'
import type {
  LocalTaskAttentionItem,
  LocalTaskAttentionKind
} from '../../../src/shared/local-tasks/local-task-link-types'
import type {
  LocalTask,
  LocalTaskStatusDef
} from '../../../src/shared/local-tasks/local-task-types'
import { AgentStateDot } from '../components/AgentStateDot'
import { colors, spacing, typography } from '../theme/mobile-theme'
import type { LocalTaskCardFacts } from './local-task-card-facts'
import { formatLocalTaskAgo, localTasksCopy } from './local-tasks-copy'
import { LOCAL_TASK_SESSION_DOT } from './local-task-session-dots'
import { localTaskStyles } from './local-tasks-styles'
import { LocalTaskStatusIcon } from './local-tasks-visuals'

const ATTENTION_DOT: Record<LocalTaskAttentionKind, 'waiting' | 'blocked' | 'done'> = {
  approval: 'waiting',
  question: 'waiting',
  blocked: 'blocked',
  'unread-done': 'done'
}

/** `ref · workspace · host`, or that the task has no workspace yet. */
export function LocalTaskCardMeta(props: {
  task: LocalTask
  facts: LocalTaskCardFacts
  /** Said right after the ref, in its own color: what the card waits on the user for. */
  kind?: { label: string; tone: 'attention' | 'review' | 'muted' }
  /** What follows the kind instead of the workspace: the agent, a PR. */
  detail?: string | null
}) {
  const work = localTasksCopy().work
  const { facts } = props
  const where = facts.workspace
    ? [facts.workspace.name, facts.hostName].filter(Boolean).join(' · ')
    : work.card.noWorkspace
  const tail = props.detail ?? (props.kind ? null : where)
  return (
    <View style={styles.metaLine}>
      <Text style={[localTaskStyles.mono, styles.ref]} numberOfLines={1}>
        {props.task.ref}
      </Text>
      {props.kind ? (
        <Text style={[styles.kind, styles[props.kind.tone]]} numberOfLines={1}>
          {props.kind.label}
        </Text>
      ) : null}
      {tail ? (
        <Text style={[localTaskStyles.meta, styles.shrink]} numberOfLines={1}>
          · {tail}
        </Text>
      ) : null}
    </View>
  )
}

/** The lead session's agent, state and time in it, and where the latest line came from. */
export function LocalTaskCardFoot(props: { facts: LocalTaskCardFacts; now: number }) {
  const copy = localTasksCopy()
  const card = copy.work.card
  const { facts } = props
  if (facts.offline && facts.workspace) {
    const ago =
      facts.latest?.at !== null && facts.latest?.at !== undefined
        ? formatLocalTaskAgo(copy, facts.latest.at, props.now)
        : null
    return (
      <View style={styles.foot}>
        <AgentStateDot state="unverifiable" />
        <Text style={[styles.footText, styles.attention]} numberOfLines={1}>
          {[card.hostOffline(facts.hostName), ago ? card.lastProgress(ago) : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
    )
  }
  const lead = facts.lead
  if (!lead) {
    return null
  }
  const stateLabel = lead.item
    ? copy.work.attentionKinds[lead.item.kind]
    : copy.work.sessionStates[lead.state]
  const duration =
    lead.state === 'working' && lead.stateSince !== null
      ? card.duration(props.now - lead.stateSince)
      : null
  const source =
    facts.latest && facts.latest.source !== 'started' && facts.latest.at !== null
      ? `${facts.latest.source === 'writeback' ? card.writeback : card.lastLine} · ${formatLocalTaskAgo(copy, facts.latest.at, props.now)}`
      : null
  return (
    <View style={styles.foot}>
      <AgentStateDot
        state={lead.item ? ATTENTION_DOT[lead.item.kind] : LOCAL_TASK_SESSION_DOT[lead.state]}
      />
      <Text style={styles.footText} numberOfLines={1}>
        {lead.link.agent ? `${formatAgentTypeLabel(lead.link.agent)} ` : ''}
        <Text style={lead.item || lead.state === 'working' ? styles.attention : undefined}>
          {[stateLabel, duration].filter(Boolean).join(' · ')}
        </Text>
        {facts.sessionCount > 1 ? ` +${facts.sessionCount - 1}` : ''}
      </Text>
      {source ? <Text style={localTaskStyles.meta}>{source}</Text> : null}
    </View>
  )
}

/** The latest line, two lines at most; a session that has not written yet says so. */
export function LocalTaskCardLatestLine(props: { facts: LocalTaskCardFacts }) {
  const card = localTasksCopy().work.card
  const latest = props.facts.latest
  if (!latest) {
    return null
  }
  const text = latest.source === 'started' ? card.sessionStarted : latest.body
  const dim = latest.source === 'started' || props.facts.offline
  return (
    <Text style={[styles.body, dim && styles.dim]} numberOfLines={2}>
      {latest.fromRef ? (
        <Text style={localTaskStyles.mono}>{card.fromSubtask(latest.fromRef)}</Text>
      ) : null}
      {text}
    </Text>
  )
}

/** A parent's line: how many subtasks, how their sessions stand, and the newest word. */
export function LocalTaskSubtaskSummary(props: {
  facts: LocalTaskCardFacts
  expanded?: boolean
  onToggle?: () => void
}) {
  const card = localTasksCopy().work.card
  const subtasks = props.facts.subtasks
  if (!subtasks) {
    return null
  }
  const summary = subtasks.summary
  const parts = [
    card.subtasks(subtasks.count),
    summary?.kind === 'none'
      ? card.subtasksNone
      : summary?.kind === 'all-done'
        ? card.subtasksAllDone
        : summary?.kind === 'waiting'
          ? card.subtasksWaiting(summary.count)
          : summary?.kind === 'working'
            ? card.subtasksWorking(summary.count)
            : null,
    subtasks.latest ? `${card.subtasksLatest(subtasks.latest.ref)} ${subtasks.latest.body}` : null
  ]
  const line = (
    <View style={styles.kids}>
      <CornerDownRight size={12} color={colors.textMuted} />
      <Text style={[localTaskStyles.meta, styles.shrink]} numberOfLines={1}>
        {parts.filter(Boolean).join(' · ')}
      </Text>
    </View>
  )
  return props.onToggle ? (
    <Pressable
      onPress={props.onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: props.expanded !== false }}
    >
      {line}
    </Pressable>
  ) : (
    line
  )
}

/** A task in a status group: title, where it works, its latest line and its lead session. */
export function LocalTaskCard(props: {
  task: LocalTask
  status: LocalTaskStatusDef | null
  facts: LocalTaskCardFacts
  now: number
  first: boolean
  subtasksExpanded?: boolean
  onToggleSubtasks?: () => void
  onOpen: (taskId: string) => void
  /** Subtask lines drawn under the card, inside its row. */
  children?: ReactNode
}) {
  const { task, status, facts } = props
  const closed = status?.category === 'completed' || status?.category === 'canceled'
  return (
    <View style={[styles.cardBlock, props.first && styles.cardBlockFirst]}>
      <View style={styles.card}>
        <View style={styles.icon}>
          <LocalTaskStatusIcon
            category={status?.category ?? null}
            color={status?.color ?? 'gray'}
          />
        </View>
        <View style={styles.main}>
          <Pressable
            style={({ pressed }) => [styles.main, pressed && styles.pressed]}
            onPress={() => props.onOpen(task.id)}
            accessibilityRole="button"
            accessibilityLabel={`${task.title} ${task.ref}`}
          >
            <Text style={styles.title} numberOfLines={2}>
              {task.title}
            </Text>
            <LocalTaskCardMeta task={task} facts={facts} />
            {closed ? null : <LocalTaskCardLatestLine facts={facts} />}
            {closed ? null : <LocalTaskCardFoot facts={facts} now={props.now} />}
          </Pressable>
          <LocalTaskSubtaskSummary
            facts={facts}
            expanded={props.subtasksExpanded}
            onToggle={props.onToggleSubtasks}
          />
        </View>
      </View>
      {props.children}
    </View>
  )
}

export function LocalTaskCardButton(props: {
  label: string
  icon: 'preview' | 'open' | 'later' | 'review'
  testID?: string
  disabled?: boolean
  onPress: () => void
}) {
  const Icon =
    props.icon === 'preview'
      ? Eye
      : props.icon === 'open'
        ? SquareTerminal
        : props.icon === 'later'
          ? Clock
          : Check
  return (
    <Pressable
      testID={props.testID}
      style={[localTaskStyles.smallButton, props.disabled && localTaskStyles.disabled]}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: props.disabled === true }}
      onPress={props.onPress}
    >
      <Icon size={13} color={colors.textSecondary} />
      <Text style={localTaskStyles.smallButtonText}>{props.label}</Text>
    </Pressable>
  )
}

/** The item a "Needs you" card speaks for: one that waits on an answer before a finished turn. */
export function localTaskLeadItem(
  items: readonly LocalTaskAttentionItem[]
): LocalTaskAttentionItem | null {
  return items.findLast((item) => item.kind !== 'unread-done') ?? items.at(-1) ?? null
}

export const localTaskCardStyles = StyleSheet.create({
  group: { marginHorizontal: spacing.lg },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: 4 },
  question: { color: colors.textPrimary, fontSize: typography.bodySize, lineHeight: 20 }
})

const styles = StyleSheet.create({
  cardBlock: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },
  cardBlockFirst: { borderTopWidth: 0 },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md
  },
  pressed: { backgroundColor: colors.bgRaised },
  icon: { paddingTop: 2 },
  main: { flex: 1, minWidth: 0, gap: 4 },
  title: { color: colors.textPrimary, fontSize: typography.bodySize, fontWeight: '600' },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kind: { fontSize: typography.metaSize, fontWeight: '600', flexShrink: 0 },
  attention: { color: colors.statusAmber },
  review: { color: colors.statusGreen },
  muted: { color: colors.textSecondary },
  shrink: { flexShrink: 1, minWidth: 0 },
  // Why: a ref like SHOP-1 must stay on one line; the trailing workspace text gives way instead.
  ref: { flexShrink: 0 },
  body: { color: colors.textPrimary, fontSize: typography.metaSize + 1, lineHeight: 19 },
  dim: { color: colors.textMuted },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footText: { flex: 1, minWidth: 0, color: colors.textSecondary, fontSize: typography.metaSize },
  kids: { flexDirection: 'row', alignItems: 'center', gap: 4 }
})
