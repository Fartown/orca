import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Check,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Info,
  Layers,
  Play
} from 'lucide-react-native'
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
import type { LocalTaskSite } from './local-task-endpoint'
import { localTaskCreateCopy } from './local-task-create-copy'
import {
  LocalTaskCreateKickoffSection,
  localTaskCreatePlanLine
} from './local-task-create-kickoff-section'
import {
  LocalTaskCreateStepHeading,
  LocalTaskCreateWhereSection
} from './local-task-create-where-section'
import {
  LocalTaskFormPrompts,
  LocalTaskPasteChoice,
  LocalTaskPropertiesCard,
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
import { LocalTaskGrowingInput } from './local-task-growing-input'
import { LocalTaskDraftPickers, type LocalTaskDraftPicker } from './local-task-pickers'
import { localTaskStyles } from './local-tasks-styles'
import { useLocalTaskCreateWhere } from './use-local-task-create-where'
import { useLocalTaskFormSubmit } from './use-local-task-form-submit'
import type { LocalTasksLibrary } from './use-local-tasks-library'

type Props = {
  library: LocalTasksLibrary
  api: LocalTasksApi
  mode: LocalTaskFormMode
  readOnly: boolean
  /** The library's host and its routes, for where a new task is worked on and its first session. */
  site?: LocalTaskSite
  onNavigate?: (href: string) => void
  onClose: () => void
  /** The task the form created or saved, which the caller then shows. */
  onDone: (taskId: string) => void
}

export function LocalTaskFormView(props: Props) {
  const copy = localTasksCopy()
  const create = localTaskCreateCopy()
  const insets = useSafeAreaInsets()
  const { library, mode } = props
  const creating = mode.kind === 'create'
  const [draft, setDraft] = useState<LocalTaskDraft>(() => initialLocalTaskDraft(mode))
  const [picker, setPicker] = useState<LocalTaskDraftPicker | null>(null)
  const [continueCreating, setContinueCreating] = useState(false)
  const [pasted, setPasted] = useState<string[] | null>(null)
  // A new task opens on its three steps (m8); its properties stay one tap away.
  const [propertiesOpen, setPropertiesOpen] = useState(!creating)
  const submit = useLocalTaskFormSubmit(props.api, library)
  const patch = (next: Partial<LocalTaskDraft>) =>
    setDraft((previous) => ({ ...previous, ...next }))
  const where = useLocalTaskCreateWhere({
    active: creating && !props.readOnly,
    site: props.site,
    api: props.api,
    library,
    openedProjectId: mode.kind === 'create' ? mode.projectId : draft.projectId,
    draft,
    patch
  })
  // Why only for 稍后再定: a task that starts work opens on its detail, as the desktop does.
  const keepCreating = continueCreating && (!creating || where.where === 'later')

  const project = library.projects.find((entry) => entry.id === draft.projectId) ?? null
  const editing = mode.kind === 'edit' ? mode.task : null
  const parentCandidates = localTaskParentCandidates(
    editing,
    draft.projectId,
    library.tasks,
    buildLocalTaskIndex([], library.tasks)
  )
  const title =
    mode.kind === 'edit' ? copy.editTask : mode.kind === 'subtask' ? copy.newSubtask : copy.newTask
  const canSubmit =
    !props.readOnly &&
    draft.title.trim().length > 0 &&
    !submit.busy &&
    !submit.subtaskRetryPending &&
    (!creating || where.planReady)
  const primaryLabel =
    mode.kind === 'edit'
      ? copy.save
      : creating && where.startsSession
        ? create.createAndStart
        : copy.create
  // Why not read-only: a library that takes no writes has nowhere to start work either.
  const steps = creating && !props.readOnly
  const planLine = steps ? localTaskCreatePlanLine(where.plan, create) : null

  const leaveNotice = () => {
    const taskId = submit.dismissNotice()
    if (taskId) {
      props.onDone(taskId)
    }
  }
  const finish = (taskId: string) => {
    if (mode.kind !== 'edit' && keepCreating) {
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
          <>
            {creating ? <LocalTaskCreateStepHeading step={1} title={create.stepTask} /> : null}
            <View style={styles.chipRow}>
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
              {creating && where.projectFollows ? (
                <Text style={[localTaskStyles.meta, styles.flex]} numberOfLines={1}>
                  {create.projectFollows}
                </Text>
              ) : null}
            </View>
          </>
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
        {creating ? (
          <Pressable
            style={({ pressed }) => [styles.toggle, pressed && localTaskStyles.pressed]}
            onPress={() => setPropertiesOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityState={{ expanded: propertiesOpen }}
          >
            {propertiesOpen ? (
              <ChevronDown size={14} color={colors.textMuted} />
            ) : (
              <ChevronRight size={14} color={colors.textMuted} />
            )}
            <Text style={localTaskStyles.sectionActionText}>{create.moreProperties}</Text>
          </Pressable>
        ) : null}
        {creating && propertiesOpen ? (
          <LocalTaskSubtaskEntries
            entries={draft.subtasks}
            onChange={(subtasks) => patch({ subtasks })}
          />
        ) : null}
        {propertiesOpen ? (
          <Text style={localTaskStyles.sectionLabel}>{copy.properties}</Text>
        ) : null}
        <LocalTaskPropertiesCard
          draft={draft}
          projects={library.projects}
          tasks={library.tasks}
          showParent={mode.kind !== 'subtask'}
          hidden={!propertiesOpen}
          onPick={setPicker}
          onPatch={patch}
        />
        {steps ? (
          <>
            <LocalTaskCreateWhereSection state={where} />
            <LocalTaskCreateKickoffSection state={where} />
          </>
        ) : null}
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
        {mode.kind === 'subtask' ? (
          <Text style={[localTaskStyles.hint, styles.gap]}>{copy.formHint}</Text>
        ) : null}
      </ScrollView>
      <View
        style={[
          localTaskStyles.footerBar,
          styles.footer,
          { paddingBottom: insets.bottom + spacing.md }
        ]}
      >
        {planLine ? (
          <View style={styles.planLine}>
            <Info size={14} color={colors.textMuted} />
            <Text style={[localTaskStyles.meta, styles.flex]} numberOfLines={2}>
              {planLine}
            </Text>
          </View>
        ) : null}
        <View style={styles.footerRow}>
          {mode.kind === 'edit' ? (
            <View style={localTaskStyles.topBarSpacer} />
          ) : !creating || where.where === 'later' ? (
            <View style={styles.continueRow}>
              <MobileSwitch
                value={continueCreating}
                onValueChange={setContinueCreating}
                accessibilityLabel={copy.continueCreating}
              />
              <Text style={localTaskStyles.meta}>{copy.continueCreating}</Text>
            </View>
          ) : null}
          <Pressable
            style={[
              localTaskStyles.primaryButton,
              creating && where.where !== 'later' && styles.flex,
              !canSubmit && localTaskStyles.disabled
            ]}
            disabled={!canSubmit}
            onPress={() =>
              void submit
                .save(mode, draft, creating ? where.kickoff : null)
                .then((taskId) => taskId && finish(taskId))
            }
            accessibilityRole="button"
            accessibilityLabel={primaryLabel}
            accessibilityHint={planLine ?? undefined}
          >
            {submit.busy ? (
              <ActivityIndicator size="small" color={colors.bgBase} />
            ) : creating && where.startsSession ? (
              <Play size={16} color={colors.bgBase} />
            ) : (
              <Check size={16} color={colors.bgBase} />
            )}
            <Text style={localTaskStyles.primaryButtonText}>{primaryLabel}</Text>
          </Pressable>
        </View>
      </View>
      <LocalTaskDraftPickers
        open={picker}
        draft={draft}
        projects={library.projects}
        parentCandidates={parentCandidates}
        onPatch={(next) => {
          where.draftChanged(next)
          patch(next)
        }}
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
  contextChip: { alignSelf: 'flex-start', maxWidth: '100%' },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm
  },
  flex: { flex: 1 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  footer: { flexDirection: 'column', alignItems: 'stretch', gap: spacing.sm },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  planLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  description: { minHeight: 60, lineHeight: 21, textAlignVertical: 'top' },
  gap: { marginTop: spacing.md },
  continueRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  partialActions: { gap: spacing.sm }
})
