import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft, CornerDownRight, Ellipsis, Layers, Pencil, Trash2 } from 'lucide-react-native'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { ActionSheetModal } from '../components/ActionSheetModal'
import { ConfirmModal } from '../components/ConfirmModal'
import { colors, spacing, typography } from '../theme/mobile-theme'
import type { LocalTasksApi } from './local-tasks-api'
import { formatLocalTaskAgo, localTasksCopy } from './local-tasks-copy'
import { LocalTaskActivitySection } from './local-task-activity-section'
import { localTaskWriteMessage } from './local-task-failure-message'
import { localTaskStatusLookup } from './local-task-list-projection'
import { LocalTaskDetailSections } from './local-task-detail-sections'
import { createLocalTaskOperationIds, sendLocalTaskWrite } from './local-task-operation-ids'
import { LocalTaskPriorityPicker, LocalTaskStatusPicker } from './local-task-pickers'
import { localTaskStyles } from './local-tasks-styles'
import { LocalTaskPriorityIcon, LocalTaskStatusIcon } from './local-tasks-visuals'
import type { LocalTasksLibrary } from './use-local-tasks-library'

type Props = {
  library: LocalTasksLibrary
  api: LocalTasksApi
  taskId: string
  now: number
  readOnly: boolean
  onBack: () => void
  onOpenTask: (taskId: string) => void
  onEdit: (task: LocalTask) => void
  onAddSubtask: (parent: LocalTask) => void
}

export function LocalTaskDetailView(props: Props) {
  const copy = localTasksCopy()
  const insets = useSafeAreaInsets()
  const [ids] = useState(() => ({
    update: createLocalTaskOperationIds(),
    remove: createLocalTaskOperationIds()
  }))
  const [picker, setPicker] = useState<'status' | 'priority' | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { library } = props
  const task = library.tasks.find((candidate) => candidate.id === props.taskId) ?? null
  const project = task
    ? (library.projects.find((entry) => entry.id === task.projectId) ?? null)
    : null
  const lookup = localTaskStatusLookup(library.projects)
  const status = task ? (lookup.get(task.statusId) ?? null) : null
  const parent = task?.parentId
    ? (library.tasks.find((entry) => entry.id === task.parentId) ?? null)
    : null
  const subtasks = task
    ? library.tasks
        .filter((entry) => entry.parentId === task.id)
        .sort((a, b) => a.number - b.number)
    : []

  const update = async (patch: { statusId?: string; priority?: LocalTask['priority'] }) => {
    if (!task) {
      return
    }
    const outcome = await sendLocalTaskWrite(
      ids.update,
      { taskId: task.id, expectedRevision: task.revision, patch },
      props.api.updateTask
    )
    setError(localTaskWriteMessage(copy, outcome))
    if (outcome.kind === 'ok') {
      library.acceptTasks([outcome.value.task])
    }
    library.reload(['tasks'])
  }

  const remove = async () => {
    setConfirmDelete(false)
    if (!task) {
      return
    }
    const outcome = await sendLocalTaskWrite(ids.remove, { taskId: task.id }, props.api.removeTask)
    setError(localTaskWriteMessage(copy, outcome))
    library.reload(['tasks'])
    if (outcome.kind === 'ok') {
      props.onBack()
    }
  }

  return (
    <View style={[localTaskStyles.screen, { paddingTop: insets.top }]}>
      <View style={localTaskStyles.topBar}>
        <Pressable
          style={localTaskStyles.backButton}
          onPress={props.onBack}
          accessibilityRole="button"
        >
          <ChevronLeft size={22} color={colors.textPrimary} />
          <Text style={localTaskStyles.backLabel}>{copy.title}</Text>
        </Pressable>
        <View style={styles.titleCenter}>
          {task ? (
            <>
              <LocalTaskStatusIcon
                category={status?.category ?? null}
                color={status?.color ?? 'gray'}
                size={14}
              />
              <Text style={styles.ref}>{task.ref}</Text>
            </>
          ) : null}
        </View>
        <Pressable
          style={[
            localTaskStyles.iconButton,
            (!task || props.readOnly) && localTaskStyles.disabled
          ]}
          disabled={!task || props.readOnly}
          onPress={() => setMenuOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={copy.edit}
        >
          <Ellipsis size={18} color={colors.textSecondary} />
        </Pressable>
      </View>
      {!task ? (
        <View style={localTaskStyles.centered}>
          <Text style={localTaskStyles.centeredText}>{copy.taskMissing}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
          keyboardShouldPersistTaps="handled"
        >
          {props.readOnly ? (
            <Text style={[localTaskStyles.hint, styles.readOnly]}>{copy.libraryReadOnly}</Text>
          ) : null}
          <View style={styles.metaRow}>
            <Layers size={12} color={colors.textMuted} />
            <Text style={localTaskStyles.meta}>
              {project?.name ?? ''} ·{' '}
              {copy.updatedAgo(formatLocalTaskAgo(copy, task.updatedAt, props.now))}
            </Text>
          </View>
          <Text style={styles.title}>{task.title}</Text>
          <View style={styles.chips}>
            <Pressable
              style={localTaskStyles.chip}
              disabled={props.readOnly}
              onPress={() => setPicker('status')}
            >
              <LocalTaskStatusIcon
                category={status?.category ?? null}
                color={status?.color ?? 'gray'}
                size={14}
              />
              <Text style={localTaskStyles.chipText}>{status?.name ?? copy.unknownStatus}</Text>
            </Pressable>
            <Pressable
              style={localTaskStyles.chip}
              disabled={props.readOnly}
              onPress={() => setPicker('priority')}
            >
              <LocalTaskPriorityIcon priority={task.priority} />
              <Text style={localTaskStyles.chipText}>{copy.priorities[task.priority]}</Text>
            </Pressable>
            {task.labels.map((label) => (
              <View key={label} style={localTaskStyles.label}>
                <Text style={localTaskStyles.labelText}>{label}</Text>
              </View>
            ))}
          </View>
          {parent ? (
            <Pressable style={styles.parentRow} onPress={() => props.onOpenTask(parent.id)}>
              <CornerDownRight size={14} color={colors.textMuted} />
              <Text style={localTaskStyles.meta}>{copy.parent}</Text>
              <Text style={localTaskStyles.mono}>{parent.ref}</Text>
              <Text style={styles.parentTitle} numberOfLines={1}>
                {parent.title}
              </Text>
            </Pressable>
          ) : null}
          {error ? <Text style={[localTaskStyles.errorText, styles.error]}>{error}</Text> : null}
          <LocalTaskDetailSections
            task={task}
            subtasks={subtasks}
            statuses={lookup}
            readOnly={props.readOnly}
            onEdit={props.onEdit}
            onAddSubtask={props.onAddSubtask}
            onOpenTask={props.onOpenTask}
          />
          <LocalTaskActivitySection
            api={props.api}
            taskId={task.id}
            eventsVersion={library.eventsVersion}
            statuses={lookup}
            now={props.now}
            readOnly={props.readOnly}
            onChanged={() => library.reload(['events'])}
          />
        </ScrollView>
      )}
      <LocalTaskStatusPicker
        visible={picker === 'status'}
        project={project}
        selected={task?.statusId ?? null}
        onSelect={(statusId) => void update({ statusId })}
        onClose={() => setPicker(null)}
      />
      <LocalTaskPriorityPicker
        visible={picker === 'priority'}
        selected={task?.priority ?? 0}
        onSelect={(priority) => void update({ priority })}
        onClose={() => setPicker(null)}
      />
      <ActionSheetModal
        visible={menuOpen}
        title={task?.ref}
        actions={[
          { label: copy.edit, icon: Pencil, onPress: () => task && props.onEdit(task) },
          {
            label: copy.delete,
            icon: Trash2,
            destructive: true,
            onPress: () => setConfirmDelete(true)
          }
        ]}
        onClose={() => setMenuOpen(false)}
      />
      <ConfirmModal
        visible={confirmDelete}
        title={copy.deleteTaskTitle(task?.ref ?? '')}
        message={copy.deleteTaskMessage(subtasks.length)}
        confirmLabel={copy.delete}
        cancelLabel={copy.cancel}
        destructive
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  titleCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  ref: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontFamily: typography.monoFamily,
    fontSize: 13
  },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '700', marginTop: spacing.sm },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md
  },
  parentRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md },
  parentTitle: { flex: 1, color: colors.textSecondary, fontSize: 12 },
  error: { marginTop: spacing.sm },
  readOnly: { marginBottom: spacing.sm }
})
