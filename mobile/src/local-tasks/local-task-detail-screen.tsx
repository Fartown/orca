import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft, Ellipsis, Layers, Pencil, Trash2 } from 'lucide-react-native'
import { buildLocalTaskIndex } from '../../../src/shared/local-tasks/local-task-grouping'
import { localTaskPathFromRoot } from '../../../src/shared/local-tasks/local-task-hierarchy'
import { localTaskDescendantIds } from '../../../src/shared/local-tasks/local-task-tree'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { localTaskWritebacks } from '../../../src/shared/local-tasks/local-task-writebacks'
import { ActionSheetModal } from '../components/ActionSheetModal'
import { ConfirmModal } from '../components/ConfirmModal'
import { colors, spacing, typography } from '../theme/mobile-theme'
import { formatLocalTaskAgo, localTasksCopy } from './local-tasks-copy'
import { LocalTaskActivitySection } from './local-task-activity-section'
import { localTaskWriteMessage } from './local-task-failure-message'
import { localTaskStatusLookup } from './local-task-list-projection'
import { LocalTaskAncestorPath, LocalTaskDetailWhere } from './local-task-detail-head'
import { LocalTaskDetailSections } from './local-task-detail-sections'
import type { LocalTaskDetailProps } from './local-task-detail-view'
import { createLocalTaskOperationIds, sendLocalTaskWrite } from './local-task-operation-ids'
import { LocalTaskPriorityPicker, LocalTaskStatusPicker } from './local-task-pickers'
import { localTaskRowSessionStates, localTaskSessionViews } from './local-task-progress-projection'
import { localTaskCardFacts } from './local-task-card-facts'
import { localTaskLatestProgress } from './local-task-latest-line'
import { LocalTaskNowCard } from './local-task-now-card'
import { LocalTaskPreviewDrawer } from './local-task-preview-drawer'
import { LocalTaskReviewActions } from './local-task-review-actions'
import { localTaskChatPreviewTarget } from './local-task-session-open'
import { useLocalTaskCardContext } from './use-local-task-card-context'
import { localTaskStyles } from './local-tasks-styles'
import { LocalTaskPriorityIcon, LocalTaskStatusIcon } from './local-tasks-visuals'
import { useLocalTaskEvents } from './use-local-tasks-library'
import { useLocalTaskWorkControls } from './local-task-work-section'

/**
 * A task's page as prototype m4 lays it out: where it works and the main "New session" button in
 * the head, acceptance, "Now" with the latest progress and every session, then the description,
 * subtasks and activity. Workspace actions sit in the "…" menu.
 */
export function LocalTaskDetailScreen(props: LocalTaskDetailProps & { task: LocalTask }) {
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
  const { library, task } = props
  const project = library.projects.find((entry) => entry.id === task.projectId) ?? null
  const lookup = localTaskStatusLookup(library.projects)
  const status = lookup.get(task.statusId) ?? null
  const index = buildLocalTaskIndex(library.projects, library.tasks)
  const ancestors = localTaskPathFromRoot(task, index.tasksById)
  const subtasks = index.childrenByParentId.get(task.id) ?? []
  const descendants = localTaskDescendantIds(task.id, index.childrenByParentId).flatMap((id) => {
    const child = index.tasksById.get(id)
    return child ? [child] : []
  })
  const inContact = props.site.connState === 'connected'
  const cards = useLocalTaskCardContext({
    site: props.site,
    library,
    reviewTasks: status?.category === 'review' ? [task] : []
  })
  const facts = localTaskCardFacts({
    task,
    index,
    links: library.work.links,
    snapshot: library.work.progress,
    inContact,
    hostName: cards.context.hostName,
    hostConnected: cards.context.hostConnected
  })
  const reviewDetail = cards.context.reviewDetail(task)
  const events = useLocalTaskEvents(
    props.canRead ? props.api : null,
    task.id,
    library.eventsVersion
  )
  const work = useLocalTaskWorkControls({
    task,
    library,
    api: props.api,
    site: props.site,
    canWrite: props.canRead && !props.readOnly,
    onNavigate: props.onNavigate
  })
  // Q2: a chat session is answered in the drawer; a terminal one opens its own page.
  const openSession = (id: string) => {
    if (localTaskChatPreviewTarget(library, props.site.endpoint, id)) {
      setPreviewSessionId(id)
      return null
    }
    return props.onOpenSession(id)
  }

  const update = async (patch: { statusId?: string; priority?: LocalTask['priority'] }) => {
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
          <LocalTaskStatusIcon
            category={status?.category ?? null}
            color={status?.color ?? 'gray'}
            size={14}
          />
          <Text style={styles.ref}>{task.ref}</Text>
        </View>
        <Pressable
          style={localTaskStyles.iconButton}
          onPress={() => setMenuOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={copy.moreActions}
          testID="local-task-detail-menu"
        >
          <Ellipsis size={18} color={colors.textSecondary} />
        </Pressable>
      </View>
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
        <LocalTaskAncestorPath ancestors={ancestors} onOpenTask={props.onOpenTask} />
        <LocalTaskDetailWhere
          facts={facts}
          reviewDetail={reviewDetail}
          primary={work.primary}
          notices={work.notices}
          readOnly={props.readOnly}
        />
        {error ? <Text style={[localTaskStyles.errorText, styles.error]}>{error}</Text> : null}
        <LocalTaskReviewActions
          task={task}
          project={project}
          api={props.api}
          site={props.site}
          library={library}
          copy={copy}
          readOnly={props.readOnly}
          detail={reviewDetail}
          latestBody={localTaskLatestProgress(task, descendants)?.body ?? null}
          onUpdateStatus={(statusId) => update({ statusId })}
          onError={setError}
        />
        <LocalTaskNowCard
          task={task}
          descendants={descendants}
          facts={facts}
          writebacks={localTaskWritebacks(events.events)}
          sessions={localTaskSessionViews({
            task,
            index,
            links: library.work.links,
            snapshot: library.work.progress,
            inContact
          })}
          links={library.work.links}
          snapshot={library.work.progress}
          now={props.now}
          onOpenSession={(id) => setError(openSession(id))}
          onLongPressSession={
            work.requestUnlinkSession
              ? (id) => {
                  const link = library.work.links.sessions.find((entry) => entry.id === id)
                  if (link) {
                    work.requestUnlinkSession?.(link)
                  }
                }
              : null
          }
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
              inContact
            })
          }
          onEdit={props.onEdit}
          onAddSubtask={props.onAddSubtask}
          onOpenTask={props.onOpenTask}
        />
        <LocalTaskActivitySection
          api={props.api}
          taskId={task.id}
          events={events}
          statuses={lookup}
          tasksById={index.tasksById}
          now={props.now}
          readOnly={props.readOnly}
          canRead={props.canRead}
          onChanged={() => library.reload(['events'])}
        />
      </ScrollView>
      <LocalTaskStatusPicker
        visible={picker === 'status'}
        project={project}
        selected={task.statusId}
        onSelect={(statusId) => void update({ statusId })}
        onClose={() => setPicker(null)}
      />
      <LocalTaskPriorityPicker
        visible={picker === 'priority'}
        selected={task.priority}
        onSelect={(priority) => void update({ priority })}
        onClose={() => setPicker(null)}
      />
      <ActionSheetModal
        visible={menuOpen}
        title={task.title}
        actions={[
          ...work.menuActions,
          ...(props.readOnly
            ? []
            : [
                { label: copy.edit, icon: Pencil, onPress: () => props.onEdit(task) },
                {
                  label: copy.delete,
                  icon: Trash2,
                  destructive: true,
                  closeBeforePress: true,
                  onPress: () => setConfirmDelete(true)
                }
              ])
        ]}
        onClose={() => setMenuOpen(false)}
      />
      {work.sheets}
      <ConfirmModal
        visible={confirmDelete}
        title={copy.deleteTaskTitle(task.title)}
        message={copy.deleteTaskMessage(descendants.length)}
        confirmLabel={copy.delete}
        cancelLabel={copy.cancel}
        destructive
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
      <LocalTaskPreviewDrawer
        site={props.site}
        api={props.api}
        library={library}
        taskSessionId={previewSessionId}
        now={props.now}
        hostName={cards.context.hostName}
        onOpenFull={(id) => setError(props.onOpenSession(id))}
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
  error: { marginTop: spacing.sm }
})
