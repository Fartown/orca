import type {
  LocalTaskEventSource,
  LocalTaskFailureCode
} from '../../../src/shared/local-tasks/local-task-types'
import type {
  LocalTaskStatusCategory,
  LocalTaskStatusColor
} from '../../../src/shared/local-tasks/local-task-model'

/** English copy; the shape every other language must fill. Mirrors desktop `localTasks.*`. */
export const LOCAL_TASKS_COPY_EN = {
  title: 'Tasks',
  home: 'Home',
  back: 'Back',
  retry: 'Retry',
  cancel: 'Cancel',
  save: 'Save',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  none: 'None',
  send: 'Send',
  homeCardTitle: 'Local tasks',
  homeCardInProgress: (count: number): string => `${count} in progress`,
  homeCardLoading: 'Reading tasks…',
  pickHostTitle: 'Open local tasks on',
  hostEntryLabel: 'Local tasks',
  desktopClosed: (machine: string): string => `Orca on ${machine} is not open`,
  desktopClosedHint: (machine: string): string =>
    `Local tasks live in the desktop Orca on ${machine}; the phone reads and writes them through it. Open Orca on ${machine} to see them here.`,
  unsupported: 'This desktop Orca does not support local tasks. Update Orca on the desktop.',
  statusUnreadable: 'Could not read the desktop status. Try again once the connection settles.',
  checking: 'Checking the desktop…',
  libraryStarting: 'The task library is starting…',
  libraryUnavailable: 'The task library on the desktop could not be opened.',
  libraryUnavailableHint:
    'Its data file could not be read (disk, permissions or a damaged file). The rest of Orca is unaffected; restart Orca on the desktop and try again.',
  libraryReadOnly:
    'Read-only: this task library was written by a newer version of Orca, so it can be viewed here but not changed.',
  loadFailed: 'Could not load tasks.',
  loadFailedHint: 'The connection may be unstable. Try again.',
  showDetails: 'Show details',
  hideDetails: 'Hide details',
  conflictTitle: 'Changed on another device',
  conflictMessage:
    'Your edits are kept. Overwrite writes the fields you changed onto the latest version; Discard drops your edits and shows the latest.',
  overwrite: 'Overwrite',
  discard: 'Discard my edits',
  allProjects: 'All projects',
  segmentStarted: 'In progress',
  segmentAll: 'All',
  viewList: 'List',
  viewBoard: 'Board',
  newTask: 'New task',
  newSubtask: 'New subtask',
  editTask: 'Edit task',
  noProjects: 'No projects yet',
  noProjectsHint: 'A project maps to one Orca project. Create one to start recording tasks.',
  createProject: 'New project',
  projectSettings: 'Project settings',
  switchProject: 'Switch project',
  switchProjectHint: 'One project per Orca project',
  projectTaskCount: (count: number): string => `${count} tasks`,
  allProjectsHint: (count: number): string => `${count} tasks · board columns by category`,
  emptyList: 'No tasks here yet',
  filteredEmpty: 'No tasks match the search or filter',
  searchPlaceholder: 'Search ref or title',
  filterTitle: 'Filter',
  filterCategories: 'Status category',
  noLabels: 'No labels in this scope',
  clearFilters: 'Clear',
  showCanceled: (count: number): string => `Show Canceled (${count})`,
  hideCanceled: 'Hide Canceled',
  unknownStatus: 'Unknown status',
  categories: {
    backlog: 'Backlog',
    unstarted: 'Unstarted',
    started: 'Started',
    review: 'Review',
    completed: 'Completed',
    canceled: 'Canceled'
  } satisfies Record<LocalTaskStatusCategory, string>,
  defaultStatusNames: {
    backlog: 'Backlog',
    unstarted: 'Todo',
    started: 'In Progress',
    review: 'In Review',
    completed: 'Done',
    canceled: 'Canceled'
  } satisfies Record<LocalTaskStatusCategory, string>,
  colors: {
    gray: 'Gray',
    blue: 'Blue',
    yellow: 'Yellow',
    orange: 'Orange',
    green: 'Green',
    red: 'Red',
    purple: 'Purple'
  } satisfies Record<LocalTaskStatusColor, string>,
  priorities: ['No priority', 'Urgent', 'High', 'Medium', 'Low'],
  updatedAgo: (ago: string): string => `Updated ${ago}`,
  justNow: 'just now',
  minutesAgo: (count: number): string => `${count}m ago`,
  hoursAgo: (count: number): string => `${count}h ago`,
  daysAgo: (count: number): string => `${count}d ago`,
  status: 'Status',
  priority: 'Priority',
  labels: 'Labels',
  parent: 'Parent',
  project: 'Project',
  description: 'Description',
  noDescription: 'No description',
  criteria: 'Done when',
  criteriaOptional: 'optional',
  subtasks: 'Subtasks',
  addSubtask: 'Add',
  activity: 'Comments and activity',
  commentPlaceholder: 'Write a comment…',
  editComment: 'Edit comment',
  deleteComment: 'Delete comment',
  deleteCommentConfirm: 'Delete this comment?',
  edited: 'edited',
  taskMissing: 'This task no longer exists.',
  deleteTaskTitle: (ref: string): string => `Delete ${ref}?`,
  deleteTaskMessage: (subtasks: number): string =>
    subtasks > 0
      ? `Its ${subtasks} subtasks are deleted too. Linked workspaces and sessions are left alone.`
      : 'Linked workspaces and sessions are left alone.',
  eventSources: {
    desktop: 'Desktop',
    mobile: 'Phone',
    cli: 'CLI',
    rule: 'Rule'
  } satisfies Record<LocalTaskEventSource, string>,
  eventCreated: 'created the task',
  eventTitle: 'renamed the task',
  eventDescription: 'edited the description',
  eventCriteria: 'edited the done criteria',
  eventStatus: (from: string, to: string): string => `changed status ${from} → ${to}`,
  eventPriority: (from: string, to: string): string => `changed priority ${from} → ${to}`,
  eventLabels: 'changed labels',
  eventParent: 'changed the parent',
  eventMoved: (from: string, to: string): string => `moved ${from} → ${to}`,
  eventComment: 'commented',
  titlePlaceholder: 'Task title',
  descriptionPlaceholder: 'Add a description…',
  criterionPlaceholder: 'A done criterion',
  addCriterion: 'Add one',
  properties: 'Properties',
  labelsPlaceholder: 'Comma separated, e.g. feature, backend',
  subtaskPlaceholder: 'Subtask title; paste several lines to add several',
  continueCreating: 'Create more',
  formHint:
    'Creating a task only records it; it does not open a workspace. Paste several lines into the subtask field to add several at once.',
  pastedLines: (count: number): string => `Pasted ${count} lines`,
  pasteAsSubtasks: (count: number): string => `Create ${count} subtasks`,
  pasteAsSubtasksHint: (ref: string): string => `One per line, under ${ref}`,
  pasteAsTitle: 'Use as one title',
  pasteAsTitleHint: 'Line breaks become spaces',
  savedPartially: 'The task was saved, but its subtasks were not. Add them from the task.',
  settingsTitle: 'Settings',
  projectSection: 'Project',
  name: 'Name',
  repository: 'Orca project',
  prefix: 'Prefix',
  prefixHint: (aliases: string): string =>
    aliases
      ? `Earlier prefixes ${aliases} stay as aliases: their refs still find these tasks, and no other project can take them.`
      : 'Changing the prefix keeps the old one as an alias: old refs still find these tasks, and no other project can take it.',
  prefixInvalid: 'Use 1–10 capital letters or digits, starting with a letter.',
  renameProject: 'Rename project',
  changePrefix: 'Change prefix',
  changePrefixConfirm: (from: string, to: string): string =>
    `Change ${from} to ${to}? ${from} stays as an alias of this project.`,
  statusesSection: 'Statuses',
  statusesHint:
    'The six categories are fixed. Inside one you can add, rename, recolor and reorder statuses; a status never changes category, and each category keeps at least one.',
  addStatus: 'Add status',
  statusTaskCount: (count: number): string => `${count} tasks`,
  newStatusName: 'Status name',
  renameStatus: 'Rename',
  statusColor: 'Color',
  moveUp: 'Move up',
  moveDown: 'Move down',
  deleteStatus: 'Delete status',
  moveTasksTitle: (count: number): string => `Move its ${count} tasks to`,
  newProjectTitle: 'New project',
  newProjectHint:
    'A project maps to one Orca project. Pick one below; nothing is created until you confirm.',
  orcaProjectsUnavailable:
    'The desktop window is not open, so the Orca project list cannot be read. Open the window and try again.',
  orcaProjectLinked: (name: string): string => `Already the project ${name}`,
  noOrcaProjects: 'No Orca projects to choose from.',
  confirmCreateProject: (name: string, prefix: string): string =>
    `Create the project ${name} with prefix ${prefix}?`,
  confirmCreateProjectMessage: 'It gets the six default statuses; you can change them later.',
  failures: {
    not_found: 'It no longer exists. The list has been refreshed.',
    stale: 'Someone changed this in the meantime. The latest version is shown; try again.',
    read_only: 'The task library is read-only on this desktop.',
    prefix_taken: (owner: string): string =>
      owner ? `That prefix belongs to the project ${owner}.` : 'That prefix is already used.',
    prefix_invalid: 'Use 1–10 capital letters or digits, starting with a letter.',
    orca_project_linked: (owner: string): string =>
      owner
        ? `That Orca project already belongs to the project ${owner}.`
        : 'That Orca project already has a task project.',
    parent_invalid:
      'That parent cannot hold subtasks: it must be a top-level task in the same project.',
    status_invalid: 'That status does not belong to this project.',
    status_in_use: (count: string): string =>
      `${count} tasks still use this status. Pick where to move them first.`,
    last_status_in_category: 'Each category keeps at least one status.',
    comment_not_editable: 'Only comments can be edited.',
    workspace_linked: 'Unlink its workspace before moving it to another project.'
  } satisfies Record<LocalTaskFailureCode, string | ((detail: string) => string)>,
  failureGeneric: (code: string): string => `The desktop refused this (${code}).`,
  deliveryUnknown:
    'The connection dropped before the desktop answered. Try again; it will not be applied twice.',
  writeError: (message: string): string => `Could not reach the desktop: ${message}`
}

export type LocalTasksCopy = typeof LOCAL_TASKS_COPY_EN
