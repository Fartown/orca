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
import { Check, ChevronLeft, FilePlus, Layers } from 'lucide-react-native'
import {
  LOCAL_TASK_PROJECT_NAME_MAX,
  normalizeLocalTaskPrefix
} from '../../../src/shared/local-tasks/local-task-model'
import { ConfirmModal } from '../components/ConfirmModal'
import { colors, spacing } from '../theme/mobile-theme'
import type { LocalTasksApi } from './local-tasks-api'
import { localTasksCopy } from './local-tasks-copy'
import { localTaskWriteMessage } from './local-task-failure-message'
import { createLocalTaskOperationIds, sendLocalTaskWrite } from './local-task-operation-ids'
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

/** What the new project starts from: one of the host's Orca projects, or nothing (REQ-001). */
type ProjectStart = { kind: 'repo'; choice: OrcaProjectChoice } | { kind: 'empty' }

/**
 * Recommends this host's Orca projects, one task project each, or an empty project that only tracks
 * tasks; nothing is created until the user confirms (REQ-001). Repos are added later in settings.
 */
export function LocalTasksProjectCreateView(props: Props) {
  const copy = localTasksCopy()
  const insets = useSafeAreaInsets()
  const [ids] = useState(() => createLocalTaskOperationIds())
  const [picked, setPicked] = useState<ProjectStart | null>(null)
  const [name, setName] = useState('')
  const [prefixText, setPrefixText] = useState('')
  const [prefixEdited, setPrefixEdited] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const prefix = normalizeLocalTaskPrefix(prefixText)
  // Why only a hint: one repo may serve several task projects (D-008).
  const linkedNames = (orcaProjectId: string) =>
    props.library.projects
      .filter((project) => project.repos.includes(orcaProjectId))
      .map((project) => project.name)

  const pick = (next: ProjectStart) => {
    setPicked(next)
    const displayName = next.kind === 'repo' ? next.choice.displayName : ''
    setName(displayName.slice(0, LOCAL_TASK_PROJECT_NAME_MAX))
    setPrefixText(displayName ? suggestLocalTaskPrefix(displayName, props.library.projects) : '')
    setPrefixEdited(false)
    setError(null)
  }

  const create = async () => {
    setConfirming(false)
    if (props.readOnly || !picked || !prefix) {
      return
    }
    setBusy(true)
    const outcome = await sendLocalTaskWrite(
      ids,
      {
        name: name.trim(),
        prefix,
        ...(picked.kind === 'repo' ? { repos: [picked.choice.id] } : {}),
        statusNames: copy.defaultStatusNames
      },
      props.api.createProject
    )
    setBusy(false)
    setError(localTaskWriteMessage(copy, outcome))
    props.library.reload(['projects'])
    if (outcome.kind === 'ok') {
      props.onCreated(outcome.value.project.id)
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
        <Pressable
          testID="local-tasks-new-empty-project"
          style={[localTaskStyles.card, localTaskStyles.cardRow, styles.gap]}
          onPress={() => pick({ kind: 'empty' })}
          accessibilityRole="radio"
          accessibilityState={{ selected: picked?.kind === 'empty' }}
        >
          <FilePlus size={16} color={colors.textSecondary} />
          <View style={styles.choiceText}>
            <Text style={localTaskStyles.body}>{copy.emptyProject}</Text>
            <Text style={localTaskStyles.meta} numberOfLines={1}>
              {copy.emptyProjectHint}
            </Text>
          </View>
          {picked?.kind === 'empty' ? <Check size={16} color={colors.textPrimary} /> : null}
        </Pressable>
        {props.orcaProjects.state === 'loading' ? (
          <ActivityIndicator color={colors.textSecondary} />
        ) : null}
        {props.orcaProjects.state === 'unavailable' ? (
          <Text style={[localTaskStyles.hint, styles.gap]}>{copy.orcaProjectsUnavailable}</Text>
        ) : null}
        {props.orcaProjects.state === 'ready' && props.orcaProjects.projects.length === 0 ? (
          <Text style={[localTaskStyles.hint, styles.gap]}>{copy.noOrcaProjects}</Text>
        ) : null}
        {props.orcaProjects.state === 'ready' && props.orcaProjects.projects.length > 0 ? (
          <View style={[localTaskStyles.card, styles.gap]}>
            {props.orcaProjects.projects.map((choice, index) => {
              const linked = linkedNames(choice.id)
              const selected = picked?.kind === 'repo' && picked.choice.id === choice.id
              return (
                <Pressable
                  key={choice.id}
                  style={[localTaskStyles.cardRow, index === 0 && localTaskStyles.cardRowFirst]}
                  onPress={() => pick({ kind: 'repo', choice })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Layers size={16} color={colors.textSecondary} />
                  <View style={styles.choiceText}>
                    <Text style={localTaskStyles.body}>{choice.displayName}</Text>
                    <Text style={localTaskStyles.meta} numberOfLines={1}>
                      {linked.length > 0
                        ? copy.orcaProjectLinked(linked.join('、'))
                        : choice.setupNames.join(' · ')}
                    </Text>
                  </View>
                  {selected ? <Check size={16} color={colors.textPrimary} /> : null}
                </Pressable>
              )
            })}
          </View>
        ) : null}
        {picked ? (
          <>
            <Text style={localTaskStyles.sectionLabel}>{copy.name}</Text>
            <TextInput
              style={localTaskStyles.input}
              value={name}
              maxLength={LOCAL_TASK_PROJECT_NAME_MAX}
              onChangeText={(next) => {
                setName(next)
                if (!prefixEdited && picked.kind === 'empty') {
                  setPrefixText(
                    next.trim() ? suggestLocalTaskPrefix(next, props.library.projects) : ''
                  )
                }
              }}
            />
            <Text style={localTaskStyles.sectionLabel}>{copy.prefix}</Text>
            <TextInput
              style={localTaskStyles.input}
              value={prefixText}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={10}
              onChangeText={(value) => {
                setPrefixEdited(true)
                setPrefixText(value.toUpperCase())
              }}
            />
            {prefix ? null : (
              <Text style={[localTaskStyles.errorText, styles.below]}>{copy.prefixInvalid}</Text>
            )}
            {error ? <Text style={[localTaskStyles.errorText, styles.below]}>{error}</Text> : null}
            <Pressable
              style={[
                localTaskStyles.primaryButton,
                styles.gap,
                (props.readOnly || !prefix || !name.trim() || busy) && localTaskStyles.disabled
              ]}
              disabled={props.readOnly || !prefix || !name.trim() || busy}
              onPress={() => setConfirming(true)}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator size="small" color={colors.bgBase} />
              ) : (
                <Check size={16} color={colors.bgBase} />
              )}
              <Text style={localTaskStyles.primaryButtonText}>{copy.create}</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
      <ConfirmModal
        visible={confirming}
        title={copy.confirmCreateProject(name.trim(), prefix ?? '')}
        message={copy.confirmCreateProjectMessage}
        confirmLabel={copy.create}
        cancelLabel={copy.cancel}
        onConfirm={() => void create()}
        onCancel={() => setConfirming(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  balance: { width: 60 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.xs },
  gap: { marginTop: spacing.md },
  below: { marginTop: spacing.xs },
  choiceText: { flex: 1, gap: 2 }
})
