import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Check, GitBranch, Plus } from 'lucide-react-native'
import { LOCAL_TASK_PROJECT_REPOS_MAX } from '../../../src/shared/local-tasks/local-task-model'
import { localTaskReposPatch } from '../../../src/shared/local-tasks/local-task-repos-patch'
import type { LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import { ActionSheetContent, ActionSheetModal } from '../components/ActionSheetModal'
import { BottomDrawer } from '../components/BottomDrawer'
import { PickerListDrawer } from '../components/PickerListDrawer'
import { colors, spacing } from '../theme/mobile-theme'
import type { LocalTasksApi } from './local-tasks-api'
import { localTasksCopy } from './local-tasks-copy'
import { localTaskWriteMessage } from './local-task-failure-message'
import { createLocalTaskOperationIds, sendLocalTaskWrite } from './local-task-operation-ids'
import { localTaskStyles } from './local-tasks-styles'
import type { OrcaProjectChoices } from './use-orca-project-choices'

/** A project's Orca repos (REQ-001): none, one or several, one of them the default for Start. */
export function LocalTaskReposSection(props: {
  project: LocalTaskProject
  api: LocalTasksApi
  orcaProjects: OrcaProjectChoices
  readOnly: boolean
  onChanged: () => void
}) {
  const copy = localTasksCopy()
  const { project } = props
  const [ids] = useState(() => createLocalTaskOperationIds())
  const [adding, setAdding] = useState(false)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const choices = props.orcaProjects.state === 'ready' ? props.orcaProjects.projects : []
  // Never the raw id: unread names and repositories removed from Orca each say so (REQ-017).
  const nameOf = (repoId: string) =>
    choices.find((choice) => choice.id === repoId)?.displayName ??
    (props.orcaProjects.state === 'ready' ? copy.repoNotInOrca : copy.repoNameUnread)
  const addable = choices.filter((choice) => !project.repos.includes(choice.id))

  const edit = async (kind: 'add' | 'remove' | 'default', repoId: string) => {
    const patch = localTaskReposPatch(project, { kind, repoId })
    if (!patch) {
      return
    }
    const outcome = await sendLocalTaskWrite(
      ids,
      { projectId: project.id, expectedRevision: project.revision, ...patch },
      props.api.updateProject
    )
    setError(localTaskWriteMessage(copy, outcome))
    props.onChanged()
  }

  return (
    <>
      <Text style={localTaskStyles.sectionLabel}>{copy.reposSection}</Text>
      {project.repos.length > 0 ? (
        <View style={localTaskStyles.card}>
          {project.repos.map((repoId, index) => (
            <Pressable
              key={repoId}
              testID={`local-task-repo-${repoId}`}
              style={[localTaskStyles.cardRow, index === 0 && localTaskStyles.cardRowFirst]}
              disabled={props.readOnly}
              onPress={() => setMenuFor(repoId)}
              accessibilityRole="button"
            >
              <GitBranch size={16} color={colors.textSecondary} />
              <Text style={[localTaskStyles.rowValue, styles.grow]} numberOfLines={1}>
                {nameOf(repoId)}
              </Text>
              {repoId === project.defaultRepoId ? (
                <View style={styles.defaultBadge}>
                  <Check size={12} color={colors.textSecondary} />
                  <Text style={localTaskStyles.meta}>{copy.defaultRepo}</Text>
                </View>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={localTaskStyles.hint}>{copy.noReposHint}</Text>
      )}
      {props.readOnly ? null : project.repos.length >= LOCAL_TASK_PROJECT_REPOS_MAX ? (
        <Text style={[localTaskStyles.hint, styles.below]}>
          {copy.reposAtLimit(LOCAL_TASK_PROJECT_REPOS_MAX)}
        </Text>
      ) : (
        <Pressable
          style={[
            localTaskStyles.secondaryButton,
            styles.add,
            props.orcaProjects.state !== 'ready' && localTaskStyles.disabled
          ]}
          disabled={props.orcaProjects.state !== 'ready'}
          onPress={() => setAdding(true)}
          accessibilityRole="button"
          accessibilityState={{ disabled: props.orcaProjects.state !== 'ready' }}
        >
          <Plus size={16} color={colors.textPrimary} />
          <Text style={localTaskStyles.secondaryButtonText}>{copy.addRepo}</Text>
        </Pressable>
      )}
      {props.orcaProjects.state === 'unavailable' ? (
        <Text style={[localTaskStyles.hint, styles.below]}>{copy.orcaProjectsUnavailable}</Text>
      ) : null}
      {error ? <Text style={[localTaskStyles.errorText, styles.below]}>{error}</Text> : null}
      <ActionSheetModal
        visible={menuFor !== null}
        title={menuFor ? nameOf(menuFor) : undefined}
        actions={[
          ...(menuFor && menuFor !== project.defaultRepoId
            ? [{ label: copy.makeDefaultRepo, onPress: () => void edit('default', menuFor) }]
            : []),
          {
            label: copy.removeRepo,
            destructive: true,
            onPress: () => menuFor && void edit('remove', menuFor)
          }
        ]}
        onClose={() => setMenuFor(null)}
      />
      <PickerListDrawer
        visible={adding && addable.length > 0}
        title={copy.addRepo}
        items={addable.map((choice) => ({
          id: choice.id,
          label: choice.displayName,
          detail: choice.setupNames.join(' · ')
        }))}
        selectedId=""
        onSelect={(item) => void edit('add', item.id)}
        onClose={() => setAdding(false)}
      />
      {/* Every repo is already in the project, or the host has none: say so, not an empty box. */}
      <BottomDrawer visible={adding && addable.length === 0} onClose={() => setAdding(false)}>
        <ActionSheetContent title={copy.addRepo} actions={[]}>
          <View style={styles.emptyChoices}>
            <Text style={localTaskStyles.hint}>{copy.noRepoCandidates}</Text>
          </View>
        </ActionSheetContent>
      </BottomDrawer>
    </>
  )
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  defaultBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  add: { marginTop: spacing.sm },
  below: { marginTop: spacing.sm },
  emptyChoices: {
    backgroundColor: colors.bgPanel,
    borderRadius: 12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md + 2
  }
})
