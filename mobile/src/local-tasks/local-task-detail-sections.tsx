import { Pressable, Text, View } from 'react-native'
import { Pencil, Plus } from 'lucide-react-native'
import type {
  LocalTask,
  LocalTaskStatusDef
} from '../../../src/shared/local-tasks/local-task-types'
import { colors, spacing, typography } from '../theme/mobile-theme'
import { themedStyleSheet } from '../theme/themed-styles'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { localTasksCopy } from './local-tasks-copy'
import type { LocalTaskRowSession } from './local-task-progress-projection'
import { LocalTaskSubtaskRow } from './local-tasks-list-view'
import { localTaskStyles } from './local-tasks-styles'

/** Description and the task's direct subtasks; any level may have them. */
export function LocalTaskDetailSections(props: {
  task: LocalTask
  subtasks: LocalTask[]
  statuses: Map<string, LocalTaskStatusDef>
  readOnly: boolean
  /** The sessions a subtask's line shows as dots (REQ-012). */
  sessionsFor: (task: LocalTask) => LocalTaskRowSession[]
  onEdit: (task: LocalTask) => void
  onAddSubtask: (parent: LocalTask) => void
  onOpenTask: (taskId: string) => void
}) {
  useMobileColorScheme()
  const t = useMobileTranslation()
  const copy = localTasksCopy()
  const { task } = props
  const done = props.subtasks.filter(
    (child) => props.statuses.get(child.statusId)?.category === 'completed'
  )
  return (
    <>
      {task.description ? (
        <>
          <View style={localTaskStyles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>{copy.description}</Text>
            {props.readOnly ? null : (
              <Pressable style={localTaskStyles.sectionAction} onPress={() => props.onEdit(task)}>
                <Pencil size={12} color={colors.textSecondary} />
                <Text style={localTaskStyles.sectionActionText}>{copy.edit}</Text>
              </Pressable>
            )}
          </View>
          <Text style={localTaskStyles.body}>{task.description}</Text>
        </>
      ) : null}
      {!props.readOnly && (!task.description || props.subtasks.length === 0) ? (
        <View style={styles.emptyActions} testID="local-task-detail-empty-actions">
          {!task.description ? (
            <Pressable
              style={styles.emptyAction}
              onPress={() => props.onEdit(task)}
              accessibilityRole="button"
            >
              <Pencil size={12} color={colors.textSecondary} />
              <Text style={styles.emptyActionText}>
                {t('localTasks.detail.addDescription', 'Add description')}
              </Text>
            </Pressable>
          ) : null}
          {props.subtasks.length === 0 ? (
            <Pressable
              style={styles.emptyAction}
              onPress={() => props.onAddSubtask(task)}
              accessibilityRole="button"
            >
              <Plus size={12} color={colors.textSecondary} />
              <Text style={styles.emptyActionText}>
                {t('localTasks.detail.addFirstSubtask', 'Add subtask')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {props.subtasks.length > 0 ? (
        <>
          <View style={localTaskStyles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>
              {`${copy.subtasks} ${done.length}/${props.subtasks.length}`}
            </Text>
            {props.readOnly ? null : (
              <Pressable
                style={localTaskStyles.sectionAction}
                onPress={() => props.onAddSubtask(task)}
              >
                <Plus size={12} color={colors.textSecondary} />
                <Text style={localTaskStyles.sectionActionText}>{copy.addSubtask}</Text>
              </Pressable>
            )}
          </View>
          <View style={localTaskStyles.card}>
            {props.subtasks.map((child) => (
              <LocalTaskSubtaskRow
                key={child.id}
                task={child}
                status={props.statuses.get(child.statusId) ?? null}
                inCard
                sessions={props.sessionsFor(child)}
                onOpen={props.onOpenTask}
              />
            ))}
          </View>
        </>
      ) : null}
    </>
  )
}

const styles = themedStyleSheet(() => ({
  sectionTitle: { color: colors.textMuted, fontSize: typography.metaSize, fontWeight: '600' },
  emptyActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg
  },
  emptyAction: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: 44,
    gap: spacing.xs,
    paddingHorizontal: spacing.sm
  },
  emptyActionText: { color: colors.textSecondary, fontSize: typography.metaSize }
}))
