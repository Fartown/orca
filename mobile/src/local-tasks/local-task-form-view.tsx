import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Check, ChevronDown, CornerDownRight, Layers } from 'lucide-react-native'
import {
  LOCAL_TASK_DESCRIPTION_MAX,
  LOCAL_TASK_TITLE_MAX
} from '../../../src/shared/local-tasks/local-task-model'
import { buildLocalTaskIndex } from '../../../src/shared/local-tasks/local-task-grouping'
import { localTaskParentCandidates } from '../../../src/shared/local-tasks/local-task-hierarchy'
import { MobileSwitch } from '../components/MobileSwitch'
import { colors, spacing } from '../theme/mobile-theme'
import type { LocalTasksApi } from './local-tasks-api'
import { localTasksCopy } from './local-tasks-copy'
import {
  LocalTaskCriteriaEditor,
  LocalTaskFormPrompts,
  LocalTaskPasteChoice,
  LocalTaskPropertyRow,
  LocalTaskSubtaskEntries
} from './local-task-form-fields'
import {
  initialLocalTaskDraft,
  isMultiLinePaste,
  nextLocalTaskDraft,
  splitPastedLines,
  type LocalTaskDraft,
  type LocalTaskFormMode
} from './local-task-form-state'
import { localTaskStatusLookup, orderedLocalTaskStatuses } from './local-task-list-projection'
import { LocalTaskGrowingInput } from './local-task-growing-input'
import { LocalTaskDraftPickers, type LocalTaskDraftPicker } from './local-task-pickers'
import { localTaskStyles } from './local-tasks-styles'
import { LocalTaskPriorityIcon, LocalTaskStatusIcon } from './local-tasks-visuals'
import { useLocalTaskFormSubmit } from './use-local-task-form-submit'
import type { LocalTasksLibrary } from './use-local-tasks-library'

type Props = {
  library: LocalTasksLibrary
  api: LocalTasksApi
  mode: LocalTaskFormMode
  readOnly: boolean
  onClose: () => void
  /** The task the form created or saved, which the caller then shows. */
  onDone: (taskId: string) => void
}

export function LocalTaskFormView(props: Props) {
  const copy = localTasksCopy()
  const insets = useSafeAreaInsets()
  const { library, mode } = props
  const [draft, setDraft] = useState<LocalTaskDraft>(() => initialLocalTaskDraft(mode))
  const [picker, setPicker] = useState<LocalTaskDraftPicker | null>(null)
  const [continueCreating, setContinueCreating] = useState(false)
  const [pasted, setPasted] = useState<string[] | null>(null)
  const submit = useLocalTaskFormSubmit(props.api, library)
  const patch = (next: Partial<LocalTaskDraft>) =>
    setDraft((previous) => ({ ...previous, ...next }))

  const project = library.projects.find((entry) => entry.id === draft.projectId) ?? null
  const lookup = localTaskStatusLookup(library.projects)
  const status = draft.statusId ? (lookup.get(draft.statusId) ?? null) : null
  // An unset status is the project's first Unstarted one, which the desktop applies on create.
  const shownStatus =
    status ??
    (project
      ? (orderedLocalTaskStatuses(project).find((entry) => entry.category === 'unstarted') ?? null)
      : null)
  const editing = mode.kind === 'edit' ? mode.task : null
  const parentCandidates = localTaskParentCandidates(
    editing,
    draft.projectId,
    library.tasks,
    buildLocalTaskIndex([], library.tasks)
  )
  const parent = draft.parentId
    ? (library.tasks.find((task) => task.id === draft.parentId) ?? null)
    : null
  const title =
    mode.kind === 'edit' ? copy.editTask : mode.kind === 'subtask' ? copy.newSubtask : copy.newTask
  const canSubmit =
    !props.readOnly && draft.title.trim().length > 0 && !submit.busy && !submit.subtaskRetryPending

  const leaveNotice = () => {
    const taskId = submit.dismissNotice()
    if (taskId) {
      props.onDone(taskId)
    }
  }
  const finish = (taskId: string) => {
    if (mode.kind !== 'edit' && continueCreating) {
      setDraft(nextLocalTaskDraft)
      return
    }
    props.onDone(taskId)
  }

  return (
    <View style={[localTaskStyles.screen, { paddingTop: insets.top }]}>
      <View style={localTaskStyles.topBar}>
        <Pressable onPress={props.onClose} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.cancel}>{copy.cancel}</Text>
        </Pressable>
        <Text style={localTaskStyles.topBarTitle}>{title}</Text>
        <View style={styles.topBarBalance} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {mode.kind === 'subtask' ? (
          <View style={[localTaskStyles.chip, styles.contextChip]}>
            <CornerDownRight size={13} color={colors.textMuted} />
            <Text style={localTaskStyles.chipMeta}>{copy.parent}</Text>
            <Text style={localTaskStyles.mono}>{mode.parent.ref}</Text>
            <Text style={localTaskStyles.chipText} numberOfLines={1}>
              {mode.parent.title}
            </Text>
          </View>
        ) : (
          <Pressable
            style={[localTaskStyles.chip, styles.contextChip]}
            onPress={() => setPicker('project')}
            accessibilityRole="button"
            accessibilityLabel={copy.project}
          >
            <Layers size={13} color={colors.textSecondary} />
            <Text style={localTaskStyles.chipText} numberOfLines={1}>
              {project?.name ?? ''}
            </Text>
            <Text style={localTaskStyles.chipMeta}>{project?.prefix ?? ''}</Text>
            <ChevronDown size={13} color={colors.textMuted} />
          </Pressable>
        )}
        <LocalTaskGrowingInput
          style={[localTaskStyles.titleInput, styles.title]}
          minHeight={TITLE_LINE_HEIGHT}
          value={draft.title}
          autoFocus={mode.kind !== 'edit'}
          maxLength={LOCAL_TASK_TITLE_MAX * 20}
          placeholder={copy.titlePlaceholder}
          placeholderTextColor={colors.textMuted}
          onChangeText={(next) => {
            // Read-only can't create subtasks, so a paste stays as one title instead of a choice
            // that would never show.
            if (!props.readOnly && mode.kind === 'subtask' && isMultiLinePaste(draft.title, next)) {
              setPasted(splitPastedLines(next))
              return
            }
            patch({ title: next.replace(/\r?\n/g, ' ') })
          }}
        />
        {mode.kind === 'subtask' ? null : (
          <LocalTaskGrowingInput
            style={[localTaskStyles.bareInput, styles.description]}
            minHeight={60}
            value={draft.description}
            maxLength={LOCAL_TASK_DESCRIPTION_MAX}
            placeholder={copy.descriptionPlaceholder}
            placeholderTextColor={colors.textMuted}
            onChangeText={(description) => patch({ description })}
          />
        )}
        <LocalTaskCriteriaEditor
          criteria={draft.criteria}
          onChange={(criteria) => patch({ criteria })}
        />
        {mode.kind === 'create' ? (
          <LocalTaskSubtaskEntries
            entries={draft.subtasks}
            onChange={(subtasks) => patch({ subtasks })}
          />
        ) : null}
        <Text style={localTaskStyles.sectionLabel}>{copy.properties}</Text>
        <View style={localTaskStyles.card}>
          <LocalTaskPropertyRow label={copy.status} first onPress={() => setPicker('status')}>
            <LocalTaskStatusIcon
              category={shownStatus?.category ?? 'unstarted'}
              color={shownStatus?.color ?? 'gray'}
              size={14}
            />
            <Text style={localTaskStyles.rowValue}>
              {shownStatus?.name ?? copy.defaultStatusNames.unstarted}
            </Text>
          </LocalTaskPropertyRow>
          <LocalTaskPropertyRow label={copy.priority} onPress={() => setPicker('priority')}>
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
                patch({ labelsText: labelsText.replace(/\r?\n/g, ' ') })
              }
              placeholder={copy.labelsPlaceholder}
              placeholderTextColor={colors.textMuted}
            />
          </LocalTaskPropertyRow>
          {mode.kind === 'subtask' ? null : (
            <LocalTaskPropertyRow label={copy.parent} onPress={() => setPicker('parent')}>
              <Text
                style={parent ? localTaskStyles.rowValue : localTaskStyles.rowValueMuted}
                numberOfLines={1}
              >
                {parent ? parent.title : copy.none}
              </Text>
            </LocalTaskPropertyRow>
          )}
        </View>
        {submit.error ? (
          <Text style={[localTaskStyles.errorText, styles.gap]}>{submit.error}</Text>
        ) : null}
        {mode.kind === 'subtask' && submit.subtaskRetryPending ? (
          <View style={styles.partialActions}>
            <Pressable
              style={localTaskStyles.secondaryButton}
              disabled={submit.busy}
              onPress={() =>
                void submit
                  .retrySubtasks(mode.parent, draft)
                  .then((ok) => ok && finish(mode.parent.id))
              }
              accessibilityRole="button"
            >
              <Text style={localTaskStyles.secondaryButtonText}>{copy.retrySavingSubtasks}</Text>
            </Pressable>
            {/* Viewing them writes nothing, so a read-only library still lets the user go look. */}
            {submit.partialTaskId ? (
              <Pressable
                style={localTaskStyles.secondaryButton}
                disabled={submit.busy}
                onPress={() => props.onDone(mode.parent.id)}
                accessibilityRole="button"
              >
                <Text style={localTaskStyles.secondaryButtonText}>{copy.viewCreatedSubtasks}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {mode.kind === 'edit' ? null : (
          <Text style={[localTaskStyles.hint, styles.gap]}>{copy.formHint}</Text>
        )}
      </ScrollView>
      <View style={[localTaskStyles.footerBar, { paddingBottom: insets.bottom + spacing.md }]}>
        {mode.kind === 'edit' ? (
          <View style={localTaskStyles.topBarSpacer} />
        ) : (
          <View style={styles.continueRow}>
            <MobileSwitch
              value={continueCreating}
              onValueChange={setContinueCreating}
              accessibilityLabel={copy.continueCreating}
            />
            <Text style={localTaskStyles.meta}>{copy.continueCreating}</Text>
          </View>
        )}
        <Pressable
          style={[localTaskStyles.primaryButton, !canSubmit && localTaskStyles.disabled]}
          disabled={!canSubmit}
          onPress={() => void submit.save(mode, draft).then((taskId) => taskId && finish(taskId))}
          accessibilityRole="button"
        >
          {submit.busy ? (
            <ActivityIndicator size="small" color={colors.bgBase} />
          ) : (
            <Check size={16} color={colors.bgBase} />
          )}
          <Text style={localTaskStyles.primaryButtonText}>
            {mode.kind === 'edit' ? copy.save : copy.create}
          </Text>
        </Pressable>
      </View>
      <LocalTaskDraftPickers
        open={picker}
        draft={draft}
        projects={library.projects}
        parentCandidates={parentCandidates}
        onPatch={patch}
        onClose={() => setPicker(null)}
      />
      {mode.kind === 'subtask' ? (
        <LocalTaskPasteChoice
          lines={props.readOnly ? null : pasted}
          parentTitle={mode.parent.title}
          onSubtasks={(lines) =>
            void submit
              .createSubtasks(mode.parent, lines, draft)
              .then((ok) => ok && finish(mode.parent.id))
          }
          onSingleTitle={(single) => patch({ title: single })}
          onClose={() => setPasted(null)}
        />
      ) : null}
      <LocalTaskFormPrompts
        notice={submit.notice}
        onLeaveNotice={leaveNotice}
        conflict={submit.conflict && !props.readOnly}
        onOverwrite={() => void submit.overwrite(draft).then((taskId) => taskId && finish(taskId))}
        onDiscard={() => {
          submit.discard()
          props.onClose()
        }}
        onKeepEditing={submit.discard}
      />
    </View>
  )
}

const TITLE_LINE_HEIGHT = 24

const styles = StyleSheet.create({
  cancel: { color: colors.textSecondary, fontSize: 14 },
  title: { lineHeight: TITLE_LINE_HEIGHT },
  topBarBalance: { width: 40 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm },
  contextChip: { alignSelf: 'flex-start', marginBottom: spacing.sm, maxWidth: '100%' },
  description: { minHeight: 60, lineHeight: 21, textAlignVertical: 'top' },
  labels: { flex: 1, lineHeight: 21 },
  gap: { marginTop: spacing.md },
  continueRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  partialActions: { gap: spacing.sm }
})
