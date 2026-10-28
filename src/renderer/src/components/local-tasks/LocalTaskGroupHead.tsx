import { FolderKanban, ListTodo } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { firstStatusInCategory } from '@/local-tasks/local-task-grouping'
import type { LocalTaskGroupHead } from '@/local-tasks/local-task-list-groups'
import { localTaskPageStore } from '@/local-tasks/local-task-page-store'
import {
  isLocalTaskRowWritable,
  localTasksDomainStore,
  type LocalTasksDomainState
} from '@/local-tasks/local-tasks-domain-store'
import {
  canCreateLocalTask,
  writableLocalTaskProjects
} from '@/local-tasks/local-task-write-access'
import {
  localTaskCategoryLabel,
  localTaskPriorityLabel
} from '@/local-tasks/local-task-vocabulary-copy'
import { LocalTaskPriorityIcon, LocalTaskStatusIcon } from './LocalTaskIcons'
import type { LocalTaskListModel } from './use-local-task-list-model'

export function localTaskGroupLabel(head: LocalTaskGroupHead): string {
  switch (head.kind) {
    case 'status':
      return head.status.name
    case 'category':
      return localTaskCategoryLabel(head.category)
    case 'priority':
      return localTaskPriorityLabel(head.priority)
    case 'project':
      return head.project.name
    case 'none':
      return translate('localTasks.groups.all', 'All tasks')
  }
}

export function LocalTaskGroupIcon({ head }: { head: LocalTaskGroupHead }): React.JSX.Element {
  switch (head.kind) {
    case 'status':
      return <LocalTaskStatusIcon category={head.status.category} color={head.status.color} />
    case 'category':
      return <LocalTaskStatusIcon category={head.category} color="gray" />
    case 'priority':
      return <LocalTaskPriorityIcon priority={head.priority} />
    case 'project':
      return <FolderKanban className="size-3.5 text-muted-foreground" />
    case 'none':
      return <ListTodo className="size-3.5 text-muted-foreground" />
  }
}

/** Whether the group's + can open New task: its project's, or some project's, library takes writes. */
export function canCreateInGroup(
  state: Pick<LocalTasksDomainState, 'partitions' | 'home' | 'projects'>,
  head: LocalTaskGroupHead,
  model: Pick<LocalTaskListModel, 'scopeProjectId'>
): boolean {
  return head.kind === 'project'
    ? isLocalTaskRowWritable(state, head.project.id)
    : canCreateLocalTask(state, model.scopeProjectId)
}

/** Opens New task preset to what the group stands for, in the scoped project or a writable one. */
export function openCreateInGroup(head: LocalTaskGroupHead, model: LocalTaskListModel): void {
  const project =
    (head.kind === 'project' ? head.project : model.scopeProject) ??
    writableLocalTaskProjects(localTasksDomainStore.getState(), model.projects)[0]
  const statusId =
    head.kind === 'status'
      ? head.status.id
      : head.kind === 'category'
        ? firstStatusInCategory(project, head.category)?.id
        : undefined
  localTaskPageStore.getState().openCreate({
    projectId: project?.id ?? null,
    statusId: statusId ?? null,
    priority: head.kind === 'priority' ? head.priority : null
  })
}
