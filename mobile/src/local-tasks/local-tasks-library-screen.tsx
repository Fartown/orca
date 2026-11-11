import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Plus } from 'lucide-react-native'
import { MobileSegmentedControl } from '../components/MobileSegmentedControl'
import { PickerListDrawer } from '../components/PickerListDrawer'
import { useBackClaim } from '../navigation/use-back-claim'
import { colors } from '../theme/mobile-theme'
import type { LocalTasksApi } from './local-tasks-api'
import type { LocalTaskEndpoint, LocalTaskSite } from './local-task-endpoint'
import { localTasksCopy } from './local-tasks-copy'
import { LocalTaskDetailView } from './local-task-detail-view'
import { LocalTaskDispatchInput } from './local-task-dispatch-input'
import type { LocalTaskFormMode } from './local-task-form-state'
import { LocalTaskFormView } from './local-task-form-view'
import { localTasksInScope, type LocalTaskSegment } from './local-task-list-projection'
import {
  EMPTY_LOCAL_TASK_FILTER,
  isLocalTaskFilterActive,
  localTaskFilterLabels,
  type LocalTaskFilter
} from './local-task-filter'
import { LocalTasksFilterBar } from './local-tasks-filter-bar'
import { LocalTasksBoardView } from './local-tasks-board-view'
import { LocalTasksLibraryHeader, type LocalTasksViewMode } from './local-tasks-library-header'
import { LocalTasksListView } from './local-tasks-list-view'
import { LocalTasksAttentionView } from './local-tasks-attention-view'
import { LocalTaskNeedsYouList } from './local-task-needs-you-list'
import {
  localTaskAttentionTaskCount,
  type LocalTaskAttentionRow
} from './local-task-progress-projection'
import { LocalTaskPreviewDrawer } from './local-task-preview-drawer'
import { localTaskChatPreviewTarget, openLinkedLocalTaskSession } from './local-task-session-open'
import { useLocalTaskViewMemory } from './local-task-view-memory'
import { useLocalTasksLibraryModel } from './use-local-tasks-library-model'
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
  const { library, site } = props
  // Remembered per paired host and library. Home's "Needs you" opens on it with All projects,
  // since home counts every project (REQ-006).
  const [remembered, remember] = useLocalTaskViewMemory(
    `${site.hostId}\u0000${site.endpoint.key}`,
    { projectId: null, segment: 'all', view: 'list' },
    props.initialView === 'attention' ? { projectId: null, segment: 'attention' } : null
  )
  const { segment, view } = remembered
  const setSegment = (next: Segment) => remember({ segment: next })
  const setView = (next: LocalTasksViewMode) => remember({ view: next })
  const setChosenProjectId = (next: string | null) => remember({ projectId: next })
  const [stack, setStack] = useState<Route[]>(() =>
    props.initialTaskId ? [{ kind: 'detail', taskId: props.initialTaskId }] : []
  )
  const [hostPickerOpen, setHostPickerOpen] = useState(false)
  const [filter, setFilter] = useState<LocalTaskFilter>(EMPTY_LOCAL_TASK_FILTER)
  const [searchOpen, setSearchOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null)
  const top = stack.at(-1) ?? null
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

  const chosenProjectId = remembered.projectId
  // Unchosen opens on all projects, as the desktop does; a deleted project falls back to them too.
  const projectId = library.projects.some((project) => project.id === chosenProjectId)
    ? chosenProjectId
    : null
  const project = library.projects.find((entry) => entry.id === projectId) ?? null
  // Why tied to the data: relative times move when the library does, and no clock ticks for them.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
  }, [library.tasks, library.eventsVersion])
  const model = useLocalTasksLibraryModel({ site, library, projectId, segment, view, filter })
  const { lookup, counts, inContact, attentionRows, groups, listBand, cards, tasksById } = model
  const openTask = (taskId: string) => push({ kind: 'detail', taskId })
  const openSession = (taskSessionId: string) =>
    openLinkedLocalTaskSession({
      site,
      api: props.api,
      library,
      copy,
      taskSessionId,
      onNavigate: props.onNavigate
    })
  // Q2: a chat session is answered in the drawer; a terminal one opens its own page.
  const previewSession = (taskSessionId: string) => {
    if (localTaskChatPreviewTarget(library, taskSessionId)) {
      setNotice(null)
      setPreviewSessionId(taskSessionId)
    } else {
      setNotice(openSession(taskSessionId))
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
        site={site}
        onNavigate={props.onNavigate}
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

  const canWrite = props.canRead && !props.readOnly
  const searchShown = segment !== 'attention' && (searchOpen || isLocalTaskFilterActive(filter))
  const needsYouList = (rows: LocalTaskAttentionRow[]) => (
    <LocalTaskNeedsYouList
      library={library}
      api={props.api}
      site={site}
      rows={rows}
      now={now}
      canWrite={canWrite}
      context={cards.context}
      onOpenTask={openTask}
      onPreview={previewSession}
      onOpenSession={(id) => setNotice(openSession(id))}
    />
  )
  return (
    <View style={[localTaskStyles.screen, { paddingTop: insets.top }]}>
      <LocalTasksLibraryHeader
        projects={library.projects}
        projectId={projectId}
        onSelectProject={setChosenProjectId}
        onCreateProject={props.readOnly ? undefined : () => push({ kind: 'newProject' })}
        hostLabel={showHosts ? site.label : null}
        onPickHost={() => setHostPickerOpen(true)}
        view={view}
        showViewToggle={library.projects.length > 0 && segment !== 'attention'}
        onNewTask={props.readOnly || library.projects.length === 0 ? undefined : () => createIn()}
        onSearch={
          library.projects.length > 0 && segment !== 'attention'
            ? () => setSearchOpen((open) => !open)
            : undefined
        }
        searchActive={searchShown}
        onExit={props.onExit}
        onSettings={() => push({ kind: 'settings', projectId })}
        onView={setView}
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
          {!props.readOnly && (project ?? library.projects[0]) ? (
            <LocalTaskDispatchInput
              site={site}
              api={props.api}
              library={library}
              project={(project ?? library.projects[0])!}
              hostConnected={cards.connected}
              allProjects={project === null}
              onNavigate={props.onNavigate}
            />
          ) : null}
          <View style={localTaskStyles.segmentRow}>
            <MobileSegmentedControl
              fill
              segments={[
                {
                  value: 'attention',
                  // Why no number out of contact: those items no longer count as needing you.
                  label: inContact
                    ? `${copy.work.segmentAttention} ${localTaskAttentionTaskCount(attentionRows)}`
                    : copy.work.segmentAttention
                },
                { value: 'started', label: `${copy.segmentStarted} ${counts.started}` },
                { value: 'all', label: `${copy.segmentAll} ${counts.all}` }
              ]}
              selected={segment}
              onSelect={(next) => {
                setNotice(null)
                setSegment(next)
              }}
            />
          </View>
          {notice ? (
            <Text
              style={[localTaskStyles.errorText, localTaskStyles.attentionStale]}
              testID="local-tasks-open-notice"
            >
              {notice}
            </Text>
          ) : null}
          {searchShown ? (
            <LocalTasksFilterBar
              filter={filter}
              labels={localTaskFilterLabels(
                localTasksInScope(library.tasks, projectId),
                filter.labels
              )}
              onChange={setFilter}
            />
          ) : null}
          {segment === 'attention' ? (
            <LocalTasksAttentionView
              library={library}
              api={props.api}
              site={site}
              rows={attentionRows}
              now={now}
              canWrite={canWrite}
              bottomInset={insets.bottom}
              context={cards.context}
              onOpenTask={openTask}
              onPreview={previewSession}
              onOpenSession={(id) => setNotice(openSession(id))}
            />
          ) : view === 'list' ? (
            <LocalTasksListView
              groups={groups}
              lookup={lookup}
              now={now}
              bottomInset={insets.bottom}
              emptyText={isLocalTaskFilterActive(filter) ? copy.filteredEmpty : undefined}
              sessionsFor={model.sessionsFor}
              factsFor={model.factsFor}
              band={
                listBand
                  ? {
                      ids: listBand.ids,
                      count: listBand.rows.length,
                      note: inContact ? null : copy.work.attentionUnverifiable(site.label),
                      section: needsYouList(listBand.rows)
                    }
                  : undefined
              }
              onOpen={openTask}
            />
          ) : (
            <LocalTasksBoardView
              groups={groups}
              tasksById={tasksById}
              now={now}
              bottomInset={insets.bottom}
              onCreateIn={props.readOnly || !project ? undefined : createIn}
              sessionsFor={model.sessionsFor}
              latestLineFor={model.latestLineFor}
              onOpen={openTask}
            />
          )}
        </>
      )}
      <LocalTaskPreviewDrawer
        site={site}
        api={props.api}
        library={library}
        taskSessionId={previewSessionId}
        now={now}
        hostName={cards.context.hostName}
        onOpenFull={(id) => setNotice(openSession(id))}
        onClose={() => setPreviewSessionId(null)}
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
