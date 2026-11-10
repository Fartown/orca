import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronDown, ChevronRight, CircleDot, CornerDownRight, List } from 'lucide-react-native'
import { formatAgentTypeLabel } from '../../../src/shared/agent-type-label'
import type {
  LocalTaskLinks,
  LocalTaskProgressSnapshot
} from '../../../src/shared/local-tasks/local-task-link-types'
import { parseLocalTaskProgressSections } from '../../../src/shared/local-tasks/local-task-progress-sections'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import {
  findLocalTaskWriteback,
  type LocalTaskWriteback
} from '../../../src/shared/local-tasks/local-task-writebacks'
import { AgentStateDot } from '../components/AgentStateDot'
import { colors, spacing, typography } from '../theme/mobile-theme'
import { LocalTaskCardFoot } from './local-task-card'
import type { LocalTaskCardFacts } from './local-task-card-facts'
import { formatLocalTaskAgo, localTasksCopy } from './local-tasks-copy'
import { localTaskLatestProgress } from './local-task-latest-line'
import { localTasksPageCopy } from './local-tasks-page-copy'
import type { LocalTaskSessionView } from './local-task-progress-projection'
import { LOCAL_TASK_SESSION_DOT } from './local-task-session-dots'
import { localTaskStyles } from './local-tasks-styles'

/** A writeback's body, as its labelled lines when it was written that way. */
function ProgressBody(props: { body: string }) {
  const sections = parseLocalTaskProgressSections(props.body)
  if (!sections) {
    return (
      <>
        {props.body
          .split(/\n+/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line, at) => (
            <Text key={`${at}:${line}`} style={localTaskStyles.body}>
              {line}
            </Text>
          ))}
      </>
    )
  }
  return (
    <>
      {sections.map((section, at) => (
        <Text key={`${at}:${section.label}`} style={localTaskStyles.body}>
          <Text style={styles.sectionLabel}>{section.label} </Text>
          {section.text}
        </Text>
      ))}
    </>
  )
}

/**
 * The task's "Now" (m4): the latest progress headed by its writeback number, agent and time, kept in
 * its labelled lines; every earlier writeback one tap away; then each session, which opens as its
 * kind opens (Q2). Out of contact it says so and keeps what was last read.
 */
export function LocalTaskNowCard(props: {
  task: LocalTask
  descendants: readonly LocalTask[]
  facts: LocalTaskCardFacts
  /** The task's own writebacks, oldest first; empty until its events are read. */
  writebacks: readonly LocalTaskWriteback[]
  sessions: readonly LocalTaskSessionView[]
  links: LocalTaskLinks
  snapshot: LocalTaskProgressSnapshot | null
  now: number
  onOpenSession: (taskSessionId: string) => void
  onLongPressSession: ((sessionLinkId: string) => void) | null
}) {
  const copy = localTasksCopy()
  const page = localTasksPageCopy()
  const work = copy.work
  const { facts } = props
  const [showAll, setShowAll] = useState(false)
  const written = localTaskLatestProgress(props.task, props.descendants)
  const writer = written
    ? (props.descendants.find((child) => child.id === written.taskId) ?? null)
    : null
  const numbered = written && !writer ? findLocalTaskWriteback(props.writebacks, written) : null
  const writerSessionId = numbered?.sessionLinkId ?? written?.sessionLinkId ?? null
  const writerAgent =
    props.links.sessions.find((link) => link.id === writerSessionId)?.agent ?? null
  const turnEnded = (writer ?? props.task).latestProgress?.kind === 'turn-ended'
  const earlier = props.writebacks
    .filter((entry) => entry !== numbered)
    .sort((a, b) => b.number - a.number)
  return (
    <View style={[localTaskStyles.card, styles.card]} testID="local-task-now-card">
      <View style={styles.label}>
        <CircleDot size={13} color={colors.textMuted} />
        <Text style={styles.labelText}>{copy.now}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>{page.latestProgress}</Text>
        {written ? (
          <>
            <Text style={localTaskStyles.meta}>
              {[
                numbered
                  ? page.writebackNumber(numbered.number)
                  : turnEnded
                    ? work.card.lastLine
                    : work.card.writeback,
                writer ? writer.ref : null,
                writerAgent ? formatAgentTypeLabel(writerAgent) : null,
                formatLocalTaskAgo(copy, written.at, props.now)
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <ProgressBody body={written.body} />
          </>
        ) : (
          <Text style={localTaskStyles.meta}>{page.noWriteback}</Text>
        )}
      </View>
      {props.writebacks.length >= 2 ? (
        <Pressable
          style={styles.allProgress}
          onPress={() => setShowAll((shown) => !shown)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showAll }}
          testID="local-task-all-progress"
        >
          {showAll ? (
            <ChevronDown size={14} color={colors.textSecondary} />
          ) : (
            <List size={14} color={colors.textSecondary} />
          )}
          <Text style={styles.allProgressText}>
            {showAll ? page.collapse : page.allProgress(props.writebacks.length)}
          </Text>
        </Pressable>
      ) : null}
      {showAll
        ? earlier.map((entry) => (
            <View key={entry.event.id} style={styles.earlier}>
              <Text style={localTaskStyles.meta}>
                {page.writebackNumber(entry.number)} ·{' '}
                {formatLocalTaskAgo(copy, entry.event.createdAt, props.now)}
              </Text>
              <ProgressBody body={entry.event.body ?? ''} />
            </View>
          ))
        : null}
      {facts.offline && facts.workspace ? (
        <View style={styles.offline}>
          <LocalTaskCardFoot facts={facts} now={props.now} />
        </View>
      ) : null}
      {props.sessions.map((view) => {
        const item =
          view.state === 'unverifiable'
            ? null
            : (props.snapshot?.items.find((entry) => entry.taskSessionId === view.link.id) ?? null)
        const stateSince =
          props.snapshot?.sessions.find((entry) => entry.taskSessionId === view.link.id)
            ?.stateSince ?? null
        return (
          <Pressable
            key={view.link.id}
            style={({ pressed }) => [styles.session, pressed && styles.pressed]}
            onPress={() => props.onOpenSession(view.link.id)}
            onLongPress={
              props.onLongPressSession ? () => props.onLongPressSession?.(view.link.id) : undefined
            }
            delayLongPress={350}
            accessibilityRole="button"
            accessibilityHint={props.onLongPressSession ? work.sessionActionsHint : undefined}
            testID={`local-task-session-${view.link.id}`}
          >
            <View style={styles.sessionMain}>
              <View style={styles.sessionLine}>
                <AgentStateDot state={item ? 'waiting' : LOCAL_TASK_SESSION_DOT[view.state]} />
                <Text style={styles.agent}>{formatAgentTypeLabel(view.link.agent)}</Text>
                <Text style={localTaskStyles.meta}>{work.surfaces[view.link.surface]}</Text>
                {view.task && view.task.id !== props.task.id ? (
                  <View style={styles.subtask}>
                    <CornerDownRight size={11} color={colors.textMuted} />
                    <Text style={localTaskStyles.meta} numberOfLines={1}>
                      {view.task.title}
                    </Text>
                  </View>
                ) : null}
                <Text
                  style={[styles.state, (item || view.state === 'working') && styles.attention]}
                  numberOfLines={1}
                >
                  {[
                    item ? work.attentionKinds[item.kind] : work.sessionStates[view.state],
                    view.state === 'working' && stateSince !== null
                      ? work.card.duration(props.now - stateSince)
                      : null
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              {view.lastMessage ? (
                <Text style={localTaskStyles.meta} numberOfLines={1}>
                  {view.lastMessage}
                </Text>
              ) : null}
            </View>
            <ChevronRight size={15} color={colors.textMuted} />
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { marginTop: spacing.lg },
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle
  },
  labelText: { color: colors.textSecondary, fontSize: typography.metaSize, fontWeight: '600' },
  section: { padding: spacing.md, gap: 6 },
  heading: { color: colors.textPrimary, fontSize: typography.metaSize, fontWeight: '600' },
  sectionLabel: { color: colors.textSecondary },
  allProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle
  },
  allProgressText: { color: colors.textSecondary, fontSize: typography.metaSize },
  earlier: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle
  },
  offline: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  session: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle
  },
  pressed: { backgroundColor: colors.bgRaised },
  sessionMain: { flex: 1, minWidth: 0, gap: 4 },
  sessionLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  subtask: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1 },
  agent: { color: colors.textPrimary, fontSize: typography.bodySize, fontWeight: '600' },
  state: { flexShrink: 1, color: colors.textSecondary, fontSize: typography.metaSize },
  attention: { color: colors.statusAmber }
})
