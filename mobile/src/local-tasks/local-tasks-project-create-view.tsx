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
import { Check, ChevronLeft, Layers } from 'lucide-react-native'
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
  onBack: () => void
  onCreated: (projectId: string) => void
}

/** Recommends Orca projects; nothing is created until the user confirms (REQ-001). */
export function LocalTasksProjectCreateView(props: Props) {
  const copy = localTasksCopy()
  const insets = useSafeAreaInsets()
  const [ids] = useState(() => createLocalTaskOperationIds())
  const [picked, setPicked] = useState<OrcaProjectChoice | null>(null)
  const [name, setName] = useState('')
  const [prefixText, setPrefixText] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const prefix = normalizeLocalTaskPrefix(prefixText)
  const linkedName = (orcaProjectId: string) =>
    props.library.projects.find((project) => project.orcaProjectId === orcaProjectId)?.name

  const pick = (choice: OrcaProjectChoice) => {
    setPicked(choice)
    setName(choice.displayName.slice(0, LOCAL_TASK_PROJECT_NAME_MAX))
    setPrefixText(suggestLocalTaskPrefix(choice.displayName, props.library.projects))
    setError(null)
  }

  const create = async () => {
    setConfirming(false)
    if (!picked || !prefix) {
      return
    }
    setBusy(true)
    const outcome = await sendLocalTaskWrite(
      ids,
      {
        name: name.trim(),
        prefix,
        orcaProjectId: picked.id,
        defaultRepoId: picked.defaultRepoId,
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
              const linked = linkedName(choice.id)
              const selected = picked?.id === choice.id
              return (
                <Pressable
                  key={choice.id}
                  style={[
                    localTaskStyles.cardRow,
                    index === 0 && localTaskStyles.cardRowFirst,
                    linked !== undefined && localTaskStyles.disabled
                  ]}
                  disabled={linked !== undefined}
                  onPress={() => pick(choice)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, disabled: linked !== undefined }}
                >
                  <Layers size={16} color={colors.textSecondary} />
                  <View style={styles.choiceText}>
                    <Text style={localTaskStyles.body}>{choice.displayName}</Text>
                    <Text style={localTaskStyles.meta} numberOfLines={1}>
                      {linked !== undefined
                        ? copy.orcaProjectLinked(linked)
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
              onChangeText={setName}
            />
            <Text style={localTaskStyles.sectionLabel}>{copy.prefix}</Text>
            <TextInput
              style={localTaskStyles.input}
              value={prefixText}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={10}
              onChangeText={(value) => setPrefixText(value.toUpperCase())}
            />
            {prefix ? null : (
              <Text style={[localTaskStyles.errorText, styles.below]}>{copy.prefixInvalid}</Text>
            )}
            {error ? <Text style={[localTaskStyles.errorText, styles.below]}>{error}</Text> : null}
            <Pressable
              style={[
                localTaskStyles.primaryButton,
                styles.gap,
                (!prefix || !name.trim() || busy) && localTaskStyles.disabled
              ]}
              disabled={!prefix || !name.trim() || busy}
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
