import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Pencil, Plus } from 'lucide-react-native'
import type {
  LocalTask,
  LocalTaskStatusDef
} from '../../../src/shared/local-tasks/local-task-types'
import { colors } from '../theme/mobile-theme'
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
  sectionTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '600' }
})
