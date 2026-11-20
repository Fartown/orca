import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronDown, ChevronRight, CornerDownRight, List } from 'lucide-react-native'
import { formatAgentTypeLabel } from '../../../src/shared/agent-status/presentation/agent-type-label'
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
import { AgentStateDot } from '../agents/presentation/AgentStateDot'
import { MobileMarkdown } from '../components/markdown/MobileMarkdown'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { colors, spacing, typography } from '../theme/mobile-theme'
import { themedStyleSheet } from '../theme/themed-styles'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import { LocalTaskCardFoot } from './local-task-card'
import type { LocalTaskCardFacts } from './local-task-card-facts'
import { formatLocalTaskAgo, localTasksCopy } from './local-tasks-copy'
import { localTaskLatestProgress } from './local-task-latest-line'
import { localTaskSessionSummary } from './local-task-session-summary'
import { localTasksPageCopy } from './local-tasks-page-copy'
import type { LocalTaskSessionView } from './local-task-progress-projection'
import { LOCAL_TASK_SESSION_DOT } from './local-task-session-dots'
import { localTaskStyles } from './local-tasks-styles'

const PROGRESS_PREVIEW_HEIGHT = 63

/** A writeback's body, as its labelled lines when it was written that way. */
function ProgressBody(props: { body: string }) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const [expanded, setExpanded] = useState(false)
  const [contentHeight, setContentHeight] = useState(0)
  const sections = parseLocalTaskProgressSections(props.body)
  const overflow = contentHeight > PROGRESS_PREVIEW_HEIGHT + 1
  return (
    <View style={styles.progressBody}>
      <View
        style={[styles.progressClip, !expanded && { maxHeight: PROGRESS_PREVIEW_HEIGHT }]}
        testID="local-task-progress-clip"
      >
        <View onLayout={(event) => setContentHeight(event.nativeEvent.layout.height)}>
          {sections ? (
            sections.map((section, at) => (
              <View
                key={`${at}:${section.label}`}
                style={[styles.progressSection, expanded && styles.progressSectionExpanded]}
              >
                <Text style={[localTaskStyles.body, styles.sectionLabel]}>{section.label}</Text>
                <MobileMarkdown
                  content={section.text}
                  textScale={21 / 19}
                  density={!expanded ? 'tight' : undefined}
                />
              </View>
            ))
          ) : (
            <MobileMarkdown
              content={props.body}
              textScale={21 / 19}
              density={!expanded ? 'tight' : undefined}
            />
          )}
        </View>
      </View>
      {overflow ? (
        <Pressable
          onPress={() => setExpanded((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          testID="local-task-progress-toggle"
        >
          <Text style={styles.progressToggle}>
            {expanded
              ? t('localTasks.latestProgress.showLess', 'Show less')
              : t('localTasks.latestProgress.showMore', 'Show more')}
          </Text>
        </Pressable>
      ) : null}
    </View>
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
  useMobileColorScheme()
  const t = useMobileTranslation()
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
  if (!written && props.writebacks.length === 0 && props.sessions.length === 0 && !facts.offline) {
    return (
      <View style={styles.empty} testID="local-task-now-card">
        <Text style={localTaskStyles.meta}>{page.noWriteback}</Text>
      </View>
    )
  }
  return (
    <View style={[localTaskStyles.card, styles.card]} testID="local-task-now-card">
      {written ? (
        <View style={styles.section}>
          <Text style={styles.heading}>{page.latestProgress}</Text>
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
          <ProgressBody
            key={`${props.task.id}:${written.taskId}:${written.at}:${written.body}`}
            body={written.body}
          />
        </View>
      ) : null}
      {props.writebacks.length >= (written ? 2 : 1) ? (
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
      {props.sessions.length > 0 ? (
        <View style={styles.sessionsHeading}>
          <Text style={styles.heading}>{t('localTasks.page.sessions', 'Sessions')}</Text>
          <Text style={localTaskStyles.meta}>{props.sessions.length}</Text>
        </View>
      ) : null}
      {!written && props.writebacks.length === 0 && props.sessions.length === 0 ? (
        <View style={styles.section}>
          <Text style={localTaskStyles.meta}>{page.noWriteback}</Text>
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
        const summary = view.lastMessage ? localTaskSessionSummary(view.lastMessage) : null
        const repeatedProgress =
          written?.sessionLinkId === view.link.id && view.lastMessage === written.body
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
            <View style={styles.sessionSide}>
              <AgentStateDot state={item ? 'waiting' : LOCAL_TASK_SESSION_DOT[view.state]} />
            </View>
            <View style={styles.sessionMain}>
              <View style={styles.sessionIdentity}>
                <Text style={styles.agent}>{formatAgentTypeLabel(view.link.agent)}</Text>
                <Text style={localTaskStyles.meta}>{work.surfaces[view.link.surface]}</Text>
                {view.task && view.task.id !== props.task.id ? (
                  <View style={styles.subtask}>
                    <CornerDownRight size={11} color={colors.textMuted} />
                    <Text style={[localTaskStyles.meta, styles.subtaskTitle]} numberOfLines={1}>
                      {view.task.title}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.state, (item || view.state === 'working') && styles.attention]}>
                {[
                  item ? work.attentionKinds[item.kind] : work.sessionStates[view.state],
                  view.state === 'working' && stateSince !== null
                    ? work.card.duration(props.now - stateSince)
                    : null
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {summary && !repeatedProgress ? (
                <Text style={localTaskStyles.meta} numberOfLines={2}>
                  {summary}
                </Text>
              ) : null}
            </View>
            <View style={styles.sessionSide}>
              <ChevronRight size={15} color={colors.textMuted} />
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = themedStyleSheet(() => ({
  card: { marginTop: spacing.lg },
  empty: { marginTop: spacing.lg },
  section: { padding: spacing.md, gap: spacing.sm },
  heading: { color: colors.textPrimary, fontSize: typography.metaSize, fontWeight: '600' },
  sessionsHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle
  },
  sectionLabel: { color: colors.textSecondary },
  progressBody: { gap: spacing.xs },
  progressClip: { overflow: 'hidden' },
  progressSection: { gap: 0 },
  progressSectionExpanded: { gap: spacing.xs },
  progressToggle: { color: colors.textSecondary, fontSize: typography.metaSize },
  allProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle
  },
  allProgressText: { color: colors.textSecondary, fontSize: typography.metaSize },
  earlier: {
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle
  },
  offline: { padding: spacing.md },
  session: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle
  },
  pressed: { backgroundColor: colors.bgRaised },
  sessionSide: { width: 16, height: 20, alignItems: 'center', justifyContent: 'center' },
  sessionMain: { flex: 1, minWidth: 0, gap: spacing.xs },
  sessionIdentity: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 20 },
  subtask: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
    minWidth: 0
  },
  subtaskTitle: { flex: 1, minWidth: 0 },
  agent: {
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    fontWeight: '600',
    lineHeight: 20
  },
  state: { color: colors.textSecondary, fontSize: typography.metaSize },
  attention: { color: colors.statusAmber }
}))
