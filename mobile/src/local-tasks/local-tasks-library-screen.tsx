import { useEffect, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Plus } from 'lucide-react-native'
import { MobileSegmentedControl } from '../components/MobileSegmentedControl'
import { useBackClaim } from '../navigation/use-back-claim'
import { colors, spacing } from '../theme/mobile-theme'
import type { RpcClient } from '../transport/rpc-client'
import type { LocalTasksApi } from './local-tasks-api'
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
import { LocalTasksProjectCreateView } from './local-tasks-project-create-view'
import { LocalTasksSettingsView } from './local-tasks-settings-view'
import { localTaskStyles } from './local-tasks-styles'
import type { LocalTasksLibrary } from './use-local-tasks-library'
import { useOrcaProjectChoices } from './use-orca-project-choices'

type Route =
  | { kind: 'detail'; taskId: string }
  | { kind: 'form'; mode: LocalTaskFormMode }
  | { kind: 'settings'; projectId: string | null }
  | { kind: 'newProject' }

type Props = {
  client: RpcClient
  api: LocalTasksApi
  library: LocalTasksLibrary
  readOnly: boolean
  notice: string | null
  onExit: () => void
}

export function LocalTasksLibraryScreen(props: Props) {
  const copy = localTasksCopy()
  const insets = useSafeAreaInsets()
  const { library } = props
  // Undefined until the user picks: then the first project, so a one-project library opens on it.
  const [chosenProjectId, setChosenProjectId] = useState<string | null | undefined>(undefined)
  const [segment, setSegment] = useState<LocalTaskSegment>('all')
  const [view, setView] = useState<LocalTasksViewMode>('list')
  const [stack, setStack] = useState<Route[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [filter, setFilter] = useState<LocalTaskFilter>(EMPTY_LOCAL_TASK_FILTER)
  const top = stack.length > 0 ? stack[stack.length - 1] : null
  const orcaProjects = useOrcaProjectChoices(
    top?.kind === 'settings' || top?.kind === 'newProject' ? props.client : null
  )
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
    segment,
    filter,
    nestSubtasks: view === 'list',
    keepEmpty: view === 'board'
  })
  const openTask = (taskId: string) => push({ kind: 'detail', taskId })
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
        onBack={pop}
        onOpenTask={openTask}
        onEdit={(task) => push({ kind: 'form', mode: { kind: 'edit', task } })}
        onAddSubtask={(parent) => push({ kind: 'form', mode: { kind: 'subtask', parent } })}
      />
    )
  }
  if (top?.kind === 'form') {
    return (
      <LocalTaskFormView
        library={library}
        api={props.api}
        mode={top.mode}
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
      />
    )
  }
  if (top?.kind === 'newProject') {
    return (
      <LocalTasksProjectCreateView
        library={library}
        api={props.api}
        orcaProjects={orcaProjects}
        onBack={pop}
        onCreated={(id) => {
          setChosenProjectId(id)
          setStack([])
        }}
      />
    )
  }

  const tasksById = new Map(library.tasks.map((task) => [task.id, task]))
  return (
    <View style={[localTaskStyles.screen, { paddingTop: insets.top }]}>
      <LocalTasksLibraryHeader
        project={project}
        hasProjects={library.projects.length > 0}
        view={view}
        onExit={props.onExit}
        onSettings={() => push({ kind: 'settings', projectId })}
        onView={setView}
        onPickProject={() => setPickerOpen(true)}
      />
      {props.notice ? (
        <View style={localTaskStyles.notice}>
          <Text style={localTaskStyles.noticeText}>{props.notice}</Text>
        </View>
      ) : null}
      {library.projects.length === 0 ? (
        <View style={localTaskStyles.centered}>
          <Text style={localTaskStyles.centeredTitle}>{copy.noProjects}</Text>
          <Text style={localTaskStyles.centeredText}>{copy.noProjectsHint}</Text>
          {props.readOnly ? null : (
            <Pressable
              style={localTaskStyles.secondaryButton}
              onPress={() => push({ kind: 'newProject' })}
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
                { value: 'started', label: `${copy.segmentStarted} ${counts.started}` },
                { value: 'all', label: `${copy.segmentAll} ${counts.all}` }
              ]}
              selected={segment}
              onSelect={setSegment}
            />
          </View>
          <LocalTasksFilterBar
            filter={filter}
            labels={localTaskFilterLabels(
              localTasksInScope(library.tasks, projectId),
              filter.labels
            )}
            onChange={setFilter}
          />
          {view === 'list' ? (
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
        onSelect={setChosenProjectId}
        onClose={() => setPickerOpen(false)}
      />
    </View>
  )
}
