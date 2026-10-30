import type {
  LocalTaskEventSource,
  LocalTaskFailureCode
} from '../../../src/shared/local-tasks/local-task-types'
import type {
  LocalTaskStatusCategory,
  LocalTaskStatusColor
} from '../../../src/shared/local-tasks/local-task-model'
import { LOCAL_TASKS_WORK_COPY_EN } from './local-tasks-work-copy-en'

/** The phone's copy, inline English like the rest of the app. Mirrors desktop `localTasks.*`. */
export const LOCAL_TASKS_COPY_EN = {
  title: 'Local tasks',
  back: 'Back',
  retry: 'Retry',
  reconnect: 'Reconnect',
  cancel: 'Cancel',
  save: 'Save',
  create: 'Create',
  edit: 'Edit',
  moreActions: 'More actions',
  delete: 'Delete',
  none: 'None',
  send: 'Send',
  homeCardTitle: 'Local tasks',
  homeCardInProgress: (count: number): string => `${count} in progress`,
  homeCardError: 'Could not read task count',
  pickHostTitle: 'Open local tasks on',
  switchHost: 'Switch host',
  showHostTasks: (machine: string): string => `Show ${machine}'s tasks`,
  sourceLabel: 'Local tasks',
  sourceSubtitle: 'Tasks you write down in Orca',
  workspaceTask: 'Local task',
  workspaceTaskGlyph: (title: string): string => `Local task: ${title}`,
  openWorkspaceTask: (title: string): string => `Open local task ${title}`,
  desktopDisconnected: (machine: string): string =>
    machine ? `Orca on ${machine} is not connected` : 'This host’s Orca is not connected',
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
  segmentStarted: 'In Progress',
  segmentAll: 'All',
  viewList: 'List',
  viewBoard: 'Board',
  newTask: 'New task',
  newSubtask: 'New subtask',
  editTask: 'Edit task',
  noProjects: 'No projects yet',
  noProjectsHint:
    'Create a project to start writing down tasks. A project can link repositories on this host.',
  createProject: 'New project',
  projectSettings: 'Project settings',
  switchProject: 'Switch project',
  emptyList: 'No tasks here yet',
  filteredEmpty: 'No tasks match the search or filter',
  searchPlaceholder: 'Search title or ref',
  filterTitle: 'Filter',
  filterNeedsYou: 'A session is waiting on you',
  filterCategories: 'Status category',
  noLabels: 'No labels in this scope',
  clearFilters: 'Clear',
  showCanceled: (count: number): string => `Show Canceled (${count})`,
  hideCanceled: 'Hide Canceled',
  unknownStatus: 'Unknown status',
  categories: {
    backlog: 'Backlog',
    unstarted: 'Unstarted',
    started: 'In Progress',
    review: 'Review',
    completed: 'Completed',
    canceled: 'Canceled'
  } satisfies Record<LocalTaskStatusCategory, string>,
  // The names a new project's statuses get, the same as the desktop writes.
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
  parent: 'Parent task',
  project: 'Project',
  description: 'Description',
  noDescription: 'No description',
  criteria: 'Done criteria',
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
  deleteTaskTitle: (title: string): string => `Delete “${title}”?`,
  deleteTaskMessage: (below: number): string =>
    below > 0
      ? `Its subtasks at every level (${below}) are deleted with it. Only task records are removed; workspaces and sessions are not touched.`
      : 'Only the task record is removed; workspaces and sessions are not touched.',
  eventSources: {
    desktop: 'You',
    mobile: 'You (phone)',
    cli: 'Orca CLI',
    rule: 'Automatic rule'
  } satisfies Record<LocalTaskEventSource, string>,
  eventCreated: 'created the task',
  eventTitle: (title: string): string => `renamed it to “${title}”`,
  eventDescription: 'edited the description',
  eventCriteria: 'edited the done criteria',
  eventStatus: (from: string, to: string): string => `changed status: ${from} → ${to}`,
  eventPriority: (from: string, to: string): string => `changed priority: ${from} → ${to}`,
  eventLabelsChanged: (added: string, removed: string): string =>
    `added labels ${added} and removed ${removed}`,
  eventLabelsAdded: (added: string): string => `added labels ${added}`,
  eventLabelsRemoved: (removed: string): string => `removed labels ${removed}`,
  eventParentSet: (title: string): string => `made it a subtask of “${title}”`,
  eventParentRemoved: (title: string): string => `detached it from “${title}”`,
  eventDeletedTask: 'a deleted task',
  eventRemovedStatus: 'a removed status',
  eventMoved: (from: string, to: string): string => `moved it: ${from} → ${to}`,
  eventWorkspaceStarted: (name: string, host: string): string =>
    host ? `started work in ${name} on ${host}` : `started work in ${name}`,
  eventWorkspaceLinked: (name: string): string => `linked workspace ${name}`,
  eventWorkspaceUnlinked: (name: string): string => `unlinked workspace ${name}`,
  // Said without an actor, as the desktop says it: the host moved, nobody did it.
  eventWorkspaceHost: (name: string, to: string, from: string): string =>
    `Workspace ${name} now runs on ${to} (was ${from})`,
  eventUnnamedWorkspace: 'a workspace',
  eventSessionOpened: (agent: string): string => `opened a ${agent} session`,
  eventSessionLinked: (agent: string): string => `linked a ${agent} session`,
  eventSessionUnlinked: (agent: string): string => `unlinked a ${agent} session`,
  eventUnknownAgent: 'an agent',
  // A rule's change says which rule did it (REQ-013), with no actor in front.
  eventRuleStart: (from: string, to: string): string =>
    `Work started, so the status moved: ${from} → ${to}`,
  eventRulePrMerged: (pr: string, from: string, to: string): string =>
    `#${pr} was merged, so the task completed: ${from} → ${to}`,
  eventComment: 'commented',
  titlePlaceholder: 'Task title',
  descriptionPlaceholder: 'Add a description…',
  criterionPlaceholder: 'A done criterion',
  addCriterion: 'Add a criterion',
  properties: 'Properties',
  labelsPlaceholder: 'Comma separated, e.g. feature, backend',
  subtaskPlaceholder: 'Subtask title; paste several lines to add several',
  continueCreating: 'Create another',
  formHint:
    'Creating a task only records it; it does not open a workspace. Paste several lines into the subtask field to add several at once.',
  pastedLines: (count: number): string => `Pasted ${count} lines`,
  pasteAsSubtasks: (count: number): string => `Create ${count} subtasks`,
  pasteAsSubtasksHint: (title: string): string => `One per line, under “${title}”`,
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
  reposSection: 'Repositories',
  repoNameUnread: 'Repository (name not read yet)',
  repoNotInOrca: 'A repository no longer in Orca',
  defaultRepo: 'Default',
  noReposHint:
    'None: this project only tracks tasks. Start work then picks from every repository on this host.',
  addRepo: 'Add repository',
  reposAtLimit: (limit: number): string =>
    `A project links up to ${limit} repositories. Remove one to add another.`,
  noRepoCandidates: 'No other repository in Orca on this host.',
  makeDefaultRepo: 'Make default',
  removeRepo: 'Remove from project',
  prefix: 'Ref prefix',
  prefixHint: (aliases: string): string =>
    aliases
      ? `Earlier prefixes ${aliases} stay as aliases: their refs still find these tasks, and no other project can take them.`
      : 'Changing the prefix keeps the old one as an alias: old refs still find these tasks, and no other project can take it.',
  prefixInvalid: 'Use 1–10 capital letters or digits, starting with a letter.',
  nameRequired: 'Give the project a name.',
  renameProject: 'Rename project',
  changePrefix: 'Change prefix',
  changePrefixConfirm: (from: string, to: string): string =>
    `Change ${from} to ${to}? ${from} stays as an alias of this project.`,
  deleteProject: 'Delete project…',
  deleteProjectTitle: (name: string): string => `Delete ${name}?`,
  deleteProjectMessage: (count: number): string =>
    `Its tasks (${count}) are deleted with it. Its repositories, their workspaces and sessions are not touched.`,
  deletingProject: 'Deleting the project…',
  confirmDeleteProject: 'Delete project',
  statusesSection: 'Statuses',
  statusesHint:
    'The six categories are fixed. Inside one you can add, rename, recolor and reorder statuses; a status never changes category, and each category keeps at least one.',
  addStatus: 'Add status',
  statusTaskCount: (count: number): string => `Tasks: ${count}`,
  newStatusName: 'Status name',
  renameStatus: 'Rename',
  statusColor: 'Status color',
  moveUp: 'Move up',
  moveDown: 'Move down',
  firstInCategory: 'Already first in its category',
  lastInCategory: 'Already last in its category',
  deleteStatus: 'Remove status',
  removeStatusTitle: (name: string): string => `Remove “${name}”?`,
  removeStatusUnused: 'No task uses this status.',
  lastStatusInCategory: 'The only status in its category can’t be removed.',
  moveTasksTitle: (count: number): string =>
    `Tasks using this status: ${count}. Choose where they go.`,
  newProjectTitle: 'New project',
  newProjectHint:
    'Pick the repositories to track, one project each, check their prefixes and create them; or start an empty project and add repositories later.',
  emptyProjectTitle: 'Or start an empty project',
  emptyProject: 'Empty project',
  emptyProjectHint: 'Only tasks for now; link repositories later',
  createEmptyProject: 'Create empty project',
  createSelected: (count: number): string => `Create selected (${count})`,
  continueWithCreated: 'Continue with created projects',
  prefixFor: (name: string): string => `Prefix for ${name}`,
  orcaProjectsUnavailable:
    'This host hasn’t published its repositories yet, so they can’t be listed here.',
  orcaProjectLinked: (name: string): string => `Also in ${name}`,
  noOrcaProjects:
    'No repositories in Orca on this host yet. Make an empty project, or add a repository to Orca first.',
  failures: {
    not_found: 'It no longer exists. The list has been refreshed.',
    stale: 'Someone changed this in the meantime. The latest version is shown; try again.',
    read_only: 'Tasks are read-only here because a newer version of Orca wrote them.',
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
    // The detail is the holder's ref; the caller swaps in its title when it has the task.
    workspace_already_linked: (task: string): string =>
      task
        ? `This workspace already belongs to “${task}”. Unlink it there first.`
        : 'This workspace already belongs to another task.',
    task_has_workspace: (name: string): string =>
      name
        ? `This task already works in “${name}”. Unlink it first.`
        : 'This task already has a workspace. Unlink it first.',
    workspace_required: 'Link or start a workspace for the task first.',
    session_already_linked: (task: string): string =>
      task
        ? `This session is already linked to “${task}”.`
        : 'This session is already linked to a task.',
    host_not_owned: "That workspace or session is on another Orca; link it in that host's tasks.",
    desktop_only: 'Only a desktop or web client can do this, not the phone.',
    attention_item_mismatch: 'That item belongs to another session, so nothing was marked.'
  } satisfies Record<LocalTaskFailureCode, string | ((detail: string) => string)>,
  failureGeneric: (code: string): string => `This host's Orca refused this (${code}).`,
  deliveryUnknown:
    "The connection dropped before this host's Orca answered. Try again; it will not be applied twice.",
  writeError: (message: string): string => `Could not save the change: ${message}`,
  work: LOCAL_TASKS_WORK_COPY_EN
}

export type LocalTasksCopy = typeof LOCAL_TASKS_COPY_EN
