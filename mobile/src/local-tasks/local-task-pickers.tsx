import {
  LOCAL_TASK_PRIORITIES,
  type LocalTaskPriority
} from '../../../src/shared/local-tasks/local-task-model'
import { Plus } from 'lucide-react-native'
import type { LocalTask, LocalTaskProject } from '../../../src/shared/local-tasks/local-task-types'
import { PickerListDrawer } from '../components/PickerListDrawer'
import { PickerModal } from '../components/PickerModal'
import { colors } from '../theme/mobile-theme'
import type { LocalTaskDraft } from './local-task-form-state'
import { localTasksCopy } from './local-tasks-copy'
import { orderedLocalTaskStatuses } from './local-task-list-projection'
import { LocalTaskPriorityIcon, LocalTaskStatusIcon } from './local-tasks-visuals'

export function LocalTaskStatusPicker(props: {
  visible: boolean
  project: LocalTaskProject | null
  selected: string | null
  onSelect: (statusId: string) => void
  onClose: () => void
}) {
  const copy = localTasksCopy()
  const statuses = props.project ? orderedLocalTaskStatuses(props.project) : []
  return (
    <PickerModal
      visible={props.visible}
      title={copy.status}
      options={statuses.map((status) => ({
        value: status.id,
        label: status.name,
        subtitle: copy.categories[status.category],
        renderIcon: () => <LocalTaskStatusIcon category={status.category} color={status.color} />
      }))}
      selected={props.selected ?? ''}
      onSelect={props.onSelect}
      onClose={props.onClose}
    />
  )
}

function priorityFromValue(value: string): LocalTaskPriority {
  return LOCAL_TASK_PRIORITIES.find((priority) => String(priority) === value) ?? 0
}

export function LocalTaskPriorityPicker(props: {
  visible: boolean
  selected: LocalTaskPriority
  onSelect: (priority: LocalTaskPriority) => void
  onClose: () => void
}) {
  const copy = localTasksCopy()
  return (
    <PickerModal
      visible={props.visible}
      title={copy.priority}
      options={[1, 2, 3, 4, 0].map((value) => {
        const priority = priorityFromValue(String(value))
        return {
          value: String(priority),
          label: copy.priorities[priority] ?? '',
          renderIcon: () => <LocalTaskPriorityIcon priority={priority} />
        }
      })}
      selected={String(props.selected)}
      onSelect={(value) => props.onSelect(priorityFromValue(value))}
      onClose={props.onClose}
    />
  )
}

const NO_PARENT = ''

/** Tasks of the same project at any level, the task and its own descendants left out. */
export function LocalTaskParentPicker(props: {
  visible: boolean
  candidates: readonly LocalTask[]
  selected: string | null
  onSelect: (parentId: string | null) => void
  onClose: () => void
}) {
  const copy = localTasksCopy()
  const items = [
    { id: NO_PARENT, label: copy.none },
    ...props.candidates.map((task) => ({ id: task.id, label: task.title, detail: task.ref }))
  ]
  return (
    <PickerListDrawer
      visible={props.visible}
      title={copy.parent}
      items={items}
      selectedId={props.selected ?? NO_PARENT}
      onSelect={(item) => props.onSelect(item.id === NO_PARENT ? null : item.id)}
      onClose={props.onClose}
    />
  )
}

export function LocalTaskProjectPicker(props: {
  visible: boolean
  projects: readonly LocalTaskProject[]
  selected: string | null
  /** Offered first when set: the board and list then span every project. */
  allProjectsLabel?: string
  /** Offered last when set, so a new project is one tap from the picker. */
  onCreateProject?: () => void
  onSelect: (projectId: string | null) => void
  onClose: () => void
}) {
  const copy = localTasksCopy()
  const ALL = '\u0000all'
  const NEW = '\u0000new'
  const items = [
    ...(props.allProjectsLabel ? [{ id: ALL, label: props.allProjectsLabel }] : []),
    ...props.projects.map((project) => ({
      id: project.id,
      label: project.name,
      detail: project.prefix
    })),
    ...(props.onCreateProject ? [{ id: NEW, label: copy.createProject }] : [])
  ]
  return (
    <PickerListDrawer
      visible={props.visible}
      title={copy.switchProject}
      items={items}
      selectedId={props.selected ?? ALL}
      renderIcon={(item) =>
        item.id === NEW ? <Plus size={16} color={colors.textSecondary} /> : null
      }
      onSelect={(item) =>
        item.id === NEW
          ? props.onCreateProject?.()
          : props.onSelect(item.id === ALL ? null : item.id)
      }
      onClose={props.onClose}
    />
  )
}

export type LocalTaskDraftPicker = 'status' | 'priority' | 'parent' | 'project'

/** The form's four pickers, each writing one draft field. */
export function LocalTaskDraftPickers(props: {
  open: LocalTaskDraftPicker | null
  draft: LocalTaskDraft
  projects: readonly LocalTaskProject[]
  parentCandidates: readonly LocalTask[]
  onPatch: (patch: Partial<LocalTaskDraft>) => void
  onClose: () => void
}) {
  const { draft } = props
  return (
    <>
      <LocalTaskStatusPicker
        visible={props.open === 'status'}
        project={props.projects.find((project) => project.id === draft.projectId) ?? null}
        selected={draft.statusId}
        onSelect={(statusId) => props.onPatch({ statusId })}
        onClose={props.onClose}
      />
      <LocalTaskPriorityPicker
        visible={props.open === 'priority'}
        selected={draft.priority}
        onSelect={(priority) => props.onPatch({ priority })}
        onClose={props.onClose}
      />
      <LocalTaskParentPicker
        visible={props.open === 'parent'}
        candidates={props.parentCandidates}
        selected={draft.parentId}
        onSelect={(parentId) => props.onPatch({ parentId })}
        onClose={props.onClose}
      />
      <LocalTaskProjectPicker
        visible={props.open === 'project'}
        projects={props.projects}
        selected={draft.projectId}
        // Why both reset: a status and a parent belong to one project.
        onSelect={(projectId) =>
          projectId && props.onPatch({ projectId, statusId: null, parentId: null })
        }
        onClose={props.onClose}
      />
    </>
  )
}
