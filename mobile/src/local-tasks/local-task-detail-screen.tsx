import { useState } from 'react'
import { Platform, Pressable, ScrollView, Text, View, type TextStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronDown, ChevronLeft, Ellipsis, Pencil, Trash2 } from 'lucide-react-native'
import { buildLocalTaskIndex } from '../../../src/shared/local-tasks/local-task-grouping'
import { localTaskPathFromRoot } from '../../../src/shared/local-tasks/local-task-hierarchy'
import { localTaskDescendantIds } from '../../../src/shared/local-tasks/local-task-tree'
import type { LocalTask } from '../../../src/shared/local-tasks/local-task-types'
import { localTaskWritebacks } from '../../../src/shared/local-tasks/local-task-writebacks'
import { ActionSheetModal } from '../components/sheets/ActionSheetModal'
import { ConfirmModal } from '../components/sheets/ConfirmModal'
import { colors, radii, spacing, typography } from '../theme/mobile-theme'
import { themedStyleSheet } from '../theme/themed-styles'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'
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
  useMobileColorScheme()
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
      <View style={[localTaskStyles.topBar, styles.topBar]}>
        <Pressable
          style={localTaskStyles.backButton}
          onPress={props.onBack}
          accessibilityRole="button"
        >
          <ChevronLeft size={22} color={colors.textPrimary} />
          <Text style={localTaskStyles.backLabel}>{copy.title}</Text>
        </Pressable>
        <View style={styles.topBarSpace} />
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
        <Text
          style={[styles.title, Platform.OS === 'web' ? webBalancedTitle : undefined]}
          textBreakStrategy={Platform.OS === 'android' ? 'balanced' : undefined}
          lineBreakStrategyIOS={Platform.OS === 'ios' ? 'standard' : undefined}
          testID="local-task-detail-title"
        >
          {task.title}
        </Text>
        <View style={styles.metaRow} testID="local-task-detail-meta">
          <Text style={styles.metaLeft} numberOfLines={1} testID="local-task-detail-ref-project">
            <Text style={styles.ref}>{task.ref}</Text>
            {project ? ` · ${project.name}` : null}
          </Text>
          <Text style={styles.metaUpdated} numberOfLines={1} testID="local-task-detail-updated">
            {copy.updatedAgo(formatLocalTaskAgo(copy, task.updatedAt, props.now))}
          </Text>
        </View>
        <View style={styles.attributePair} testID="local-task-detail-attributes">
          <Pressable
            style={styles.attributeAction}
            disabled={props.readOnly}
            onPress={() => setPicker('status')}
            accessibilityRole="button"
            accessibilityLabel={`${copy.status}: ${status?.name ?? copy.unknownStatus}`}
          >
            <View style={styles.attributeChip}>
              <LocalTaskStatusIcon
                category={status?.category ?? null}
                color={status?.color ?? 'gray'}
                size={14}
              />
              <Text style={styles.attributeText} numberOfLines={1}>
                {status?.name ?? copy.unknownStatus}
              </Text>
              <ChevronDown size={12} color={colors.textMuted} />
            </View>
          </Pressable>
          <Pressable
            style={styles.attributeAction}
            disabled={props.readOnly}
            onPress={() => setPicker('priority')}
            accessibilityRole="button"
            accessibilityLabel={`${copy.priority}: ${copy.priorities[task.priority]}`}
          >
            <View style={styles.attributeChip}>
              <LocalTaskPriorityIcon priority={task.priority} />
              <Text
                style={[styles.attributeText, task.priority === 0 && styles.unsetPriority]}
                numberOfLines={1}
              >
                {copy.priorities[task.priority]}
              </Text>
              <ChevronDown size={12} color={colors.textMuted} />
            </View>
          </Pressable>
        </View>
        {task.labels.length > 0 ? (
          <View style={styles.labels}>
            {task.labels.map((label) => (
              <View key={label} style={localTaskStyles.label}>
                <Text style={localTaskStyles.labelText}>{label}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <LocalTaskAncestorPath ancestors={ancestors} onOpenTask={props.onOpenTask} />
        <LocalTaskDetailWhere
          facts={facts}
          reviewDetail={reviewDetail}
          primary={work.primary}
          inheritedFrom={work.inheritedFrom}
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

const webBalancedTitle: TextStyle & { textWrap: 'balance' } = { textWrap: 'balance' }

const styles = themedStyleSheet(() => ({
  topBar: { paddingHorizontal: spacing.lg },
  topBarSpace: { flex: 1 },
  ref: { color: colors.textMuted, fontFamily: typography.monoFamily, fontSize: 13 },
  content: { width: '100%', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm
  },
  metaLeft: { flex: 1, minWidth: 0, color: colors.textMuted, fontSize: typography.metaSize },
  metaUpdated: {
    maxWidth: '45%',
    flexShrink: 1,
    minWidth: 0,
    color: colors.textMuted,
    fontSize: typography.metaSize
  },
  title: {
    width: '100%',
    color: colors.textPrimary,
    fontSize: typography.titleSize,
    fontWeight: '700'
  },
  attributePair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm
  },
  attributeAction: {
    minHeight: 44,
    maxWidth: '50%',
    minWidth: 0,
    flexShrink: 1,
    justifyContent: 'center'
  },
  attributeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel
  },
  attributeText: { flexShrink: 1, color: colors.textSecondary, fontSize: typography.metaSize },
  unsetPriority: { color: colors.textMuted },
  labels: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  error: { marginTop: spacing.sm }
}))
