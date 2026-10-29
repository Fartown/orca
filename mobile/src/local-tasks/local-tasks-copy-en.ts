import type {
  LocalTaskEventSource,
  LocalTaskFailureCode
} from '../../../src/shared/local-tasks/local-task-types'
import type {
  LocalTaskStatusCategory,
  LocalTaskStatusColor
} from '../../../src/shared/local-tasks/local-task-model'
import { LOCAL_TASKS_WORK_COPY_EN } from './local-tasks-work-copy-en'

/** English copy; the shape every other language must fill. Mirrors desktop `localTasks.*`. */
export const LOCAL_TASKS_COPY_EN = {
  title: 'Tasks',
  back: 'Back',
  retry: 'Retry',
  reconnect: 'Reconnect',
  cancel: 'Cancel',
  save: 'Save',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  none: 'None',
  send: 'Send',
  homeCardTitle: 'Local tasks',
  homeCardInProgress: (count: number): string => `${count} in progress`,
  homeCardError: 'Could not read task count',
  pickHostTitle: 'Open local tasks on',
  switchHost: 'Switch host',
  showHostTasks: (machine: string): string => `Show ${machine}'s tasks`,
  hostEntryLabel: 'Local tasks',
  desktopDisconnected: (machine: string): string =>
    machine ? `Cannot connect to Orca on ${machine}` : "Cannot connect to this host's Orca",
  pairingInvalid: 'Pairing invalid — re-pair with this host',
  unsupported: "This host's Orca does not support local tasks yet. Update Orca on it.",
  statusUnreadable: "Could not read this host's status. Try again once the connection settles.",
  checking: 'Checking the host…',
  libraryStarting: 'The task library is starting…',
  libraryUnavailable: "The task library on this host's Orca could not be opened.",
  libraryUnavailableHint:
    "Its data file could not be read (disk, permissions or a damaged file). The rest of Orca is unaffected; restart this host's Orca and try again.",
  libraryReadOnly:
    'Read-only: this task library was written by a newer version of Orca, so it can be viewed here but not changed.',
  loadFailed: 'Could not load tasks.',
  loadFailedHint: 'The connection may be unstable. Try again.',
  eventsLoadFailed: 'Could not refresh activity',
  streamEnded: 'Live updates stopped. Reconnect to refresh.',
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
  noProjectsHint:
    'A project holds tasks and may link Orca repos on this host. Create one to start recording tasks.',
  createProject: 'New project',
  projectSettings: 'Project settings',
  switchProject: 'Switch project',
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
  deleteTaskMessage: (below: number): string =>
    below > 0
      ? `The ${below} tasks under it, at every level, are deleted too. Linked workspaces and sessions are left alone.`
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
  eventWorkspaceLinked: (name: string): string => `linked workspace ${name}`,
  eventWorkspaceUnlinked: (name: string): string => `unlinked workspace ${name}`,
  eventWorkspaceHost: (host: string): string => `workspace moved to ${host}`,
  eventSessionLinked: (agent: string): string => `linked a ${agent} session`,
  eventSessionUnlinked: (agent: string): string => `unlinked a ${agent} session`,
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
  subtasksPartiallySaved: 'The subtasks were created, but some properties were not saved.',
  subtasksAlreadyCreated:
    'These subtasks already exist. Finish saving them or view them from their parent.',
  retrySavingSubtasks: 'Retry saving properties',
  viewCreatedSubtasks: 'View created subtasks',
  settingsTitle: 'Settings',
  projectSection: 'Project',
  name: 'Name',
  reposSection: 'Repos',
  defaultRepo: 'Default',
  noReposHint:
    'No repo: this project only tracks tasks. Start then picks from every repo on this host.',
  addRepo: 'Add repo',
  makeDefaultRepo: 'Make default',
  removeRepo: 'Remove from project',
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
  deleteProject: 'Delete project…',
  deleteProjectTitle: (name: string): string => `Delete ${name}?`,
  deleteProjectMessage: (count: number): string =>
    `Its ${count} task records will be deleted. The Orca project, repositories, workspaces and sessions are not touched.`,
  confirmDeleteProject: 'Delete project',
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
    'Start from one of this host’s repos, or from nothing; repos can be added later. Nothing is created until you confirm.',
  emptyProject: 'Empty project',
  emptyProjectHint: 'Only tasks for now; link repos later',
  orcaProjectsUnavailable:
    "This host hasn't published its project list yet, so repos can't be listed. Try again later.",
  orcaProjectLinked: (name: string): string => `Also in ${name}`,
  noOrcaProjects: 'No Orca projects to choose from.',
  confirmCreateProject: (name: string, prefix: string): string =>
    `Create the project ${name} with prefix ${prefix}?`,
  confirmCreateProjectMessage: 'It gets the six default statuses; you can change them later.',
  failures: {
    not_found: 'It no longer exists. The list has been refreshed.',
    stale: 'Someone changed this in the meantime. The latest version is shown; try again.',
    read_only: "The task library is read-only on this host's Orca.",
    invalid_argument: "This host's Orca rejected these values. Check the form and try again.",
    prefix_taken: (owner: string): string =>
      owner ? `That prefix belongs to the project ${owner}.` : 'That prefix is already used.',
    prefix_invalid: 'Use 1–10 capital letters or digits, starting with a letter.',
    prefix_history_in_project: 'This project already used that prefix for task numbers.',
    parent_invalid:
      'That parent cannot hold this task: it must be in the same project, and not the task itself or one under it.',
    status_invalid: 'That status does not belong to this project.',
    status_in_use: (count: string): string =>
      `${count} tasks still use this status. Pick where to move them first.`,
    last_status_in_category: 'Each category keeps at least one status.',
    comment_not_editable: 'Only comments can be edited.',
    workspace_already_linked: (ref: string): string =>
      ref
        ? `That workspace already belongs to ${ref}.`
        : 'That workspace already belongs to a task.',
    task_has_workspace: (name: string): string =>
      name
        ? `This task already works in “${name}”. Unlink it first.`
        : 'This task already has a workspace. Unlink it first.',
    workspace_required: 'Link or start a workspace for the task first.',
    session_already_linked: (ref: string): string =>
      ref ? `That session is already linked to ${ref}.` : 'That session is already linked.',
    host_not_owned: "That workspace or session is on another Orca; link it in that host's tasks.",
    desktop_only: 'Only a desktop or web client can do this, not the phone.',
    attention_item_mismatch: 'That item belongs to another session, so nothing was marked.'
  } satisfies Record<LocalTaskFailureCode, string | ((detail: string) => string)>,
  failureGeneric: (code: string): string => `This host's Orca refused this (${code}).`,
  deliveryUnknown:
    "The connection dropped before this host's Orca answered. Try again; it will not be applied twice.",
  writeError: (message: string): string => `Could not reach this host's Orca: ${message}`,
  work: LOCAL_TASKS_WORK_COPY_EN
}

export type LocalTasksCopy = typeof LOCAL_TASKS_COPY_EN
