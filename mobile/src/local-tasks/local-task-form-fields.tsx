import { useRef, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { ChevronRight, ListTodo, Pencil, Trash2, X } from 'lucide-react-native'
import { LOCAL_TASK_TITLE_MAX } from '../../../src/shared/local-tasks/local-task-model'
import type { LocalTask, LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import { ActionSheetModal } from '../components/ActionSheetModal'
import { ConfirmModal } from '../components/ConfirmModal'
import { colors, spacing } from '../theme/mobile-theme'
import { localTasksCopy } from './local-tasks-copy'
import {
  isMultiLinePaste,
  localTaskDraftEntries,
  splitPastedLines,
  type LocalTaskDraft,
  type LocalTaskDraftEntry
} from './local-task-form-state'
import { LocalTaskGrowingInput } from './local-task-growing-input'
import { localTaskStatusLookup, orderedLocalTaskStatuses } from './local-task-list-projection'
import type { LocalTaskDraftPicker } from './local-task-pickers'
import { localTaskStyles } from './local-tasks-styles'
import { LocalTaskPriorityIcon, LocalTaskStatusIcon } from './local-tasks-visuals'

/** Subtasks typed into a new task. A paste of several lines adds one entry per line. */
export function LocalTaskSubtaskEntries(props: {
  entries: LocalTaskDraftEntry[]
  onChange: (entries: LocalTaskDraftEntry[]) => void
}) {
  const copy = localTasksCopy()
  const [input, setInput] = useState('')
  const commit = (lines: string[]) => {
    if (lines.length > 0) {
      props.onChange([...props.entries, ...localTaskDraftEntries(lines)])
    }
    setInput('')
  }
  return (
    <View>
      <Text style={localTaskStyles.sectionLabel}>{copy.subtasks}</Text>
      {props.entries.map((entry) => (
        <View key={entry.id} style={styles.lineRow}>
          <ListTodo size={14} color={colors.textMuted} />
          <Text style={[localTaskStyles.body, styles.lineInput]}>{entry.text}</Text>
          <Pressable
            style={styles.removeButton}
            onPress={() => props.onChange(props.entries.filter((other) => other.id !== entry.id))}
            accessibilityRole="button"
            accessibilityLabel={copy.delete}
          >
            <X size={14} color={colors.textMuted} />
          </Pressable>
        </View>
      ))}
      <TextInput
        style={localTaskStyles.input}
        value={input}
        multiline
        onChangeText={(next) => {
          // Why both: a typed Return ends one entry, a pasted block becomes one entry per line.
          if (isMultiLinePaste(input, next) || next.endsWith('\n')) {
            commit(splitPastedLines(next))
            return
          }
          setInput(next)
        }}
        onSubmitEditing={() => commit(splitPastedLines(input))}
        onBlur={() => commit(splitPastedLines(input))}
        placeholder={copy.subtaskPlaceholder}
        placeholderTextColor={colors.textMuted}
        maxLength={LOCAL_TASK_TITLE_MAX * 20}
      />
    </View>
  )
}

export function LocalTaskPropertyRow(props: {
  label: string
  first?: boolean
  disabled?: boolean
  onPress?: () => void
  children: ReactNode
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        localTaskStyles.cardRow,
        props.first && localTaskStyles.cardRowFirst,
        pressed && props.onPress && localTaskStyles.pressed,
        props.disabled && localTaskStyles.disabled
      ]}
      disabled={props.disabled || !props.onPress}
      onPress={props.onPress}
      accessibilityRole={props.onPress ? 'button' : undefined}
    >
      <Text style={localTaskStyles.rowLabel}>{props.label}</Text>
      <View style={styles.propertyValue}>{props.children}</View>
      {props.onPress ? <ChevronRight size={16} color={colors.textMuted} /> : null}
    </Pressable>
  )
}

/** Status, priority, labels and (outside a subtask form) parent, each opening its picker. */
export function LocalTaskPropertiesCard(props: {
  draft: LocalTaskDraft
  projects: readonly LocalTaskProject[]
  tasks: readonly LocalTask[]
  showParent: boolean
  hidden: boolean
  onPick: (picker: LocalTaskDraftPicker) => void
  onPatch: (next: Partial<LocalTaskDraft>) => void
}) {
  const copy = localTasksCopy()
  const { draft } = props
  const project = props.projects.find((entry) => entry.id === draft.projectId) ?? null
  const status = draft.statusId
    ? (localTaskStatusLookup(props.projects).get(draft.statusId) ?? null)
    : null
  // An unset status is the project's first Unstarted one, which the desktop applies on create.
  const shownStatus =
    status ??
    (project
      ? (orderedLocalTaskStatuses(project).find((entry) => entry.category === 'unstarted') ?? null)
      : null)
  const parent = draft.parentId
    ? (props.tasks.find((task) => task.id === draft.parentId) ?? null)
    : null
  return (
    <View style={[localTaskStyles.card, props.hidden && styles.hidden]}>
      <LocalTaskPropertyRow label={copy.status} first onPress={() => props.onPick('status')}>
        <LocalTaskStatusIcon
          category={shownStatus?.category ?? 'unstarted'}
          color={shownStatus?.color ?? 'gray'}
          size={14}
        />
        <Text style={localTaskStyles.rowValue}>
          {shownStatus?.name ?? copy.defaultStatusNames.unstarted}
        </Text>
      </LocalTaskPropertyRow>
      <LocalTaskPropertyRow label={copy.priority} onPress={() => props.onPick('priority')}>
        <LocalTaskPriorityIcon priority={draft.priority} />
        <Text style={localTaskStyles.rowValue}>{copy.priorities[draft.priority]}</Text>
      </LocalTaskPropertyRow>
      <LocalTaskPropertyRow label={copy.labels}>
        <LocalTaskGrowingInput
          style={[localTaskStyles.bareInput, styles.labels]}
          minHeight={21}
          blurOnSubmit
          value={draft.labelsText}
          onChangeText={(labelsText) =>
            props.onPatch({ labelsText: labelsText.replace(/\r?\n/g, ' ') })
          }
          placeholder={copy.labelsPlaceholder}
          placeholderTextColor={colors.textMuted}
        />
      </LocalTaskPropertyRow>
      {props.showParent ? (
        <LocalTaskPropertyRow label={copy.parent} onPress={() => props.onPick('parent')}>
          <Text
            style={parent ? localTaskStyles.rowValue : localTaskStyles.rowValueMuted}
            numberOfLines={1}
          >
            {parent ? parent.title : copy.none}
          </Text>
        </LocalTaskPropertyRow>
      ) : null}
    </View>
  )
}

/** The choice a multi-line title paste offers in a subtask form. */
export function LocalTaskPasteChoice(props: {
  lines: string[] | null
  parentTitle: string
  onSubtasks: (lines: string[]) => void
  onSingleTitle: (title: string) => void
  onClose: () => void
}) {
  const copy = localTasksCopy()
  const lines = props.lines ?? []
  return (
    <ActionSheetModal
      visible={props.lines !== null}
      title={copy.pastedLines(lines.length)}
      actions={[
        {
          label: copy.pasteAsSubtasks(lines.length),
          hint: copy.pasteAsSubtasksHint(props.parentTitle),
          icon: ListTodo,
          onPress: () => props.onSubtasks(lines)
        },
        {
          label: copy.pasteAsTitle,
          hint: copy.pasteAsTitleHint,
          icon: Pencil,
          onPress: () => props.onSingleTitle(lines.join(' ').slice(0, LOCAL_TASK_TITLE_MAX))
        }
      ]}
      onClose={props.onClose}
    />
  )
}

/**
 * The form's two interruptions: subtasks that did not save, and another device's edit landing
 * first. Dismissing the conflict keeps the draft; only "Discard" drops it.
 */
export function LocalTaskFormPrompts(props: {
  notice: string | null
  onLeaveNotice: () => void
  conflict: boolean
  onOverwrite: () => void
  onDiscard: () => void
  onKeepEditing: () => void
}) {
  const copy = localTasksCopy()
  // Why: the sheet calls onClose after an action too; only a plain dismissal means "keep editing".
  const decided = useRef(false)
  const decide = (action: () => void) => () => {
    decided.current = true
    action()
  }
  return (
    <>
      <ConfirmModal
        visible={props.notice !== null}
        title={props.notice ?? ''}
        cancelLabel={null}
        confirmLabel={copy.back}
        onConfirm={props.onLeaveNotice}
        onCancel={props.onLeaveNotice}
      />
      <ActionSheetModal
        visible={props.conflict}
        title={copy.conflictTitle}
        message={copy.conflictMessage}
        actions={[
          { label: copy.overwrite, icon: Pencil, onPress: decide(props.onOverwrite) },
          {
            label: copy.discard,
            icon: Trash2,
            destructive: true,
            onPress: decide(props.onDiscard)
          }
        ]}
        onClose={() => {
          if (!decided.current) {
            props.onKeepEditing()
          }
          decided.current = false
        }}
      />
    </>
  )
}

const styles = StyleSheet.create({
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  lineInput: { flex: 1 },
  // Why 32pt with negative margins: big enough to hit (the page ignores hitSlop) without
  // making the row taller than its text.
  removeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: -9,
    marginRight: -9
  },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: spacing.sm },
  labels: { flex: 1, lineHeight: 21 },
  hidden: { display: 'none' },
  propertyValue: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }
})
