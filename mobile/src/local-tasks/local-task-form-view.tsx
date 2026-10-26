import { useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Check, ChevronDown, CornerDownRight, Layers } from 'lucide-react-native'
import {
  LOCAL_TASK_DESCRIPTION_MAX,
  LOCAL_TASK_TITLE_MAX
} from '../../../src/shared/local-tasks/local-task-model'
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
import { localTaskStatusLookup } from './local-task-list-projection'
import { LocalTaskDraftPickers, type LocalTaskDraftPicker } from './local-task-pickers'
import { localTaskStyles } from './local-tasks-styles'
import { LocalTaskPriorityIcon, LocalTaskStatusIcon } from './local-tasks-visuals'
import { useLocalTaskFormSubmit } from './use-local-task-form-submit'
import type { LocalTasksLibrary } from './use-local-tasks-library'

type Props = {
  library: LocalTasksLibrary
  api: LocalTasksApi
  mode: LocalTaskFormMode
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
  const editing = mode.kind === 'edit' ? mode.task : null
  const hasChildren = editing ? library.tasks.some((task) => task.parentId === editing.id) : false
  const parentCandidates = library.tasks.filter(
    (task) =>
      task.projectId === draft.projectId && task.parentId === null && task.id !== editing?.id
  )
  const parent = draft.parentId
    ? (library.tasks.find((task) => task.id === draft.parentId) ?? null)
    : null
  const title =
    mode.kind === 'edit' ? copy.editTask : mode.kind === 'subtask' ? copy.newSubtask : copy.newTask
  const canSubmit = draft.title.trim().length > 0 && !submit.busy

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
            style={[
              localTaskStyles.chip,
              styles.contextChip,
              editing?.parentId ? localTaskStyles.disabled : null
            ]}
            disabled={Boolean(editing?.parentId)}
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
        <TextInput
          style={localTaskStyles.titleInput}
          value={draft.title}
          multiline
          autoFocus={mode.kind !== 'edit'}
          maxLength={LOCAL_TASK_TITLE_MAX * 20}
          placeholder={copy.titlePlaceholder}
          placeholderTextColor={colors.textMuted}
          onChangeText={(next) => {
            if (mode.kind === 'subtask' && isMultiLinePaste(draft.title, next)) {
              setPasted(splitPastedLines(next))
              return
            }
            patch({ title: next.replace(/\r?\n/g, ' ') })
          }}
        />
        {mode.kind === 'subtask' ? null : (
          <TextInput
            style={[localTaskStyles.bareInput, styles.description]}
            value={draft.description}
            multiline
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
            {status ? (
              <LocalTaskStatusIcon category={status.category} color={status.color} size={14} />
            ) : null}
            <Text style={status ? localTaskStyles.rowValue : localTaskStyles.rowValueMuted}>
              {status?.name ?? copy.defaultStatusNames.unstarted}
            </Text>
          </LocalTaskPropertyRow>
          <LocalTaskPropertyRow label={copy.priority} onPress={() => setPicker('priority')}>
            <LocalTaskPriorityIcon priority={draft.priority} />
            <Text style={localTaskStyles.rowValue}>{copy.priorities[draft.priority]}</Text>
          </LocalTaskPropertyRow>
          <LocalTaskPropertyRow label={copy.labels}>
            <TextInput
              style={[localTaskStyles.bareInput, styles.labels]}
              value={draft.labelsText}
              onChangeText={(labelsText) => patch({ labelsText })}
              placeholder={copy.labelsPlaceholder}
              placeholderTextColor={colors.textMuted}
            />
          </LocalTaskPropertyRow>
          {mode.kind === 'subtask' ? null : (
            <LocalTaskPropertyRow
              label={copy.parent}
              disabled={hasChildren}
              onPress={() => setPicker('parent')}
            >
              <Text
                style={parent ? localTaskStyles.rowValue : localTaskStyles.rowValueMuted}
                numberOfLines={1}
              >
                {parent ? `${parent.ref} ${parent.title}` : copy.none}
              </Text>
            </LocalTaskPropertyRow>
          )}
        </View>
        {submit.error ? (
          <Text style={[localTaskStyles.errorText, styles.gap]}>{submit.error}</Text>
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
          lines={pasted}
          parentRef={mode.parent.ref}
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
        conflict={submit.conflict}
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

const styles = StyleSheet.create({
  cancel: { color: colors.textSecondary, fontSize: 14 },
  topBarBalance: { width: 40 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm },
  contextChip: { alignSelf: 'flex-start', marginBottom: spacing.sm, maxWidth: '100%' },
  description: { minHeight: 60, lineHeight: 21, textAlignVertical: 'top' },
  labels: { flex: 1 },
  gap: { marginTop: spacing.md },
  continueRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }
})
