import { useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Bell, ChevronDown, ChevronRight } from 'lucide-react-native'
import type { LocalTaskStatusCategory } from '../../../src/shared/local-tasks/local-task-model'
import type {
  LocalTask,
  LocalTaskStatusDef
} from '../../../src/shared/local-tasks/local-task-types'
import { unfoldedLocalTaskLines } from '../../../src/shared/local-tasks/local-task-list-groups'
import { colors, spacing, typography } from '../theme/mobile-theme'
import { localTasksCopy } from './local-tasks-copy'
import { LocalTaskCard, localTaskCardStyles } from './local-task-card'
import type { LocalTaskCardFacts } from './local-task-card-facts'
import type { LocalTaskListGroup, LocalTaskListRow } from './local-task-list-projection'
import type { LocalTaskRowSession } from './local-task-progress-projection'
import { LocalTaskSessionDots } from './local-task-session-dots'
import { localTaskStyles } from './local-tasks-styles'
import { LocalTaskStatusIcon, localTaskCategoryColor } from './local-tasks-visuals'

// Why these start folded: finished and parked work is the long tail of a list you scan for today.
const FOLDED_CATEGORIES: ReadonlySet<LocalTaskStatusCategory> = new Set([
  'backlog',
  'completed',
  'canceled'
])

type Props = {
  groups: LocalTaskListGroup[]
  lookup: Map<string, LocalTaskStatusDef>
  now: number
  bottomInset: number
  /** Said when there is nothing to show; defaults to "no tasks here yet". */
  emptyText?: string
  /** The session dots a subtask line shows, from what the page already loaded. */
  sessionsFor: (task: LocalTask) => LocalTaskRowSession[]
  /** What a card says, from what the page already loaded. */
  factsFor: (task: LocalTask) => LocalTaskCardFacts
  /** "Needs you", drawn first; the tasks it holds leave the status groups below. */
  band?: { ids: ReadonlySet<string>; count: number; note: string | null; section: ReactNode }
  onOpen: (taskId: string) => void
}

/** Tasks a group counts that "Needs you" shows instead. */
function tasksInBand(group: LocalTaskListGroup, band: ReadonlySet<string>): number {
  let count = 0
  for (const row of group.rows) {
    for (const task of [row.task, ...row.subtasks.map((line) => line.task)]) {
      if (band.has(task.id)) {
        count += 1
      }
    }
  }
  return count
}

export function LocalTasksListView(props: Props) {
  const copy = localTasksCopy()
  const card = copy.work.card
  const [toggledGroups, setToggledGroups] = useState<ReadonlySet<string>>(new Set())
  const [foldedParents, setFoldedParents] = useState<ReadonlySet<string>>(new Set())
  const toggle = (set: ReadonlySet<string>, key: string) => {
    const next = new Set(set)
    if (!next.delete(key)) {
      next.add(key)
    }
    return next
  }
  const banded = props.band?.ids ?? new Set<string>()
  const groups = props.groups
    .map((group) => ({
      group,
      rows: group.rows.filter((row) => !banded.has(row.task.id)),
      inBand: tasksInBand(group, banded)
    }))
    .filter((entry) => entry.rows.length > 0)
  const bandCount = props.band?.count ?? 0
  if (groups.length === 0 && bandCount === 0) {
    return (
      <View style={localTaskStyles.centered}>
        <Text style={localTaskStyles.centeredText}>{props.emptyText ?? copy.emptyList}</Text>
      </View>
    )
  }
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: props.bottomInset + 96 }}>
      {props.band && bandCount > 0 ? (
        <View testID="local-tasks-needs-you-band">
          <View style={styles.groupHeader}>
            <Bell size={14} color={colors.statusAmber} />
            <Text style={styles.groupTitle}>{copy.work.segmentAttention}</Text>
            <Text style={[localTaskStyles.meta, styles.attentionCount]}>{bandCount}</Text>
          </View>
          {props.band.note ? (
            <Text style={[localTaskStyles.hint, styles.bandNote]}>{props.band.note}</Text>
          ) : null}
          {props.band.section}
        </View>
      ) : null}
      {groups.map(({ group, rows, inBand }) => {
        const foldedByDefault = group.category !== null && FOLDED_CATEGORIES.has(group.category)
        const folded = foldedByDefault !== toggledGroups.has(group.key)
        return (
          <View key={group.key}>
            <Pressable
              style={styles.groupHeader}
              onPress={() => setToggledGroups((previous) => toggle(previous, group.key))}
              accessibilityRole="button"
              accessibilityState={{ expanded: !folded }}
            >
              {folded ? (
                <ChevronRight size={14} color={colors.textMuted} />
              ) : (
                <ChevronDown size={14} color={colors.textMuted} />
              )}
              <LocalTaskStatusIcon
                category={group.category}
                color={
                  group.status?.color ??
                  (group.category ? localTaskCategoryColor(group.category) : 'gray')
                }
                size={15}
              />
              <Text style={styles.groupTitle}>
                {group.status?.name ??
                  (group.category ? copy.categories[group.category] : copy.unknownStatus)}
              </Text>
              <Text style={localTaskStyles.meta}>{group.count - inBand}</Text>
              {inBand > 0 ? (
                <Text style={[localTaskStyles.meta, styles.shrink]} numberOfLines={1}>
                  {card.moreInNeedsYou(inBand)}
                </Text>
              ) : null}
            </Pressable>
            {folded ? null : (
              <View style={[localTaskStyles.card, localTaskCardStyles.group]}>
                {rows.map((row, at) => (
                  <LocalTaskListRowView
                    key={row.task.id}
                    row={row}
                    first={at === 0}
                    banded={banded}
                    lookup={props.lookup}
                    now={props.now}
                    folded={foldedParents}
                    sessionsFor={props.sessionsFor}
                    factsFor={props.factsFor}
                    onToggle={(taskId) => setFoldedParents((previous) => toggle(previous, taskId))}
                    onOpen={props.onOpen}
                  />
                ))}
              </View>
            )}
          </View>
        )
      })}
    </ScrollView>
  )
}

function LocalTaskListRowView(props: {
  row: LocalTaskListRow
  first: boolean
  banded: ReadonlySet<string>
  lookup: Map<string, LocalTaskStatusDef>
  now: number
  folded: ReadonlySet<string>
  sessionsFor: (task: LocalTask) => LocalTaskRowSession[]
  factsFor: (task: LocalTask) => LocalTaskCardFacts
  onToggle: (taskId: string) => void
  onOpen: (taskId: string) => void
}) {
  const { task } = props.row
  const expanded = !props.folded.has(task.id)
  return (
    <LocalTaskCard
      task={task}
      status={props.lookup.get(task.statusId) ?? null}
      facts={props.factsFor(task)}
      now={props.now}
      first={props.first}
      subtasksExpanded={expanded}
      onToggleSubtasks={props.row.subtasks.length > 0 ? () => props.onToggle(task.id) : undefined}
      onOpen={props.onOpen}
    >
      {expanded
        ? unfoldedLocalTaskLines(props.row.subtasks, props.folded)
            .filter((line) => !props.banded.has(line.task.id))
            .map((line) => (
              <LocalTaskSubtaskRow
                key={line.task.id}
                task={line.task}
                status={props.lookup.get(line.task.statusId) ?? null}
                depth={line.depth}
                folded={line.childCount > 0 ? props.folded.has(line.task.id) : undefined}
                sessions={props.sessionsFor(line.task)}
                onToggle={() => props.onToggle(line.task.id)}
                onOpen={props.onOpen}
              />
            ))
        : null}
    </LocalTaskCard>
  )
}

// Why capped: past a few levels the indent would leave no room for the title on a phone.
const MAX_INDENT_DEPTH = 4

export function LocalTaskSubtaskRow(props: {
  task: LocalTask
  status: LocalTaskStatusDef | null
  /** 1 under a top-level row; deeper lines indent further. */
  depth?: number
  /** Set only for a line with shown children: whether they are folded away. */
  folded?: boolean
  onToggle?: () => void
  /** Inside a card, which pads its own rows: no list indent under a parent's status icon. */
  inCard?: boolean
  /** The sessions this subtask opened, drawn as dots after its title (REQ-012). */
  sessions?: readonly LocalTaskRowSession[]
  onOpen: (taskId: string) => void
}) {
  const indent = (Math.min(props.depth ?? 1, MAX_INDENT_DEPTH) - 1) * spacing.lg
  return (
    <Pressable
      style={({ pressed }) => [
        styles.subtaskRow,
        props.inCard
          ? styles.subtaskRowInCard
          : indent > 0 && { paddingLeft: spacing.xl + spacing.lg + indent },
        pressed && styles.rowPressed
      ]}
      onPress={() => props.onOpen(props.task.id)}
      accessibilityRole="button"
      accessibilityLabel={`${props.task.title} ${props.task.ref}`}
    >
      <LocalTaskStatusIcon
        category={props.status?.category ?? null}
        color={props.status?.color ?? 'gray'}
        size={14}
      />
      <Text style={localTaskStyles.mono}>{props.task.ref}</Text>
      <Text style={styles.subtaskTitle} numberOfLines={1}>
        {props.task.title}
      </Text>
      {props.sessions ? <LocalTaskSessionDots sessions={props.sessions} /> : null}
      {props.folded !== undefined ? (
        <Pressable
          testID={`local-task-fold-${props.task.id}`}
          style={styles.foldToggle}
          onPress={props.onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: !props.folded }}
        >
          {props.folded ? (
            <ChevronRight size={13} color={colors.textMuted} />
          ) : (
            <ChevronDown size={13} color={colors.textMuted} />
          )}
        </Pressable>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm
  },
  groupTitle: { color: colors.textPrimary, fontSize: typography.bodySize, fontWeight: '600' },
  attentionCount: { color: colors.statusAmber },
  bandNote: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  shrink: { flexShrink: 1, minWidth: 0 },
  rowPressed: { backgroundColor: colors.bgRaised },
  subtaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.xl + spacing.lg,
    paddingRight: spacing.lg,
    paddingVertical: 10
  },
  subtaskRowInCard: { paddingLeft: spacing.md, paddingRight: spacing.md },
  // Why a 32pt box pulled into the row: a 13pt chevron is too small to hit, and the browser page
  // ignores hitSlop; the negative margins keep the row as tall as before.
  foldToggle: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: -9,
    marginRight: -10
  },
  subtaskTitle: { flex: 1, color: colors.textPrimary, fontSize: typography.metaSize + 1 }
})
