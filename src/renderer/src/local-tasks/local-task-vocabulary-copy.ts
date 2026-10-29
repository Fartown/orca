import { translate } from '@/i18n/i18n'
import type {
  LocalTaskPriority,
  LocalTaskStatusCategory,
  LocalTaskStatusColor
} from '../../../shared/local-tasks/local-task-model'
import type { LocalTaskView } from './local-task-page-store'

export function localTaskCategoryLabel(category: LocalTaskStatusCategory): string {
  switch (category) {
    case 'backlog':
      return translate('localTasks.category.backlog', 'Backlog')
    case 'unstarted':
      return translate('localTasks.category.unstarted', 'Unstarted')
    case 'started':
      return translate('localTasks.category.started', 'In progress')
    case 'review':
      return translate('localTasks.category.review', 'Review')
    case 'completed':
      return translate('localTasks.category.completed', 'Completed')
    case 'canceled':
      return translate('localTasks.category.canceled', 'Canceled')
  }
}

export function localTaskViewLabel(view: LocalTaskView): string {
  return view === 'all' ? translate('localTasks.views.all', 'All') : localTaskCategoryLabel(view)
}

export function localTaskPriorityLabel(priority: LocalTaskPriority): string {
  switch (priority) {
    case 0:
      return translate('localTasks.priority.none', 'No priority')
    case 1:
      return translate('localTasks.priority.urgent', 'Urgent')
    case 2:
      return translate('localTasks.priority.high', 'High')
    case 3:
      return translate('localTasks.priority.medium', 'Medium')
    case 4:
      return translate('localTasks.priority.low', 'Low')
  }
}

export function localTaskColorLabel(color: LocalTaskStatusColor): string {
  switch (color) {
    case 'gray':
      return translate('localTasks.color.gray', 'Gray')
    case 'blue':
      return translate('localTasks.color.blue', 'Blue')
    case 'yellow':
      return translate('localTasks.color.yellow', 'Yellow')
    case 'orange':
      return translate('localTasks.color.orange', 'Orange')
    case 'green':
      return translate('localTasks.color.green', 'Green')
    case 'red':
      return translate('localTasks.color.red', 'Red')
    case 'purple':
      return translate('localTasks.color.purple', 'Purple')
  }
}

/** Stored status names are user data; a new project gets them in the creator's language. */
export function localTaskDefaultStatusNames(): Record<LocalTaskStatusCategory, string> {
  return {
    backlog: translate('localTasks.defaultStatus.backlog', 'Backlog'),
    unstarted: translate('localTasks.defaultStatus.unstarted', 'Todo'),
    started: translate('localTasks.defaultStatus.started', 'In Progress'),
    review: translate('localTasks.defaultStatus.review', 'In Review'),
    completed: translate('localTasks.defaultStatus.completed', 'Done'),
    canceled: translate('localTasks.defaultStatus.canceled', 'Canceled')
  }
}
