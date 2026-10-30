import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ListTodo, X } from 'lucide-react-native'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { LOCAL_TASK_CREATE_SOURCE_COPY_EN } from './local-task-create-source-copy'
import type { LocalTaskCreateSourceRow } from './local-task-create-source-rows'

/**
 * A Local row in Create From's results, laid out like upstream's source rows: the title leads, the
 * ref small and muted beneath it with the reason a greyed row cannot be picked.
 */
export function LocalTaskCreateSourceRowView(props: {
  row: LocalTaskCreateSourceRow
  onPress: () => void
}) {
  const { row } = props
  if (!row.task) {
    return <Text style={styles.notice}>{row.note}</Text>
  }
  const detail = [row.task.ref, row.note].filter(Boolean).join(' · ')
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && !row.disabled && styles.rowPressed]}
      disabled={row.disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: row.disabled }}
      accessibilityLabel={`${row.task.title}, ${detail}`}
      onPress={props.onPress}
    >
      <View style={[styles.icon, row.disabled && styles.disabled]}>
        <ListTodo size={16} color={colors.textSecondary} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, row.disabled && styles.disabled]} numberOfLines={1}>
          {row.task.title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {detail}
        </Text>
      </View>
    </Pressable>
  )
}

/** The picked task in place of the name field, as upstream shows a picked issue: title, then ref. */
export function LocalTaskCreateSourcePill(props: { task: LocalTask; onClear: () => void }) {
  return (
    <View style={styles.pill}>
      <ListTodo size={15} color={colors.textSecondary} />
      <Text style={styles.pillLabel} numberOfLines={1}>
        {props.task.title} <Text style={styles.pillRef}>{props.task.ref}</Text>
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={LOCAL_TASK_CREATE_SOURCE_COPY_EN.clearTask}
        hitSlop={6}
        onPress={props.onClear}
      >
        <X size={15} color={colors.textMuted} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md + 2
  },
  rowPressed: {
    backgroundColor: colors.bgRaised
  },
  icon: {
    width: 18,
    alignItems: 'center'
  },
  copy: {
    flex: 1,
    minWidth: 0
  },
  title: {
    fontSize: typography.bodySize,
    color: colors.textPrimary
  },
  subtitle: {
    fontSize: typography.metaSize,
    color: colors.textMuted,
    marginTop: 1
  },
  disabled: {
    opacity: 0.55
  },
  notice: {
    fontSize: typography.metaSize,
    color: colors.textSecondary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md + 2
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bgRaised,
    borderRadius: radii.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle
  },
  pillLabel: {
    flex: 1,
    fontSize: typography.bodySize,
    color: colors.textPrimary
  },
  pillRef: {
    fontSize: typography.metaSize,
    color: colors.textMuted
  }
})
