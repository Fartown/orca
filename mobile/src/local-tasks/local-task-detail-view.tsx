import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft, CornerDownRight, Ellipsis, Layers, Pencil, Trash2 } from 'lucide-react-native'
import { buildLocalTaskIndex } from '../../../src/shared/local-tasks/local-task-grouping'
import { localTaskPathFromRoot } from '../../../src/shared/local-tasks/local-task-hierarchy'
import { localTaskDescendantIds } from '../../../src/shared/local-tasks/local-task-tree'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { ActionSheetModal } from '../components/ActionSheetModal'
import { ConfirmModal } from '../components/ConfirmModal'
import { colors, spacing, typography } from '../theme/mobile-theme'
import type { LocalTasksApi } from './local-tasks-api'
import { formatLocalTaskAgo, localTasksCopy } from './local-tasks-copy'
import { LocalTaskActivitySection } from './local-task-activity-section'
import { localTaskWriteMessage } from './local-task-failure-message'
import { localTaskStatusLookup } from './local-task-list-projection'
import { LocalTaskDetailSections } from './local-task-detail-sections'
import { createLocalTaskOperationIds, sendLocalTaskWrite } from './local-task-operation-ids'
import { LocalTaskPriorityPicker, LocalTaskStatusPicker } from './local-task-pickers'
import {
  localTaskRowSessionStates,
  localTaskSessionViews,
  localTaskWorkspaceLinkFor
} from './local-task-progress-projection'
import { localTaskLatestLine, localTaskLatestProgress } from './local-task-latest-line'
import { LocalTaskSessionDrawer } from './local-task-session-drawer'
import { LocalTaskReviewActions } from './local-task-review-actions'
import { localTaskWorkspaceRouteId } from './local-task-work-navigation'
import { localTaskStyles } from './local-tasks-styles'
import { LocalTaskPriorityIcon, LocalTaskStatusIcon } from './local-tasks-visuals'
import type { LocalTasksLibrary } from './use-local-tasks-library'
import type { LocalTaskSite } from './local-task-endpoint'
import { LocalTaskWorkSection } from './local-task-work-section'

type Props = {
  library: LocalTasksLibrary
  api: LocalTasksApi
  taskId: string
  now: number
  readOnly: boolean
  canRead: boolean
  onBack: () => void
  onOpenTask: (taskId: string) => void
  onEdit: (task: LocalTask) => void
  onAddSubtask: (parent: LocalTask) => void
  site: LocalTaskSite
  /** Opens a linked session's screen; returns why it can't, when it can't. */
  onOpenSession: (taskSessionId: string) => string | null
  onNavigate: (href: string) => void
}

export function LocalTaskDetailView(props: Props) {
  const copy = localTasksCopy()
  const insets = useSafeAreaInsets()
  const [ids] = useState(() => ({
    update: createLocalTaskOperationIds(),
    remove: createLocalTaskOperationIds()
  }))
  const [picker, setPicker] = useState<'status' | 'priority' | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null)
  const { library } = props
  const task = library.tasks.find((candidate) => candidate.id === props.taskId) ?? null
  const project = task
    ? (library.projects.find((entry) => entry.id === task.projectId) ?? null)
    : null
  const lookup = localTaskStatusLookup(library.projects)
  const status = task ? (lookup.get(task.statusId) ?? null) : null
  const index = buildLocalTaskIndex(library.projects, library.tasks)
  const ancestors = task ? localTaskPathFromRoot(task, index.tasksById) : []
  const subtasks = task ? (index.childrenByParentId.get(task.id) ?? []) : []
  const descendantCount = task
    ? localTaskDescendantIds(task.id, index.childrenByParentId).length
    : 0
  const descendants = task
    ? localTaskDescendantIds(task.id, index.childrenByParentId).flatMap((id) => {
        const child = index.tasksById.get(id)
        return child ? [child] : []
      })
    : []
  const latestProgress = task ? localTaskLatestProgress(task, descendants) : null
  const latestLine = task
    ? localTaskLatestLine(
        task,
        localTaskSessionViews({
          task,
          tasks: library.tasks,
          links: library.work.links,
          snapshot: library.work.progress,
          inContact: props.site.connState === 'connected'
        }),
        descendants
      )
    : null
  const previewSession =
    library.work.links.sessions.find((session) => session.id === previewSessionId) ?? null
  const previewOwner = previewSession ? (index.tasksById.get(previewSession.taskId) ?? null) : null
  const previewWorkspace = previewOwner
    ? localTaskWorkspaceLinkFor(previewOwner, index.tasksById, library.work.links)
    : null
  const previewWorktreeId =
    previewSession?.worktreeId ??
    (previewWorkspace ? localTaskWorkspaceRouteId(previewWorkspace) : null)
  const openSession = (id: string) => {
    const link = library.work.links.sessions.find((session) => session.id === id)
    const owner = link ? index.tasksById.get(link.taskId) : null
    const workspace = owner
      ? localTaskWorkspaceLinkFor(owner, index.tasksById, library.work.links)
      : null
    if (link?.surface === 'chat' && (link.worktreeId || workspace)) {
      setPreviewSessionId(id)
      return null
    }
    return props.onOpenSession(id)
  }

  const update = async (patch: { statusId?: string; priority?: LocalTask['priority'] }) => {
    if (!task) {
      return false
    }
    const outcome = await sendLocalTaskWrite(
      ids.update,
      { taskId: task.id, expectedRevision: task.revision, patch },
      props.api.updateTask
    )
    setError(localTaskWriteMessage(copy, outcome))
    if (outcome.kind === 'ok') {
      library.acceptTasks([outcome.value.task])
    }
    library.reload(['tasks'])
    return outcome.kind === 'ok'
  }

  const remove = async () => {
    setConfirmDelete(false)
    if (!task) {
      return
    }
    const outcome = await sendLocalTaskWrite(ids.remove, { taskId: task.id }, props.api.removeTask)
    setError(localTaskWriteMessage(copy, outcome))
    library.reload(['tasks'])
    if (outcome.kind === 'ok') {
      props.onBack()
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
          <Text style={localTaskStyles.backLabel}>{copy.title}</Text>
        </Pressable>
        <View style={styles.titleCenter}>
          {task ? (
            <>
              <LocalTaskStatusIcon
                category={status?.category ?? null}
                color={status?.color ?? 'gray'}
                size={14}
              />
              <Text style={styles.ref}>{task.ref}</Text>
            </>
          ) : null}
        </View>
        <Pressable
          style={[
            localTaskStyles.iconButton,
            (!task || props.readOnly) && localTaskStyles.disabled
          ]}
          disabled={!task || props.readOnly}
          onPress={() => setMenuOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={copy.moreActions}
        >
          <Ellipsis size={18} color={colors.textSecondary} />
        </Pressable>
      </View>
      {!task ? (
        <View style={localTaskStyles.centered}>
          <Text style={localTaskStyles.centeredText}>{copy.taskMissing}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.metaRow}>
            <Layers size={12} color={colors.textMuted} />
            <Text style={localTaskStyles.meta}>
              {project?.name ?? ''} ·{' '}
              {copy.updatedAgo(formatLocalTaskAgo(copy, task.updatedAt, props.now))}
            </Text>
          </View>
          <Text style={styles.title}>{task.title}</Text>
          <View style={styles.chips}>
            <Pressable
              style={localTaskStyles.chip}
              disabled={props.readOnly}
              onPress={() => setPicker('status')}
            >
              <LocalTaskStatusIcon
                category={status?.category ?? null}
                color={status?.color ?? 'gray'}
                size={14}
              />
              <Text style={localTaskStyles.chipText}>{status?.name ?? copy.unknownStatus}</Text>
            </Pressable>
            <Pressable
              style={localTaskStyles.chip}
              disabled={props.readOnly}
              onPress={() => setPicker('priority')}
            >
              <LocalTaskPriorityIcon priority={task.priority} />
              <Text style={localTaskStyles.chipText}>{copy.priorities[task.priority]}</Text>
            </Pressable>
            {task.labels.map((label) => (
              <View key={label} style={localTaskStyles.label}>
                <Text style={localTaskStyles.labelText}>{label}</Text>
              </View>
            ))}
          </View>
          {ancestors.length > 0 ? (
            <View style={styles.parentRow} testID="local-task-ancestor-path">
              <CornerDownRight size={14} color={colors.textMuted} />
              {ancestors.map((ancestor, index) => (
                <Pressable
                  key={ancestor.id}
                  style={styles.ancestor}
                  onPress={() => props.onOpenTask(ancestor.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${ancestor.title} ${ancestor.ref}`}
                >
                  {index > 0 ? <Text style={localTaskStyles.meta}>›</Text> : null}
                  <Text style={styles.parentTitle} numberOfLines={1}>
                    {ancestor.title}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {error ? <Text style={[localTaskStyles.errorText, styles.error]}>{error}</Text> : null}
          <View style={[localTaskStyles.card, styles.nowCard]}>
            <Text style={localTaskStyles.sectionLabel}>{copy.now}</Text>
            <Pressable
              disabled={!latestProgress?.sessionLinkId}
              onPress={() =>
                latestProgress?.sessionLinkId && openSession(latestProgress.sessionLinkId)
              }
              accessibilityRole={latestProgress?.sessionLinkId ? 'button' : undefined}
            >
              <Text style={latestLine ? localTaskStyles.body : localTaskStyles.meta}>
                {latestLine ?? copy.noProgress}
              </Text>
            </Pressable>
            {latestProgress ? (
              <Text style={localTaskStyles.meta}>
                {formatLocalTaskAgo(copy, latestProgress.at, props.now)}
              </Text>
            ) : null}
          </View>
          <LocalTaskReviewActions
            task={task}
            project={project}
            api={props.api}
            site={props.site}
            library={library}
            copy={copy}
            readOnly={props.readOnly}
            onUpdateStatus={(statusId) => update({ statusId })}
            onError={setError}
          />
          <LocalTaskWorkSection
            task={task}
            library={library}
            api={props.api}
            site={props.site}
            canWrite={props.canRead && !props.readOnly}
            onOpenSession={openSession}
            onNavigate={props.onNavigate}
          />
          <LocalTaskDetailSections
            task={task}
            subtasks={subtasks}
            statuses={lookup}
            readOnly={props.readOnly}
            sessionsFor={(child) =>
              localTaskRowSessionStates({
                task: child,
                index,
                links: library.work.links,
                snapshot: library.work.progress,
                inContact: props.site.connState === 'connected'
              })
            }
            onEdit={props.onEdit}
            onAddSubtask={props.onAddSubtask}
            onOpenTask={props.onOpenTask}
          />
          <LocalTaskActivitySection
            api={props.api}
            taskId={task.id}
            eventsVersion={library.eventsVersion}
            statuses={lookup}
            tasksById={index.tasksById}
            now={props.now}
            readOnly={props.readOnly}
            canRead={props.canRead}
            onChanged={() => library.reload(['events'])}
          />
        </ScrollView>
      )}
      <LocalTaskStatusPicker
        visible={picker === 'status'}
        project={project}
        selected={task?.statusId ?? null}
        onSelect={(statusId) => void update({ statusId })}
        onClose={() => setPicker(null)}
      />
      <LocalTaskPriorityPicker
        visible={picker === 'priority'}
        selected={task?.priority ?? 0}
        onSelect={(priority) => void update({ priority })}
        onClose={() => setPicker(null)}
      />
      <ActionSheetModal
        visible={menuOpen}
        title={task?.title}
        actions={[
          { label: copy.edit, icon: Pencil, onPress: () => task && props.onEdit(task) },
          {
            label: copy.delete,
            icon: Trash2,
            destructive: true,
            onPress: () => setConfirmDelete(true)
          }
        ]}
        onClose={() => setMenuOpen(false)}
      />
      <ConfirmModal
        visible={confirmDelete}
        title={copy.deleteTaskTitle(task?.title ?? '')}
        message={copy.deleteTaskMessage(descendantCount)}
        confirmLabel={copy.delete}
        cancelLabel={copy.cancel}
        destructive
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
      <LocalTaskSessionDrawer
        hostId={props.site.hostId}
        worktreeId={previewWorktreeId}
        session={previewSession}
        api={props.api}
        library={library}
        onClose={() => setPreviewSessionId(null)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  titleCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  // The ref only says where the page is; the title below is the task's name (§4), so it stays muted.
  ref: {
    color: colors.textMuted,
    fontFamily: typography.monoFamily,
    fontSize: 13
  },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '700', marginTop: spacing.sm },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md
  },
  parentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md
  },
  ancestor: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  parentTitle: { flexShrink: 1, color: colors.textSecondary, fontSize: 12 },
  error: { marginTop: spacing.sm },
  nowCard: { marginTop: spacing.lg, padding: spacing.md, gap: spacing.sm }
})
