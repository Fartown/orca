import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { CornerDownRight, ListTodo, Plus } from 'lucide-react-native'
import type {
  LocalTask,
  LocalTaskStatusDef
} from '../../../src/shared/local-tasks/local-task-types'
import {
  localTaskPathFromRoot,
  localTaskPathLabel
} from '../../../src/shared/local-tasks/local-task-hierarchy'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { formatLocalTaskAgo, localTasksCopy } from './local-tasks-copy'
import type { LocalTaskListGroup, LocalTaskListRow } from './local-task-list-projection'
import { localTaskStyles } from './local-tasks-styles'
import {
  LocalTaskPriorityIcon,
  LocalTaskStatusIcon,
  localTaskCategoryColor
} from './local-tasks-visuals'

const COLUMN_GAP = spacing.md
// Why the peek: the next column's edge is what tells a phone user the board scrolls sideways.
const NEXT_COLUMN_PEEK = 48

type Props = {
  groups: LocalTaskListGroup[]
  tasksById: Map<string, LocalTask>
  now: number
  bottomInset: number
  /** Present in one project, where a column is a status a new task can start in. */
  onCreateIn?: (statusId: string) => void
  onOpen: (taskId: string) => void
}

export function LocalTasksBoardView(props: Props) {
  const copy = localTasksCopy()
  const { width } = useWindowDimensions()
  const [showCanceled, setShowCanceled] = useState(false)
  const columnWidth = Math.min(360, width - spacing.lg * 2 - NEXT_COLUMN_PEEK)
  const canceled = props.groups.filter((group) => group.category === 'canceled')
  const canceledCount = canceled.reduce((sum, group) => sum + group.rows.length, 0)
  // Why hidden by default: canceled work is noise on a board you scan for what to do next.
  const columns = showCanceled
    ? props.groups
    : props.groups.filter((group) => group.category !== 'canceled')
  return (
    <ScrollView
      horizontal
      style={styles.board}
      showsHorizontalScrollIndicator={false}
      snapToInterval={columnWidth + COLUMN_GAP}
      decelerationRate="fast"
      contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: COLUMN_GAP }}
    >
      {columns.map((group) => (
        <View key={group.key} style={{ width: columnWidth }}>
          <View style={styles.columnHeader}>
            <LocalTaskStatusIcon
              category={group.category}
              color={
                group.status?.color ??
                (group.category ? localTaskCategoryColor(group.category) : 'gray')
              }
            />
            <Text style={styles.columnTitle} numberOfLines={1}>
              {group.status?.name ??
                (group.category ? copy.categories[group.category] : copy.unknownStatus)}
            </Text>
            <Text style={localTaskStyles.meta}>{group.rows.length}</Text>
            <View style={localTaskStyles.topBarSpacer} />
            {props.onCreateIn && group.status ? (
              <Pressable
                style={localTaskStyles.iconButton}
                onPress={() => group.status && props.onCreateIn?.(group.status.id)}
                accessibilityRole="button"
                accessibilityLabel={copy.newTask}
              >
                <Plus size={16} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>
          <ScrollView
            style={styles.board}
            contentContainerStyle={{ gap: spacing.sm, paddingBottom: props.bottomInset + 96 }}
          >
            {group.rows.map((row) => (
              <LocalTaskBoardCard
                key={row.task.id}
                row={row}
                ancestors={localTaskPathFromRoot(row.task, props.tasksById)}
                status={group.status}
                now={props.now}
                onOpen={props.onOpen}
              />
            ))}
          </ScrollView>
        </View>
      ))}
      {canceledCount > 0 ? (
        <Pressable
          style={[styles.canceledToggle, localTaskStyles.smallButton]}
          onPress={() => setShowCanceled((value) => !value)}
          accessibilityRole="button"
        >
          <Text style={localTaskStyles.smallButtonText}>
            {showCanceled ? copy.hideCanceled : copy.showCanceled(canceledCount)}
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  )
}

function LocalTaskBoardCard(props: {
  row: LocalTaskListRow
  /** Root first: the card reads "… › Parent title" above its own title. */
  ancestors: LocalTask[]
  status: LocalTaskStatusDef | null
  now: number
  onOpen: (taskId: string) => void
}) {
  const copy = localTasksCopy()
  const { task } = props.row
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => props.onOpen(task.id)}
      accessibilityRole="button"
      accessibilityLabel={`${task.ref} ${task.title}`}
    >
      <View style={styles.cardTop}>
        <Text style={localTaskStyles.mono}>{task.ref}</Text>
        <View style={localTaskStyles.topBarSpacer} />
        <LocalTaskPriorityIcon priority={task.priority} />
      </View>
      {props.ancestors.length > 0 ? (
        <View style={styles.parentHint}>
          <CornerDownRight size={12} color={colors.textMuted} />
          {/* Why the parent alone: the web build ignores head ellipsis, so a full path lost it. */}
          <Text
            style={[localTaskStyles.meta, styles.parentPath]}
            numberOfLines={1}
            accessibilityLabel={localTaskPathLabel(props.ancestors)}
          >
            {props.ancestors.length > 1 ? '… › ' : ''}
            {props.ancestors.at(-1)?.title}
          </Text>
        </View>
      ) : null}
      <Text style={styles.cardTitle} numberOfLines={3}>
        {task.title}
      </Text>
      {task.labels.length > 0 ? (
        <View style={styles.labels}>
          {task.labels.slice(0, 3).map((label) => (
            <View key={label} style={localTaskStyles.label}>
              <Text style={localTaskStyles.labelText}>{label}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.cardFooter}>
        {props.row.subtaskTotal > 0 ? (
          <>
            <ListTodo size={12} color={colors.textMuted} />
            <Text style={localTaskStyles.meta}>
              {copy.subtasks} {props.row.subtaskDone}/{props.row.subtaskTotal}
            </Text>
          </>
        ) : (
          <Text style={localTaskStyles.meta}>
            {copy.updatedAgo(formatLocalTaskAgo(copy, task.updatedAt, props.now))}
          </Text>
        )}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  board: { flex: 1 },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm
  },
  columnTitle: {
    color: colors.textPrimary,
    fontSize: typography.bodySize,
    fontWeight: '600',
    flexShrink: 1
  },
  card: {
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: 6
  },
  cardPressed: { backgroundColor: colors.bgRaised },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  parentHint: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  parentPath: { flexShrink: 1, minWidth: 0 },
  cardTitle: { color: colors.textPrimary, fontSize: typography.bodySize, fontWeight: '600' },
  labels: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle
  },
  canceledToggle: { alignSelf: 'flex-start', marginTop: spacing.sm }
})
