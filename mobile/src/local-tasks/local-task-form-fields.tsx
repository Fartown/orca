import { useRef, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { ChevronRight, ListTodo, Pencil, Plus, Trash2, X } from 'lucide-react-native'
import {
  LOCAL_TASK_CRITERIA_MAX,
  LOCAL_TASK_CRITERION_MAX,
  LOCAL_TASK_TITLE_MAX
} from '../../../src/shared/local-tasks/local-task-model'
import { ActionSheetModal } from '../components/ActionSheetModal'
import { ConfirmModal } from '../components/ConfirmModal'
import { colors, spacing } from '../theme/mobile-theme'
import { localTasksCopy } from './local-tasks-copy'
import {
  isMultiLinePaste,
  localTaskDraftEntries,
  newLocalTaskDraftEntry,
  splitPastedLines,
  type LocalTaskDraftEntry
} from './local-task-form-state'
import { LocalTaskGrowingInput } from './local-task-growing-input'
import { localTaskStyles } from './local-tasks-styles'

export function LocalTaskCriteriaEditor(props: {
  criteria: LocalTaskDraftEntry[]
  onChange: (criteria: LocalTaskDraftEntry[]) => void
}) {
  const copy = localTasksCopy()
  const set = (id: string, text: string) =>
    props.onChange(props.criteria.map((entry) => (entry.id === id ? { ...entry, text } : entry)))
  return (
    <View>
      <Text style={localTaskStyles.sectionLabel}>
        {copy.criteria} <Text style={localTaskStyles.meta}>{copy.criteriaOptional}</Text>
      </Text>
      {props.criteria.map((entry) => (
        <View key={entry.id} style={[styles.lineRow, styles.criterionRow]}>
          <Text style={[localTaskStyles.meta, styles.criterionBullet]}>•</Text>
          <LocalTaskGrowingInput
            style={[localTaskStyles.bareInput, styles.lineInput, styles.criterionInput]}
            minHeight={CRITERION_LINE_HEIGHT}
            value={entry.text}
            maxLength={LOCAL_TASK_CRITERION_MAX}
            // Why: a criterion is one line of the stored list; Return must not split it.
            onChangeText={(text) => set(entry.id, text.replace(/\r?\n/g, ' '))}
            placeholder={copy.criterionPlaceholder}
            placeholderTextColor={colors.textMuted}
          />
          <Pressable
            style={[styles.removeButton, styles.criterionRemove]}
            onPress={() => props.onChange(props.criteria.filter((other) => other.id !== entry.id))}
            accessibilityRole="button"
            accessibilityLabel={copy.delete}
          >
            <X size={14} color={colors.textMuted} />
          </Pressable>
        </View>
      ))}
      {props.criteria.length < LOCAL_TASK_CRITERIA_MAX ? (
        <Pressable
          style={styles.addRow}
          onPress={() => props.onChange([...props.criteria, newLocalTaskDraftEntry()])}
          accessibilityRole="button"
        >
          <Plus size={14} color={colors.textSecondary} />
          <Text style={localTaskStyles.sectionActionText}>{copy.addCriterion}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

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

const CRITERION_LINE_HEIGHT = 21

const styles = StyleSheet.create({
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  lineInput: { flex: 1 },
  // A criterion wraps, so the bullet and the remove button stay on its first line.
  criterionRow: { alignItems: 'flex-start' },
  criterionBullet: { lineHeight: CRITERION_LINE_HEIGHT },
  criterionInput: { lineHeight: CRITERION_LINE_HEIGHT },
  criterionRemove: { marginTop: (CRITERION_LINE_HEIGHT - 32) / 2 },
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
  propertyValue: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }
})
