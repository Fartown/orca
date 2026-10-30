import { useEffect, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Plus } from 'lucide-react-native'
import { localTaskAttentionClearsOnView } from '../../../src/shared/local-tasks/local-task-attention-rules'
import { MobileSegmentedControl } from '../components/MobileSegmentedControl'
import { PickerListDrawer } from '../components/PickerListDrawer'
import { useBackClaim } from '../navigation/use-back-claim'
import { colors, spacing } from '../theme/mobile-theme'
import type { LocalTasksApi } from './local-tasks-api'
import type { LocalTaskEndpoint, LocalTaskSite } from './local-task-endpoint'
import { localTasksCopy } from './local-tasks-copy'
import { LocalTaskDetailView } from './local-task-detail-view'
import type { LocalTaskFormMode } from './local-task-form-state'
import { LocalTaskFormView } from './local-task-form-view'
import {
  buildLocalTaskGroups,
  localTaskSegmentCounts,
  localTasksInScope,
  localTaskStatusLookup,
  type LocalTaskSegment
} from './local-task-list-projection'
import {
  EMPTY_LOCAL_TASK_FILTER,
  isLocalTaskFilterActive,
  localTaskFilterLabels,
  type LocalTaskFilter
} from './local-task-filter'
import { LocalTaskProjectPicker } from './local-task-pickers'
import { LocalTasksFilterBar } from './local-tasks-filter-bar'
import { LocalTasksBoardView } from './local-tasks-board-view'
import { LocalTasksLibraryHeader, type LocalTasksViewMode } from './local-tasks-library-header'
import { LocalTasksListView } from './local-tasks-list-view'
import { LocalTasksAttentionView } from './local-tasks-attention-view'
import {
  localTaskAttentionItemCount,
  localTaskAttentionRows,
  localTaskItemsForSession,
  localTaskWorkspaceLinkFor
} from './local-task-progress-projection'
import { createLocalTaskOperationIds, sendLocalTaskWrite } from './local-task-operation-ids'
import { localTaskSessionHref } from './local-task-work-navigation'
import { LocalTasksProjectCreateView } from './local-tasks-project-create-view'
import { LocalTasksSettingsView } from './local-tasks-settings-view'
import { localTaskStyles } from './local-tasks-styles'
import type { LocalTaskEndpointChoice } from './use-local-task-endpoints'
import type { LocalTasksLibrary } from './use-local-tasks-library'
import { useOrcaProjectChoices } from './use-orca-project-choices'

type Route =
  | { kind: 'detail'; taskId: string }
  | { kind: 'form'; mode: LocalTaskFormMode }
  | { kind: 'settings'; projectId: string | null }
  | { kind: 'newProject' }

type Props = {
  site: LocalTaskSite
  /** Every library this page reaches; the host switch shows only when there is more than one. */
  hosts: readonly LocalTaskEndpointChoice[]
  onSwitchHost: (endpoint: LocalTaskEndpoint) => void
  api: LocalTasksApi
  library: LocalTasksLibrary
  readOnly: boolean
  canRead: boolean
  onExit: () => void
  onNavigate: (href: string) => void
  /** From the page's route: home's "Needs you" lands on that view, a task link on its detail. */
  initialView?: 'attention'
  initialTaskId?: string
}

type Segment = 'attention' | LocalTaskSegment

export function LocalTasksLibraryScreen(props: Props) {
  const copy = localTasksCopy()
  const insets = useSafeAreaInsets()
  const { library } = props
  // Undefined until the user picks: then the first project, so a one-project library opens on it.
  const [chosenProjectId, setChosenProjectId] = useState<string | null | undefined>(undefined)
  const [segment, setSegment] = useState<Segment>(props.initialView ?? 'all')
  const [view, setView] = useState<LocalTasksViewMode>('list')
  const [stack, setStack] = useState<Route[]>(() =>
    props.initialTaskId ? [{ kind: 'detail', taskId: props.initialTaskId }] : []
  )
  const [pickerOpen, setPickerOpen] = useState(false)
  const [hostPickerOpen, setHostPickerOpen] = useState(false)
  const [filter, setFilter] = useState<LocalTaskFilter>(EMPTY_LOCAL_TASK_FILTER)
  const top = stack.at(-1) ?? null
  const { site } = props
  const orcaProjects = useOrcaProjectChoices(
    top?.kind === 'settings' || top?.kind === 'newProject' ? site.pairedClient : null,
    site.endpoint
  )
  const showHosts = props.hosts.length > 1
  const push = (route: Route) => setStack((previous) => [...previous, route])
  const pop = () => setStack((previous) => previous.slice(0, -1))
  useBackClaim(
    stack.length > 0
      ? () => {
          pop()
          return true
        }
      : null
  )

  const projectId =
    chosenProjectId === undefined
      ? (library.projects[0]?.id ?? null)
      : library.projects.some((project) => project.id === chosenProjectId)
        ? chosenProjectId
        : null
  const project = library.projects.find((entry) => entry.id === projectId) ?? null
  // Why tied to the data: relative times move when the library does, and no clock ticks for them.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
  }, [library.tasks, library.eventsVersion])
  const lookup = useMemo(() => localTaskStatusLookup(library.projects), [library.projects])
  const counts = localTaskSegmentCounts(library.tasks, library.projects, projectId)
  const groups = buildLocalTaskGroups({
    tasks: library.tasks,
    projects: library.projects,
    projectId,
    segment: segment === 'attention' ? 'all' : segment,
    filter,
    nestSubtasks: view === 'list',
    keepEmpty: view === 'board'
  })
  const openTask = (taskId: string) => push({ kind: 'detail', taskId })
  const tasksById = new Map(library.tasks.map((task) => [task.id, task]))
  const attentionRows = localTaskAttentionRows({
    snapshot: library.work.progress,
    tasks: library.tasks,
    projectId
  })
  const inContact = site.connState === 'connected'
  const openSession = (taskSessionId: string) => {
    const session = library.work.links.sessions.find((entry) => entry.id === taskSessionId)
    const owner = session ? tasksById.get(session.taskId) : undefined
    const href = session
      ? localTaskSessionHref({
          hostId: site.hostId,
          endpoint: site.endpoint,
          session,
          workspace: owner ? localTaskWorkspaceLinkFor(owner, tasksById, library.work.links) : null
        })
      : null
    if (href) {
      acknowledgeOpened(props.api, library, taskSessionId)
      props.onNavigate(href)
    }
  }
  const createIn = (statusId?: string) => {
    const target = project ?? library.projects[0]
    if (target) {
      push({ kind: 'form', mode: { kind: 'create', projectId: target.id, statusId } })
    }
  }

  if (top?.kind === 'detail') {
    return (
      <LocalTaskDetailView
        library={library}
        api={props.api}
        taskId={top.taskId}
        now={now}
        readOnly={props.readOnly}
        canRead={props.canRead}
        onBack={pop}
        onOpenTask={openTask}
        onEdit={(task) => push({ kind: 'form', mode: { kind: 'edit', task } })}
        onAddSubtask={(parent) => push({ kind: 'form', mode: { kind: 'subtask', parent } })}
        site={site}
        onOpenSession={openSession}
        onNavigate={props.onNavigate}
      />
    )
  }
  if (top?.kind === 'form') {
    return (
      <LocalTaskFormView
        library={library}
        api={props.api}
        mode={top.mode}
        readOnly={props.readOnly}
        onClose={pop}
        // A new task opens on its detail; an edit or a subtask returns to the detail it came from.
        onDone={(taskId) =>
          setStack((previous) => [
            ...previous.slice(0, -1),
            ...(top.mode.kind === 'create' ? [{ kind: 'detail' as const, taskId }] : [])
          ])
        }
      />
    )
  }
  if (top?.kind === 'settings') {
    return (
      <LocalTasksSettingsView
        library={library}
        api={props.api}
        orcaProjects={orcaProjects}
        projectId={top.projectId}
        readOnly={props.readOnly}
        onBack={pop}
        onOpenProject={(id) => push({ kind: 'settings', projectId: id })}
        onCreateProject={() => push({ kind: 'newProject' })}
        onDeletedProject={() => {
          setChosenProjectId(null)
          setStack([])
        }}
      />
    )
  }
  if (top?.kind === 'newProject') {
    return (
      <LocalTasksProjectCreateView
        library={library}
        api={props.api}
        orcaProjects={orcaProjects}
        readOnly={props.readOnly}
        onBack={pop}
        onCreated={(id) => {
          setChosenProjectId(id)
          setStack([])
        }}
      />
    )
  }

  return (
    <View style={[localTaskStyles.screen, { paddingTop: insets.top }]}>
      <LocalTasksLibraryHeader
        project={project}
        hasProjects={library.projects.length > 0}
        hostLabel={showHosts ? site.label : null}
        onPickHost={() => setHostPickerOpen(true)}
        view={view}
        showViewToggle={library.projects.length > 0 && segment !== 'attention'}
        onExit={props.onExit}
        onSettings={() => push({ kind: 'settings', projectId })}
        onView={setView}
        onPickProject={() => setPickerOpen(true)}
      />
      {library.projects.length === 0 ? (
        <View style={localTaskStyles.centered}>
          <Text style={localTaskStyles.centeredTitle}>{copy.noProjects}</Text>
          <Text style={localTaskStyles.centeredText}>{copy.noProjectsHint}</Text>
          {props.readOnly ? null : (
            <Pressable
              style={localTaskStyles.secondaryButton}
              onPress={() => push({ kind: 'newProject' })}
              accessibilityRole="button"
            >
              <Plus size={16} color={colors.textPrimary} />
              <Text style={localTaskStyles.secondaryButtonText}>{copy.createProject}</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <>
          <View style={localTaskStyles.segmentRow}>
            <MobileSegmentedControl
              fill
              segments={[
                {
                  value: 'attention',
                  // Why no number out of contact: those items no longer count as needing you.
                  label: inContact
                    ? `${copy.work.segmentAttention} ${localTaskAttentionItemCount(attentionRows)}`
                    : copy.work.segmentAttention
                },
                { value: 'started', label: `${copy.segmentStarted} ${counts.started}` },
                { value: 'all', label: `${copy.segmentAll} ${counts.all}` }
              ]}
              selected={segment}
              onSelect={setSegment}
            />
          </View>
          {segment === 'attention' ? null : (
            <LocalTasksFilterBar
              filter={filter}
              labels={localTaskFilterLabels(
                localTasksInScope(library.tasks, projectId),
                filter.labels
              )}
              onChange={setFilter}
            />
          )}
          {segment === 'attention' ? (
            <LocalTasksAttentionView
              library={library}
              api={props.api}
              site={site}
              rows={attentionRows}
              now={now}
              canWrite={props.canRead && !props.readOnly}
              bottomInset={insets.bottom}
              onOpenTask={openTask}
              onOpenSession={(item) => openSession(item.taskSessionId)}
            />
          ) : view === 'list' ? (
            <LocalTasksListView
              groups={groups}
              lookup={lookup}
              now={now}
              bottomInset={insets.bottom}
              emptyText={isLocalTaskFilterActive(filter) ? copy.filteredEmpty : undefined}
              onOpen={openTask}
            />
          ) : (
            <LocalTasksBoardView
              groups={groups}
              tasksById={tasksById}
              now={now}
              bottomInset={insets.bottom}
              onCreateIn={props.readOnly || !project ? undefined : createIn}
              onOpen={openTask}
            />
          )}
          {props.readOnly ? null : (
            <Pressable
              style={[localTaskStyles.fab, { bottom: insets.bottom + spacing.lg }]}
              onPress={() => createIn()}
              accessibilityRole="button"
              accessibilityLabel={copy.newTask}
            >
              <Plus size={24} color={colors.bgBase} />
            </Pressable>
          )}
        </>
      )}
      <LocalTaskProjectPicker
        visible={pickerOpen}
        projects={library.projects}
        selected={projectId}
        allProjectsLabel={copy.allProjects}
        onCreateProject={props.readOnly ? undefined : () => push({ kind: 'newProject' })}
        onSelect={setChosenProjectId}
        onClose={() => setPickerOpen(false)}
      />
      <PickerListDrawer
        visible={hostPickerOpen}
        title={copy.switchHost}
        items={props.hosts.map((choice) => ({ id: choice.endpoint.key, label: choice.label }))}
        selectedId={site.endpoint.key}
        onSelect={(item) => {
          const choice = props.hosts.find((entry) => entry.endpoint.key === item.id)
          if (choice && choice.endpoint.key !== site.endpoint.key) {
            props.onSwitchHost(choice.endpoint)
          }
        }}
        onClose={() => setHostPickerOpen(false)}
      />
    </View>
  )
}

/**
 * Opening a session is seeing it: the items a look settles (a finished turn, REQ-014) are marked
 * seen on the library's host (技术方案 §9.2); an approval or a question waits until handled.
 */
function acknowledgeOpened(
  api: LocalTasksApi,
  library: Pick<LocalTasksLibrary, 'work' | 'reload'>,
  taskSessionId: string
) {
  const items = localTaskItemsForSession(library.work.progress, taskSessionId).filter(
    localTaskAttentionClearsOnView
  )
  if (items.length === 0) {
    return
  }
  // Why fresh ids: each open is its own act; a lost answer leaves the item for the next open.
  void Promise.all(
    items.map((item) =>
      sendLocalTaskWrite(
        createLocalTaskOperationIds(),
        { itemKey: item.key, taskSessionId: item.taskSessionId },
        api.acknowledge
      )
    )
  ).then(() => library.reload(['attention']))
}
