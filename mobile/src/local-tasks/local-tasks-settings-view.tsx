import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft, ChevronRight, Layers, Plus, Trash2 } from 'lucide-react-native'
import { normalizeLocalTaskPrefix } from '../../../src/shared/local-tasks/local-task-model'
import type { LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import { ConfirmModal } from '../components/ConfirmModal'
import { TextInputModal } from '../components/TextInputModal'
import { colors, spacing } from '../theme/mobile-theme'
import type { LocalTasksApi } from './local-tasks-api'
import { localTasksCopy } from './local-tasks-copy'
import { localTaskWriteMessage } from './local-task-failure-message'
import { LocalTaskFormPrompts, LocalTaskPropertyRow } from './local-task-form-fields'
import { createLocalTaskOperationIds, sendLocalTaskWrite } from './local-task-operation-ids'
import { LocalTasksStatusSection } from './local-tasks-status-section'
import { LocalTaskReposSection } from './local-task-repos-section'
import { LocalTaskRulesSection } from './local-task-rules-section'
import { localTaskStyles } from './local-tasks-styles'
import type { OrcaProjectChoices } from './use-orca-project-choices'
import type { LocalTasksLibrary } from './use-local-tasks-library'

type Props = {
  library: LocalTasksLibrary
  api: LocalTasksApi
  orcaProjects: OrcaProjectChoices
  /** Null lists every project; a project id opens that project's settings. */
  projectId: string | null
  readOnly: boolean
  onBack: () => void
  onOpenProject: (projectId: string) => void
  onCreateProject: () => void
  onDeletedProject: () => void
}

type ProjectPatch = { name?: string; prefix?: string }
type ProjectField = 'name' | 'prefix'

export function LocalTasksSettingsView(props: Props) {
  const copy = localTasksCopy()
  const insets = useSafeAreaInsets()
  const project = props.projectId
    ? (props.library.projects.find((entry) => entry.id === props.projectId) ?? null)
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
          <Text style={localTaskStyles.backLabel}>{copy.title}</Text>
        </Pressable>
        <Text style={localTaskStyles.topBarTitle} numberOfLines={1}>
          {project?.name ?? copy.settingsTitle}
        </Text>
        <View style={styles.balance} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      >
        {project ? (
          <LocalTaskProjectSettings {...props} project={project} />
        ) : (
          <>
            <Text style={localTaskStyles.sectionLabel}>{copy.projectSection}</Text>
            {props.library.projects.length > 0 ? (
              <View style={localTaskStyles.card}>
                {props.library.projects.map((entry, index) => (
                  <Pressable
                    key={entry.id}
                    style={[localTaskStyles.cardRow, index === 0 && localTaskStyles.cardRowFirst]}
                    onPress={() => props.onOpenProject(entry.id)}
                    accessibilityRole="button"
                  >
                    <Layers size={16} color={colors.textSecondary} />
                    <Text style={localTaskStyles.rowValue}>{entry.name}</Text>
                    <Text style={localTaskStyles.mono}>{entry.prefix}</Text>
                    <ChevronRight size={16} color={colors.textMuted} />
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={localTaskStyles.hint}>{copy.noProjectsHint}</Text>
            )}
            {props.readOnly ? null : (
              <Pressable
                style={[localTaskStyles.secondaryButton, styles.create]}
                onPress={props.onCreateProject}
              >
                <Plus size={16} color={colors.textPrimary} />
                <Text style={localTaskStyles.secondaryButtonText}>{copy.createProject}</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </View>
  )
}

function LocalTaskProjectSettings(props: Props & { project: LocalTaskProject }) {
  const copy = localTasksCopy()
  const { project } = props
  const [ids] = useState(() => ({
    update: createLocalTaskOperationIds(),
    remove: createLocalTaskOperationIds()
  }))
  // Why captured on open: a push while the field is open must neither reset what the user is
  // typing nor move the revision the edit is checked against.
  const [editing, setEditing] = useState<{
    field: ProjectField
    initial: string
    value: string
    revision: number
  } | null>(null)
  const [pendingPrefix, setPendingPrefix] = useState<{ prefix: string; revision: number } | null>(
    null
  )
  const [conflict, setConflict] = useState<{ field: ProjectField; value: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busyDelete, setBusyDelete] = useState(false)
  const projectTaskCount = props.library.tasks.filter(
    (task) => task.projectId === project.id
  ).length
  const taskCounts = new Map<string, number>()
  for (const task of props.library.tasks) {
    taskCounts.set(task.statusId, (taskCounts.get(task.statusId) ?? 0) + 1)
  }

  const update = async (field: ProjectField, value: string, expectedRevision: number) => {
    const patch: ProjectPatch = field === 'name' ? { name: value } : { prefix: value }
    const outcome = await sendLocalTaskWrite(
      ids.update,
      { projectId: project.id, expectedRevision, ...patch },
      props.api.updateProject
    )
    const stale = outcome.kind === 'refused' && outcome.code === 'stale'
    setConflict(stale ? { field, value } : null)
    setError(stale ? null : localTaskWriteMessage(copy, outcome))
    props.library.reload(['projects', 'tasks'])
  }
  const open = (field: ProjectField, value?: string) => {
    const initial = field === 'name' ? project.name : project.prefix
    setEditing({ field, initial, value: value ?? initial, revision: project.revision })
  }

  const remove = async () => {
    if (props.readOnly || busyDelete) {
      return
    }
    setBusyDelete(true)
    const outcome = await sendLocalTaskWrite(
      ids.remove,
      { projectId: project.id },
      props.api.removeProject
    )
    setBusyDelete(false)
    setError(localTaskWriteMessage(copy, outcome))
    props.library.reload(['projects', 'tasks'])
    if (outcome.kind === 'ok') {
      props.onDeletedProject()
    }
  }

  return (
    <>
      <Text style={localTaskStyles.sectionLabel}>{copy.projectSection}</Text>
      <View style={localTaskStyles.card}>
        <LocalTaskPropertyRow
          label={copy.name}
          first
          disabled={props.readOnly}
          onPress={() => open('name')}
        >
          <Text style={localTaskStyles.rowValue}>{project.name}</Text>
        </LocalTaskPropertyRow>
        <LocalTaskPropertyRow
          label={copy.prefix}
          disabled={props.readOnly}
          onPress={() => open('prefix')}
        >
          <Text style={localTaskStyles.mono}>{project.prefix}</Text>
        </LocalTaskPropertyRow>
      </View>
      <Text style={[localTaskStyles.hint, styles.below]}>
        {copy.prefixHint(project.aliases.join('、'))}
      </Text>
      {error ? <Text style={[localTaskStyles.errorText, styles.below]}>{error}</Text> : null}
      <LocalTaskReposSection
        project={project}
        api={props.api}
        orcaProjects={props.orcaProjects}
        readOnly={props.readOnly}
        onChanged={() => props.library.reload(['projects'])}
      />
      <LocalTasksStatusSection
        api={props.api}
        project={project}
        taskCounts={taskCounts}
        readOnly={props.readOnly}
        onChanged={() => props.library.reload(['projects', 'tasks'])}
      />
      <LocalTaskRulesSection
        project={project}
        api={props.api}
        readOnly={props.readOnly}
        onChanged={() => props.library.reload(['projects'])}
      />
      <Pressable
        style={[
          localTaskStyles.secondaryButton,
          styles.create,
          (props.readOnly || busyDelete) && localTaskStyles.disabled
        ]}
        disabled={props.readOnly || busyDelete}
        onPress={() => setConfirmDelete(true)}
        accessibilityRole="button"
      >
        <Trash2 size={16} color={colors.statusRed} />
        <Text style={localTaskStyles.secondaryButtonText}>{copy.deleteProject}</Text>
      </Pressable>
      <ConfirmModal
        visible={confirmDelete}
        title={copy.deleteProjectTitle(project.name)}
        message={copy.deleteProjectMessage(projectTaskCount)}
        confirmLabel={copy.confirmDeleteProject}
        cancelLabel={copy.cancel}
        destructive
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
      <TextInputModal
        visible={editing !== null}
        title={editing?.field === 'prefix' ? copy.changePrefix : copy.renameProject}
        message={
          editing?.field === 'prefix' ? copy.prefixHint(project.aliases.join('、')) : undefined
        }
        defaultValue={editing?.value ?? ''}
        submitLabel={copy.save}
        onSubmit={(value) => {
          const opened = editing
          setEditing(null)
          if (!opened || value === opened.initial) {
            return
          }
          if (opened.field === 'name') {
            void update('name', value, opened.revision)
            return
          }
          const prefix = normalizeLocalTaskPrefix(value)
          if (!prefix) {
            setError(copy.prefixInvalid)
          } else if (prefix !== opened.initial) {
            setPendingPrefix({ prefix, revision: opened.revision })
          }
        }}
        onCancel={() => setEditing(null)}
      />
      <ConfirmModal
        visible={pendingPrefix !== null}
        title={copy.changePrefix}
        message={copy.changePrefixConfirm(project.prefix, pendingPrefix?.prefix ?? '')}
        confirmLabel={copy.save}
        cancelLabel={copy.cancel}
        onConfirm={() => {
          const pending = pendingPrefix
          setPendingPrefix(null)
          if (pending) {
            void update('prefix', pending.prefix, pending.revision)
          }
        }}
        onCancel={() => setPendingPrefix(null)}
      />
      <LocalTaskFormPrompts
        notice={null}
        onLeaveNotice={() => {}}
        conflict={conflict !== null}
        onOverwrite={() =>
          conflict && void update(conflict.field, conflict.value, project.revision)
        }
        onDiscard={() => setConflict(null)}
        // Why reopen: closing the sheet must not lose what the user typed.
        onKeepEditing={() => {
          if (conflict) {
            open(conflict.field, conflict.value)
          }
          setConflict(null)
        }}
      />
    </>
  )
}

const styles = StyleSheet.create({
  balance: { width: 60 },
  content: { paddingHorizontal: spacing.lg },
  create: { marginTop: spacing.lg },
  below: { marginTop: spacing.sm }
})
