import { useMemo, useRef, useState } from 'react'
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
import { Check, ChevronLeft, FilePlus, Square, SquareCheck } from 'lucide-react-native'
import {
  LOCAL_TASK_PROJECT_NAME_MAX,
  normalizeLocalTaskPrefix
} from '../../../src/shared/local-tasks/local-task-model'
import {
  suggestLocalTaskPrefix as suggestPrefix,
  takenLocalTaskPrefixes
} from '../../../src/shared/local-tasks/local-task-prefix-suggestion'
import { colors, spacing } from '../theme/mobile-theme'
import type { LocalTasksApi } from './local-tasks-api'
import { localTasksCopy } from './local-tasks-copy'
import { localTaskWriteMessage } from './local-task-failure-message'
import {
  createLocalTaskOperationIds,
  sendLocalTaskWrite,
  type LocalTaskOperationIds
} from './local-task-operation-ids'
import { localTaskStyles } from './local-tasks-styles'
import {
  suggestLocalTaskPrefix,
  type OrcaProjectChoice,
  type OrcaProjectChoices
} from './use-orca-project-choices'
import type { LocalTasksLibrary } from './use-local-tasks-library'

type Props = {
  library: LocalTasksLibrary
  api: LocalTasksApi
  orcaProjects: OrcaProjectChoices
  readOnly: boolean
  onBack: () => void
  onCreated: (projectId: string) => void
}

type RowState = { selected: boolean; prefix: string; error: string | null }

/** Each repository with a prefix of its own, none taken by the library or by a row above it. */
export function suggestLocalTaskProjectRows(
  choices: readonly OrcaProjectChoice[],
  projects: LocalTasksLibrary['projects']
): { choice: OrcaProjectChoice; prefix: string }[] {
  const taken = takenLocalTaskPrefixes(projects)
  return choices.map((choice) => {
    const prefix = suggestPrefix(choice.displayName, taken)
    taken.add(prefix)
    return { choice, prefix }
  })
}

/**
 * One task project per ticked repository, each with its own editable prefix, or an empty project
 * that only tracks tasks (REQ-001, as the desktop's "Create selected"). Nothing is created until the
 * user presses Create; each row's refusal is said on that row, and the rows that went through stay.
 */
export function LocalTasksProjectCreateView(props: Props) {
  const copy = localTasksCopy()
  const insets = useSafeAreaInsets()
  const choices = props.orcaProjects.state === 'ready' ? props.orcaProjects.projects : []
  // A row the user edited keeps its own prefix; the rest follow the projects as they are created.
  const suggestions = useMemo(
    () => suggestLocalTaskProjectRows(choices, props.library.projects),
    [choices, props.library.projects]
  )
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const rowIds = useRef(new Map<string, LocalTaskOperationIds>())
  const [emptyIds] = useState(() => createLocalTaskOperationIds())
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [prefixText, setPrefixText] = useState('')
  const [prefixEdited, setPrefixEdited] = useState(false)
  const [emptyError, setEmptyError] = useState<string | null>(null)
  const rowOf = (id: string, suggested: string): RowState =>
    rows[id] ?? { selected: false, prefix: suggested, error: null }
  const patchRow = (id: string, suggested: string, patch: Partial<RowState>) =>
    setRows((current) => ({ ...current, [id]: { ...rowOf(id, suggested), ...patch } }))
  const chosen = suggestions.filter(({ choice, prefix }) => rowOf(choice.id, prefix).selected)
  const emptyPrefix = normalizeLocalTaskPrefix(prefixText)
  // Why only a hint: one repository may serve several task projects (D-008).
  const linkedNames = (orcaProjectId: string) =>
    props.library.projects
      .filter((project) => project.repos.includes(orcaProjectId))
      .map((project) => project.name)

  const createSelected = async () => {
    if (props.readOnly || busy) {
      return
    }
    setBusy(true)
    let firstCreated: string | null = null
    let failed = false
    for (const { choice, prefix: suggested } of chosen) {
      const prefix = normalizeLocalTaskPrefix(rowOf(choice.id, suggested).prefix)
      if (!prefix) {
        failed = true
        patchRow(choice.id, suggested, { error: copy.prefixInvalid })
        continue
      }
      let ids = rowIds.current.get(choice.id)
      if (!ids) {
        ids = createLocalTaskOperationIds()
        rowIds.current.set(choice.id, ids)
      }
      const outcome = await sendLocalTaskWrite(
        ids,
        {
          name: choice.displayName.slice(0, LOCAL_TASK_PROJECT_NAME_MAX),
          prefix,
          repos: [choice.id],
          statusNames: copy.defaultStatusNames
        },
        props.api.createProject
      )
      if (outcome.kind === 'ok') {
        firstCreated ??= outcome.value.project.id
        patchRow(choice.id, suggested, { selected: false, error: null })
      } else {
        failed = true
        patchRow(choice.id, suggested, { error: localTaskWriteMessage(copy, outcome) })
      }
    }
    setBusy(false)
    props.library.reload(['projects'])
    if (firstCreated && !failed) {
      props.onCreated(firstCreated)
    } else if (firstCreated) {
      setCreatedId(firstCreated)
    }
  }

  const createEmpty = async () => {
    if (props.readOnly || busy || !emptyPrefix || !name.trim()) {
      return
    }
    setBusy(true)
    const outcome = await sendLocalTaskWrite(
      emptyIds,
      { name: name.trim(), prefix: emptyPrefix, statusNames: copy.defaultStatusNames },
      props.api.createProject
    )
    setBusy(false)
    setEmptyError(localTaskWriteMessage(copy, outcome))
    props.library.reload(['projects'])
    if (outcome.kind === 'ok') {
      props.onCreated(outcome.value.project.id)
    }
  }

  const canCreateEmpty = !props.readOnly && !busy && emptyPrefix !== null && name.trim() !== ''
  // Said only for what was typed: an empty field is what the disabled button is waiting for.
  const emptyHint = !name.trim()
    ? copy.nameRequired
    : prefixText && !emptyPrefix
      ? copy.prefixInvalid
      : null

  return (
    <View style={[localTaskStyles.screen, { paddingTop: insets.top }]}>
      <View style={localTaskStyles.topBar}>
        <Pressable
          style={localTaskStyles.backButton}
          onPress={props.onBack}
          accessibilityRole="button"
        >
          <ChevronLeft size={22} color={colors.textPrimary} />
          <Text style={localTaskStyles.backLabel}>{copy.back}</Text>
        </Pressable>
        <Text style={localTaskStyles.topBarTitle}>{copy.newProjectTitle}</Text>
        <View style={styles.balance} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={localTaskStyles.hint}>{copy.newProjectHint}</Text>
        {props.orcaProjects.state === 'loading' ? (
          <ActivityIndicator color={colors.textSecondary} />
        ) : null}
        {props.orcaProjects.state === 'unavailable' ? (
          <Text style={[localTaskStyles.hint, styles.gap]}>{copy.orcaProjectsUnavailable}</Text>
        ) : null}
        {props.orcaProjects.state === 'ready' && suggestions.length === 0 ? (
          <Text style={[localTaskStyles.hint, styles.gap]}>{copy.noOrcaProjects}</Text>
        ) : null}
        {suggestions.length > 0 ? (
          <>
            <View style={[localTaskStyles.card, styles.gap]}>
              {suggestions.map(({ choice, prefix: suggested }, index) => {
                const row = rowOf(choice.id, suggested)
                const linked = linkedNames(choice.id)
                const Box = row.selected ? SquareCheck : Square
                return (
                  <View
                    key={choice.id}
                    style={[styles.repoRow, index === 0 && localTaskStyles.cardRowFirst]}
                  >
                    <View style={styles.repoLine}>
                      <Pressable
                        testID={`local-tasks-new-project-${choice.id}`}
                        style={styles.repoPick}
                        disabled={props.readOnly || busy}
                        onPress={() =>
                          patchRow(choice.id, suggested, { selected: !row.selected, error: null })
                        }
                        accessibilityRole="checkbox"
                        accessibilityState={{
                          checked: row.selected,
                          disabled: props.readOnly || busy
                        }}
                        accessibilityLabel={choice.displayName}
                      >
                        <Box
                          size={18}
                          color={row.selected ? colors.textPrimary : colors.textSecondary}
                        />
                        <View style={styles.choiceText}>
                          <Text style={localTaskStyles.body} numberOfLines={1}>
                            {choice.displayName}
                          </Text>
                          <Text style={localTaskStyles.meta} numberOfLines={1}>
                            {linked.length > 0
                              ? copy.orcaProjectLinked(linked.join(', '))
                              : choice.setupNames.join(' · ')}
                          </Text>
                        </View>
                      </Pressable>
                      <TextInput
                        style={[localTaskStyles.input, styles.prefixInput]}
                        value={row.prefix}
                        editable={!props.readOnly && !busy}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        maxLength={10}
                        accessibilityLabel={copy.prefixFor(choice.displayName)}
                        onChangeText={(value) =>
                          patchRow(choice.id, suggested, {
                            prefix: value.toUpperCase(),
                            error: null
                          })
                        }
                      />
                    </View>
                    {row.error ? (
                      <Text style={[localTaskStyles.errorText, styles.rowError]}>{row.error}</Text>
                    ) : null}
                  </View>
                )
              })}
            </View>
            <View style={styles.actions}>
              {createdId ? (
                <Pressable
                  style={localTaskStyles.secondaryButton}
                  disabled={busy}
                  onPress={() => props.onCreated(createdId)}
                  accessibilityRole="button"
                >
                  <Text style={localTaskStyles.secondaryButtonText}>
                    {copy.continueWithCreated}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                testID="local-tasks-create-selected"
                style={[
                  localTaskStyles.primaryButton,
                  (props.readOnly || busy || chosen.length === 0) && localTaskStyles.disabled
                ]}
                disabled={props.readOnly || busy || chosen.length === 0}
                onPress={() => void createSelected()}
                accessibilityRole="button"
              >
                {busy ? (
                  <ActivityIndicator size="small" color={colors.bgBase} />
                ) : (
                  <Check size={16} color={colors.bgBase} />
                )}
                <Text style={localTaskStyles.primaryButtonText}>
                  {copy.createSelected(chosen.length)}
                </Text>
              </Pressable>
            </View>
          </>
        ) : null}
        <Text style={localTaskStyles.sectionLabel}>{copy.emptyProjectTitle}</Text>
        <View style={styles.emptyHead}>
          <FilePlus size={16} color={colors.textSecondary} />
          <Text style={localTaskStyles.meta}>{copy.emptyProjectHint}</Text>
        </View>
        <Text style={localTaskStyles.sectionLabel}>{copy.name}</Text>
        <TextInput
          testID="local-tasks-new-empty-project"
          style={localTaskStyles.input}
          value={name}
          maxLength={LOCAL_TASK_PROJECT_NAME_MAX}
          editable={!props.readOnly && !busy}
          onChangeText={(next) => {
            setName(next)
            setEmptyError(null)
            if (!prefixEdited) {
              setPrefixText(next.trim() ? suggestLocalTaskPrefix(next, props.library.projects) : '')
            }
          }}
        />
        <Text style={localTaskStyles.sectionLabel}>{copy.prefix}</Text>
        <TextInput
          style={localTaskStyles.input}
          value={prefixText}
          editable={!props.readOnly && !busy}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={10}
          onChangeText={(value) => {
            setPrefixEdited(true)
            setEmptyError(null)
            setPrefixText(value.toUpperCase())
          }}
        />
        {emptyHint ? (
          <Text
            style={[
              emptyHint === copy.nameRequired ? localTaskStyles.hint : localTaskStyles.errorText,
              styles.below
            ]}
          >
            {emptyHint}
          </Text>
        ) : null}
        {emptyError ? (
          <Text style={[localTaskStyles.errorText, styles.below]}>{emptyError}</Text>
        ) : null}
        <Pressable
          style={[
            localTaskStyles.secondaryButton,
            styles.gap,
            !canCreateEmpty && localTaskStyles.disabled
          ]}
          disabled={!canCreateEmpty}
          onPress={() => void createEmpty()}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canCreateEmpty }}
        >
          <Text style={localTaskStyles.secondaryButtonText}>{copy.createEmptyProject}</Text>
        </Pressable>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  balance: { width: 60 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.xs },
  gap: { marginTop: spacing.md },
  below: { marginTop: spacing.xs },
  repoRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    gap: 4
  },
  repoLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  repoPick: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  prefixInput: { width: 96 },
  rowError: { paddingLeft: 26 },
  choiceText: { flex: 1, gap: 2 },
  // Why wrap: two long labels overflow a 320–390pt row and push the first button off-screen.
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.md
  },
  emptyHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }
})
