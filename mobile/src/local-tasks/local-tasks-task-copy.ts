import type { LocalTaskEventSource } from '../../../src/shared/local-tasks/local-task-types'
import { translate } from '../i18n/mobile-i18n'

/** One task's words: its fields, comments, activity lines, and the create/edit form. */
export function localTasksTaskCopy() {
  return {
    status: translate('localTasks.field.status', 'Status'),
    priority: translate('localTasks.field.priority', 'Priority'),
    labels: translate('localTasks.field.labels', 'Labels'),
    parent: translate('localTasks.field.parent', 'Parent task'),
    project: translate('localTasks.field.project', 'Project'),
    noDescription: translate('localTasks.field.noDescription', 'No description'),
    criteria: translate('localTasks.field.criteria', 'Done criteria'),
    criteriaOptional: translate('localTasks.field.criteriaOptional', 'optional'),
    subtasks: translate('localTasks.field.subtasks', 'Subtasks'),
    addSubtask: translate('localTasks.field.addSubtask', 'Add'),
    activity: translate('localTasks.comment.activity', 'Comments and activity'),
    commentPlaceholder: translate('localTasks.comment.placeholder', 'Write a comment…'),
    editComment: translate('localTasks.comment.edit', 'Edit comment'),
    deleteComment: translate('localTasks.comment.delete', 'Delete comment'),
    deleteCommentConfirm: translate('localTasks.comment.deleteConfirm', 'Delete this comment?'),
    edited: translate('localTasks.comment.edited', 'edited'),
    taskMissing: translate('localTasks.detail.missing', 'This task no longer exists.'),
    deleteTaskTitle: (title: string): string =>
      translate('localTasks.detail.deleteTitle', 'Delete “{{title}}”?', { title }),
    deleteTaskMessage: (below: number): string =>
      below > 0
        ? translate(
            'localTasks.detail.deleteWithSubtasks',
            'Its subtasks at every level ({{count}}) are deleted with it. Only task records are removed; workspaces and sessions are not touched.',
            { count: below }
          )
        : translate(
            'localTasks.detail.deleteSingle',
            'Only the task record is removed; workspaces and sessions are not touched.'
          ),
    eventSources: {
      desktop: translate('localTasks.event.source.desktop', 'You'),
      mobile: translate('localTasks.event.source.mobile', 'You (phone)'),
      cli: translate('localTasks.event.source.cli', 'Orca CLI'),
      rule: translate('localTasks.event.source.rule', 'Automatic rule')
    } satisfies Record<LocalTaskEventSource, string>,
    eventCreated: translate('localTasks.event.created', 'created the task'),
    eventTitle: (title: string): string =>
      translate('localTasks.event.renamed', 'renamed it to “{{title}}”', { title }),
    eventDescription: translate('localTasks.event.description', 'edited the description'),
    eventCriteria: translate('localTasks.event.criteria', 'edited the done criteria'),
    eventStatus: (from: string, to: string): string =>
      translate('localTasks.event.status', 'changed status: {{from}} → {{to}}', { from, to }),
    eventPriority: (from: string, to: string): string =>
      translate('localTasks.event.priority', 'changed priority: {{from}} → {{to}}', { from, to }),
    eventLabelsChanged: (added: string, removed: string): string =>
      translate(
        'localTasks.event.labelsChanged',
        'added labels {{added}} and removed {{removed}}',
        {
          added,
          removed
        }
      ),
    eventLabelsAdded: (added: string): string =>
      translate('localTasks.event.labelsAdded', 'added labels {{added}}', { added }),
    eventLabelsRemoved: (removed: string): string =>
      translate('localTasks.event.labelsRemoved', 'removed labels {{removed}}', { removed }),
    eventParentSet: (title: string): string =>
      translate('localTasks.event.parentSet', 'made it a subtask of “{{title}}”', { title }),
    eventParentRemoved: (title: string): string =>
      translate('localTasks.event.parentRemoved', 'detached it from “{{title}}”', { title }),
    eventDeletedTask: translate('localTasks.event.deletedTask', 'a deleted task'),
    eventRemovedStatus: translate('localTasks.event.removedStatus', 'a removed status'),
    eventMoved: (from: string, to: string): string =>
      translate('localTasks.event.moved', 'moved it: {{from}} → {{to}}', { from, to }),
    eventWorkspaceStarted: (name: string, host: string): string =>
      host
        ? translate('localTasks.event.workspaceStartedOn', 'started work in {{name}} on {{host}}', {
            name,
            host
          })
        : translate('localTasks.event.workspaceStarted', 'started work in {{name}}', { name }),
    eventWorkspaceLinked: (name: string): string =>
      translate('localTasks.event.workspaceLinked', 'linked workspace {{name}}', { name }),
    eventWorkspaceUnlinked: (name: string): string =>
      translate('localTasks.event.workspaceUnlinked', 'unlinked workspace {{name}}', { name }),
    // Said without an actor, as the desktop says it: the host moved, nobody did it.
    eventWorkspaceHost: (name: string, to: string, from: string): string =>
      translate(
        'localTasks.event.workspaceHost',
        'Workspace {{name}} now runs on {{to}} (was {{from}})',
        { name, to, from }
      ),
    eventUnnamedWorkspace: translate('localTasks.event.unnamedWorkspace', 'a workspace'),
    eventSessionOpened: (agent: string): string =>
      translate('localTasks.event.sessionOpened', 'opened a {{agent}} session', { agent }),
    eventSessionLinked: (agent: string): string =>
      translate('localTasks.event.sessionLinked', 'linked a {{agent}} session', { agent }),
    eventSessionUnlinked: (agent: string): string =>
      translate('localTasks.event.sessionUnlinked', 'unlinked a {{agent}} session', { agent }),
    eventUnknownAgent: translate('localTasks.event.unknownAgent', 'an agent'),
    // A rule's change says which rule did it, with no actor in front.
    eventRuleStart: (from: string, to: string): string =>
      translate(
        'localTasks.event.ruleStart',
        'Work started, so the status moved: {{from}} → {{to}}',
        {
          from,
          to
        }
      ),
    eventRulePrMerged: (pr: string, from: string, to: string): string =>
      translate(
        'localTasks.event.rulePrMerged',
        '#{{pr}} was merged, so the task completed: {{from}} → {{to}}',
        { pr, from, to }
      ),
    eventComment: translate('localTasks.event.commented', 'commented'),
    titlePlaceholder: translate('localTasks.form.titlePlaceholder', 'Task title'),
    descriptionPlaceholder: translate(
      'localTasks.form.descriptionPlaceholder',
      'Add a description…'
    ),
    criterionPlaceholder: translate('localTasks.form.criterionPlaceholder', 'A done criterion'),
    addCriterion: translate('localTasks.form.addCriterion', 'Add a criterion'),
    properties: translate('localTasks.form.properties', 'Properties'),
    labelsPlaceholder: translate(
      'localTasks.form.labelsPlaceholder',
      'Comma separated, e.g. feature, backend'
    ),
    subtaskPlaceholder: translate(
      'localTasks.form.subtaskPlaceholder',
      'Subtask title; paste several lines to add several'
    ),
    continueCreating: translate('localTasks.form.continueCreating', 'Create another'),
    formHint: translate(
      'localTasks.form.hint',
      'Creating a task only records it; it does not open a workspace. Paste several lines into the subtask field to add several at once.'
    ),
    pastedLines: (count: number): string =>
      translate('localTasks.form.pastedLines', 'Pasted {{count}} lines', { count }),
    pasteAsSubtasks: (count: number): string =>
      translate('localTasks.form.pasteAsSubtasks', 'Create {{count}} subtasks', { count }),
    pasteAsSubtasksHint: (title: string): string =>
      translate('localTasks.form.pasteAsSubtasksHint', 'One per line, under “{{title}}”', {
        title
      }),
    pasteAsTitle: translate('localTasks.form.pasteAsTitle', 'Use as one title'),
    pasteAsTitleHint: translate('localTasks.form.pasteAsTitleHint', 'Line breaks become spaces'),
    savedPartially: translate(
      'localTasks.form.savedPartially',
      'The task was saved, but its subtasks were not. Add them from the task.'
    ),
    subtasksPartiallySaved: translate(
      'localTasks.form.subtasksPartiallySaved',
      'The subtasks were created, but some properties were not saved.'
    ),
    subtasksAlreadyCreated: translate(
      'localTasks.form.subtasksAlreadyCreated',
      'These subtasks already exist. Finish saving them or view them from their parent.'
    ),
    retrySavingSubtasks: translate(
      'localTasks.form.retrySavingSubtasks',
      'Retry saving properties'
    ),
    viewCreatedSubtasks: translate('localTasks.form.viewCreatedSubtasks', 'View created subtasks')
  }
}
