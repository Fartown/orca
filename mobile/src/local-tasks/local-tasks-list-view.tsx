import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { ChevronDown, ChevronRight, ListTodo } from 'lucide-react-native'
import type { LocalTaskStatusCategory } from '../../../src/shared/local-tasks/local-task-model'
import type {
  LocalTask,
  LocalTaskStatusDef
} from '../../../src/shared/local-tasks/local-task-types'
import { unfoldedLocalTaskLines } from '../../../src/shared/local-tasks/local-task-list-groups'
import { colors, spacing, typography } from '../theme/mobile-theme'
import { formatLocalTaskAgo, localTasksCopy } from './local-tasks-copy'
import type { LocalTaskListGroup, LocalTaskListRow } from './local-task-list-projection'
import { localTaskStyles } from './local-tasks-styles'
import { LocalTaskPriorityIcon, LocalTaskStatusIcon } from './local-tasks-visuals'

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
  onOpen: (taskId: string) => void
}

export function LocalTasksListView(props: Props) {
  const copy = localTasksCopy()
  const [toggledGroups, setToggledGroups] = useState<ReadonlySet<string>>(new Set())
  const [foldedParents, setFoldedParents] = useState<ReadonlySet<string>>(new Set())
  const toggle = (set: ReadonlySet<string>, key: string) => {
    const next = new Set(set)
    if (!next.delete(key)) {
      next.add(key)
    }
    return next
  }
  if (props.groups.length === 0) {
    return (
      <View style={localTaskStyles.centered}>
        <Text style={localTaskStyles.centeredText}>{props.emptyText ?? copy.emptyList}</Text>
      </View>
    )
  }
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: props.bottomInset + 96 }}>
      {props.groups.map((group) => {
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
                color={group.status?.color ?? 'gray'}
                size={15}
              />
              <Text style={styles.groupTitle}>
                {group.status?.name ??
                  (group.category ? copy.categories[group.category] : copy.unknownStatus)}
              </Text>
              <Text style={localTaskStyles.meta}>{group.rows.length}</Text>
            </Pressable>
            {folded
              ? null
              : group.rows.map((row) => (
                  <LocalTaskListRowView
                    key={row.task.id}
                    row={row}
                    lookup={props.lookup}
                    now={props.now}
                    folded={foldedParents}
                    onToggle={(taskId) => setFoldedParents((previous) => toggle(previous, taskId))}
                    onOpen={props.onOpen}
                  />
                ))}
          </View>
        )
      })}
    </ScrollView>
  )
}

function LocalTaskListRowView(props: {
  row: LocalTaskListRow
  lookup: Map<string, LocalTaskStatusDef>
  now: number
  folded: ReadonlySet<string>
  onToggle: (taskId: string) => void
  onOpen: (taskId: string) => void
}) {
  const copy = localTasksCopy()
  const { task } = props.row
  const status = props.lookup.get(task.statusId) ?? null
  const expanded = !props.folded.has(task.id)
  return (
    <View style={styles.rowBlock}>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => props.onOpen(task.id)}
        accessibilityRole="button"
        accessibilityLabel={`${task.ref} ${task.title}`}
      >
        <LocalTaskStatusIcon category={status?.category ?? null} color={status?.color ?? 'gray'} />
        <View style={styles.rowMain}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {task.title}
          </Text>
          <View style={styles.rowMeta}>
            <LocalTaskPriorityIcon priority={task.priority} />
            <Text style={localTaskStyles.mono}>{task.ref}</Text>
            {task.labels.slice(0, 2).map((label) => (
              <Text key={label} style={localTaskStyles.meta} numberOfLines={1}>
                · {label}
              </Text>
            ))}
            {props.row.subtaskTotal > 0 || props.row.subtasks.length > 0 ? (
              <Pressable
                style={styles.subtaskChip}
                onPress={() => props.onToggle(task.id)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
              >
                <ListTodo size={11} color={colors.textMuted} />
                <Text style={localTaskStyles.meta}>
                  {props.row.subtaskDone}/{props.row.subtaskTotal}
                </Text>
                {expanded ? (
                  <ChevronDown size={11} color={colors.textMuted} />
                ) : (
                  <ChevronRight size={11} color={colors.textMuted} />
                )}
              </Pressable>
            ) : null}
          </View>
        </View>
        <Text style={localTaskStyles.meta}>
          {formatLocalTaskAgo(copy, task.updatedAt, props.now)}
        </Text>
      </Pressable>
      {expanded
        ? unfoldedLocalTaskLines(props.row.subtasks, props.folded).map((line) => (
            <LocalTaskSubtaskRow
              key={line.task.id}
              task={line.task}
              status={props.lookup.get(line.task.statusId) ?? null}
              depth={line.depth}
              folded={line.childCount > 0 ? props.folded.has(line.task.id) : undefined}
              onToggle={() => props.onToggle(line.task.id)}
              onOpen={props.onOpen}
            />
          ))
        : null}
    </View>
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
  onOpen: (taskId: string) => void
}) {
  const indent = (Math.min(props.depth ?? 1, MAX_INDENT_DEPTH) - 1) * spacing.lg
  return (
    <Pressable
      style={({ pressed }) => [
        styles.subtaskRow,
        indent > 0 && { paddingLeft: spacing.xl + spacing.lg + indent },
        pressed && styles.rowPressed
      ]}
      onPress={() => props.onOpen(props.task.id)}
      accessibilityRole="button"
      accessibilityLabel={`${props.task.ref} ${props.task.title}`}
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
      {props.folded !== undefined ? (
        <Pressable
          testID={`local-task-fold-${props.task.id}`}
          onPress={props.onToggle}
          hitSlop={8}
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
    paddingVertical: 10,
    backgroundColor: colors.bgPanel,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle
  },
  groupTitle: { color: colors.textPrimary, fontSize: typography.metaSize, fontWeight: '600' },
  rowBlock: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md
  },
  rowPressed: { backgroundColor: colors.bgRaised },
  rowMain: { flex: 1, minWidth: 0, gap: 4 },
  rowTitle: { color: colors.textPrimary, fontSize: typography.bodySize },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  subtaskChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: colors.bgRaised
  },
  subtaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.xl + spacing.lg,
    paddingRight: spacing.lg,
    paddingVertical: 10
  },
  subtaskTitle: { flex: 1, color: colors.textPrimary, fontSize: typography.metaSize + 1 }
})
