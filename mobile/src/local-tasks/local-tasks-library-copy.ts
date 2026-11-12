import type {
  LocalTaskStatusCategory,
  LocalTaskStatusColor
} from '../../../src/shared/local-tasks/local-task-model'
import { translate } from '../i18n/mobile-i18n'

/** The library screen's words: shared actions, host and library states, list chrome, status names. */
export function localTasksLibraryCopy() {
  return {
    back: translate('localTasks.common.back', 'Back'),
    retry: translate('localTasks.common.retry', 'Retry'),
    reconnect: translate('localTasks.common.reconnect', 'Reconnect'),
    cancel: translate('localTasks.common.cancel', 'Cancel'),
    save: translate('localTasks.common.save', 'Save'),
    create: translate('localTasks.common.create', 'Create'),
    edit: translate('localTasks.common.edit', 'Edit'),
    moreActions: translate('localTasks.common.moreActions', 'More actions'),
    delete: translate('localTasks.common.delete', 'Delete'),
    none: translate('localTasks.common.none', 'None'),
    send: translate('localTasks.common.send', 'Send'),
    homeCardTitle: translate('localTasks.home.cardTitle', 'Local tasks'),
    homeCardInProgress: (count: number): string =>
      translate('localTasks.home.cardInProgress', '{{count}} in progress', { count }),
    homeCardError: translate('localTasks.home.cardError', 'Could not read task count'),
    pickHostTitle: translate('localTasks.host.pickTitle', 'Open local tasks on'),
    switchHost: translate('localTasks.host.switch', 'Switch host'),
    showHostTasks: (machine: string): string =>
      translate('localTasks.host.showTasks', "Show {{machine}}'s tasks", { machine }),
    sourceLabel: translate('localTasks.source.label', 'Local tasks'),
    sourceSubtitle: translate('localTasks.source.subtitle', 'Tasks you write down in Orca'),
    workspaceTask: translate('localTasks.workspaceTask.label', 'Local task'),
    workspaceTaskGlyph: (title: string): string =>
      translate('localTasks.workspaceTask.glyph', 'Local task: {{title}}', { title }),
    openWorkspaceTask: (title: string): string =>
      translate('localTasks.workspaceTask.open', 'Open local task {{title}}', { title }),
    desktopDisconnected: (machine: string): string =>
      machine
        ? translate('localTasks.host.disconnected', 'Orca on {{machine}} is not connected', {
            machine
          })
        : translate('localTasks.host.disconnectedUnnamed', 'This host’s Orca is not connected'),
    pairingInvalid: translate(
      'localTasks.host.pairingInvalid',
      'Pairing invalid — re-pair with this host'
    ),
    unsupported: translate(
      'localTasks.host.unsupported',
      "This host's Orca does not support local tasks yet. Update Orca on it."
    ),
    statusUnreadable: translate(
      'localTasks.host.statusUnreadable',
      "Could not read this host's status. Try again once the connection settles."
    ),
    checking: translate('localTasks.host.checking', 'Checking the host…'),
    libraryStarting: translate('localTasks.library.starting', 'The task library is starting…'),
    libraryUnavailable: translate(
      'localTasks.library.unavailable',
      "The task library on this host's Orca could not be opened."
    ),
    libraryUnavailableHint: translate(
      'localTasks.library.unavailableHint',
      "Its data file could not be read (disk, permissions or a damaged file). The rest of Orca is unaffected; restart this host's Orca and try again."
    ),
    libraryReadOnly: translate(
      'localTasks.library.readOnly',
      'Read-only: this task library was written by a newer version of Orca, so it can be viewed here but not changed.'
    ),
    loadFailed: translate('localTasks.library.loadFailed', 'Could not load tasks.'),
    loadFailedHint: translate(
      'localTasks.library.loadFailedHint',
      'The connection may be unstable. Try again.'
    ),
    eventsLoadFailed: translate(
      'localTasks.library.eventsLoadFailed',
      'Could not refresh activity'
    ),
    streamEnded: translate(
      'localTasks.library.streamEnded',
      'Live updates stopped. Reconnect to refresh.'
    ),
    showDetails: translate('localTasks.library.showDetails', 'Show details'),
    hideDetails: translate('localTasks.library.hideDetails', 'Hide details'),
    conflictTitle: translate('localTasks.conflict.title', 'Changed on another device'),
    conflictMessage: translate(
      'localTasks.conflict.message',
      'Your edits are kept. Overwrite writes the fields you changed onto the latest version; Discard drops your edits and shows the latest.'
    ),
    overwrite: translate('localTasks.conflict.overwrite', 'Overwrite'),
    discard: translate('localTasks.conflict.discard', 'Discard my edits'),
    allProjects: translate('localTasks.list.allProjects', 'All projects'),
    segmentStarted: translate('localTasks.list.segmentStarted', 'In Progress'),
    segmentAll: translate('localTasks.list.segmentAll', 'All'),
    viewList: translate('localTasks.list.viewList', 'List'),
    viewBoard: translate('localTasks.list.viewBoard', 'Board'),
    newTask: translate('localTasks.list.newTask', 'New task'),
    newSubtask: translate('localTasks.list.newSubtask', 'New subtask'),
    subtasksOf: (title: string): string =>
      translate('localTasks.list.subtasksOf', 'Subtasks of “{{title}}”', { title }),
    editTask: translate('localTasks.list.editTask', 'Edit task'),
    noProjects: translate('localTasks.list.noProjects', 'No projects yet'),
    noProjectsHint: translate(
      'localTasks.list.noProjectsHint',
      'Create a project to start writing down tasks. A project can link repositories on this host.'
    ),
    createProject: translate('localTasks.list.createProject', 'New project'),
    projectSettings: translate('localTasks.list.projectSettings', 'Project settings'),
    switchProject: translate('localTasks.list.switchProject', 'Switch project'),
    emptyList: translate('localTasks.list.empty', 'No tasks here yet'),
    filteredEmpty: translate(
      'localTasks.list.filteredEmpty',
      'No tasks match the search or filter'
    ),
    searchPlaceholder: translate('localTasks.list.searchPlaceholder', 'Search title or ref'),
    filterTitle: translate('localTasks.filter.title', 'Filter'),
    filterNeedsYou: translate('localTasks.filter.needsYou', 'A session is waiting on you'),
    filterCategories: translate('localTasks.filter.categories', 'Status category'),
    noLabels: translate('localTasks.filter.noLabels', 'No labels in this scope'),
    clearFilters: translate('localTasks.filter.clear', 'Clear'),
    showCanceled: (count: number): string =>
      translate('localTasks.filter.showCanceled', 'Show Canceled ({{count}})', { count }),
    hideCanceled: translate('localTasks.filter.hideCanceled', 'Hide Canceled'),
    unknownStatus: translate('localTasks.list.unknownStatus', 'Unknown status'),
    categories: {
      backlog: translate('localTasks.category.backlog', 'Backlog'),
      unstarted: translate('localTasks.category.unstarted', 'Unstarted'),
      started: translate('localTasks.category.started', 'In Progress'),
      review: translate('localTasks.category.review', 'Review'),
      completed: translate('localTasks.category.completed', 'Completed'),
      canceled: translate('localTasks.category.canceled', 'Canceled')
    } satisfies Record<LocalTaskStatusCategory, string>,
    // The names a new project's statuses get, the same as the desktop writes.
    defaultStatusNames: {
      backlog: translate('localTasks.defaultStatus.backlog', 'Backlog'),
      unstarted: translate('localTasks.defaultStatus.unstarted', 'Todo'),
      started: translate('localTasks.defaultStatus.started', 'In Progress'),
      review: translate('localTasks.defaultStatus.review', 'Ready for acceptance'),
      completed: translate('localTasks.defaultStatus.completed', 'Done'),
      canceled: translate('localTasks.defaultStatus.canceled', 'Canceled')
    } satisfies Record<LocalTaskStatusCategory, string>,
    colors: {
      gray: translate('localTasks.color.gray', 'Gray'),
      blue: translate('localTasks.color.blue', 'Blue'),
      yellow: translate('localTasks.color.yellow', 'Yellow'),
      orange: translate('localTasks.color.orange', 'Orange'),
      green: translate('localTasks.color.green', 'Green'),
      red: translate('localTasks.color.red', 'Red'),
      purple: translate('localTasks.color.purple', 'Purple')
    } satisfies Record<LocalTaskStatusColor, string>,
    priorities: [
      translate('localTasks.priority.none', 'No priority'),
      translate('localTasks.priority.urgent', 'Urgent'),
      translate('localTasks.priority.high', 'High'),
      translate('localTasks.priority.medium', 'Medium'),
      translate('localTasks.priority.low', 'Low')
    ],
    updatedAgo: (ago: string): string =>
      translate('localTasks.time.updatedAgo', 'Updated {{ago}}', { ago }),
    justNow: translate('localTasks.time.justNow', 'just now'),
    minutesAgo: (count: number): string =>
      translate('localTasks.time.minutesAgo', '{{count}}m ago', { count }),
    hoursAgo: (count: number): string =>
      translate('localTasks.time.hoursAgo', '{{count}}h ago', { count }),
    daysAgo: (count: number): string =>
      translate('localTasks.time.daysAgo', '{{count}}d ago', { count })
  }
}
