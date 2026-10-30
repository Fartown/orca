import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Pencil, Plus } from 'lucide-react-native'
import type {
  LocalTask,
  LocalTaskStatusDef
} from '../../../src/shared/local-tasks/local-task-types'
import { colors, spacing } from '../theme/mobile-theme'
import { localTasksCopy } from './local-tasks-copy'
import type { LocalTaskRowSession } from './local-task-progress-projection'
import { LocalTaskSubtaskRow } from './local-tasks-list-view'
import { localTaskStyles } from './local-tasks-styles'

/** Keys a read-only line by its text and how many identical lines precede it, not by position. */
function keyedLines(lines: readonly string[]): { key: string; text: string }[] {
  const seen = new Map<string, number>()
  return lines.map((text) => {
    const occurrence = (seen.get(text) ?? 0) + 1
    seen.set(text, occurrence)
    return { key: `${occurrence}:${text}`, text }
  })
}

/** Description, done criteria and the task's direct subtasks; any level may have them (D-008). */
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
  const copy = localTasksCopy()
  const { task } = props
  const done = props.subtasks.filter(
    (child) => props.statuses.get(child.statusId)?.category === 'completed'
  )
  return (
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
      <Text style={task.description ? localTaskStyles.body : localTaskStyles.meta}>
        {task.description || copy.noDescription}
      </Text>
      {task.criteria.length > 0 ? (
        <>
          <Text style={[styles.sectionTitle, styles.sectionGap]}>{copy.criteria}</Text>
          {keyedLines(task.criteria).map((line) => (
            // Hanging indent: the bullet keeps its own column, wrapped lines align with the text.
            <View key={line.key} style={styles.bulletRow}>
              <Text style={[localTaskStyles.body, styles.bulletMark]}>•</Text>
              <Text style={[localTaskStyles.body, styles.bulletText]}>{line.text}</Text>
            </View>
          ))}
        </>
      ) : null}
      <View style={localTaskStyles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>
          {props.subtasks.length > 0
            ? `${copy.subtasks} ${done.length}/${props.subtasks.length}`
            : copy.subtasks}
        </Text>
        {props.readOnly ? null : (
          <Pressable style={localTaskStyles.sectionAction} onPress={() => props.onAddSubtask(task)}>
            <Plus size={12} color={colors.textSecondary} />
            <Text style={localTaskStyles.sectionActionText}>{copy.addSubtask}</Text>
          </Pressable>
        )}
      </View>
      {props.subtasks.length > 0 ? (
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
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  sectionTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  sectionGap: { marginTop: spacing.lg, marginBottom: spacing.sm },
  bulletRow: { flexDirection: 'row', marginBottom: 4 },
  bulletMark: { width: 14 },
  bulletText: { flex: 1 }
})
