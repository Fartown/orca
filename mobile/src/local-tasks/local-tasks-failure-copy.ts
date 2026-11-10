import type { LocalTaskFailureCode } from '../../../src/shared/local-tasks/local-task-types'
import { translate } from '../i18n/mobile-i18n'

/** What the phone says when the host's Orca refuses or loses a write. */
export function localTasksFailureCopy() {
  return {
    failures: {
      not_found: translate(
        'localTasks.failure.notFound',
        'It no longer exists. The list has been refreshed.'
      ),
      stale: translate(
        'localTasks.failure.stale',
        'Someone changed this in the meantime. The latest version is shown; try again.'
      ),
      read_only: translate(
        'localTasks.failure.readOnly',
        'Tasks are read-only here because a newer version of Orca wrote them.'
      ),
      invalid_argument: translate(
        'localTasks.failure.invalidArgument',
        "This host's Orca rejected these values. Check the form and try again."
      ),
      prefix_taken: (owner: string): string =>
        owner
          ? translate(
              'localTasks.failure.prefixTakenBy',
              'That prefix belongs to the project {{owner}}.',
              { owner }
            )
          : translate('localTasks.failure.prefixTaken', 'That prefix is already used.'),
      prefix_invalid: translate(
        'localTasks.prefix.invalid',
        'Use 1–10 capital letters or digits, starting with a letter.'
      ),
      prefix_history_in_project: translate(
        'localTasks.failure.prefixHistoryInProject',
        'This project already used that prefix for task numbers.'
      ),
      parent_invalid: translate(
        'localTasks.failure.parentInvalid',
        'That parent cannot hold this task: it must be in the same project, and not the task itself or one under it.'
      ),
      status_invalid: translate(
        'localTasks.failure.statusInvalid',
        'That status does not belong to this project.'
      ),
      // The detail arrives as text, so it can't be i18next's numeric `count`.
      status_in_use: (taskCount: string): string =>
        translate(
          'localTasks.failure.statusInUse',
          '{{taskCount}} tasks still use this status. Pick where to move them first.',
          { taskCount }
        ),
      last_status_in_category: translate(
        'localTasks.failure.lastStatusInCategory',
        'Each category keeps at least one status.'
      ),
      comment_not_editable: translate(
        'localTasks.failure.commentNotEditable',
        'Only comments can be edited.'
      ),
      // The detail is the holder's ref; the caller swaps in its title when it has the task.
      workspace_already_linked: (task: string): string =>
        task
          ? translate(
              'localTasks.failure.workspaceAlreadyLinkedTo',
              'This workspace already belongs to “{{task}}”. Unlink it there first.',
              { task }
            )
          : translate(
              'localTasks.failure.workspaceAlreadyLinked',
              'This workspace already belongs to another task.'
            ),
      task_has_workspace: (name: string): string =>
        name
          ? translate(
              'localTasks.failure.taskHasWorkspaceNamed',
              'This task already works in “{{name}}”. Unlink it first.',
              { name }
            )
          : translate(
              'localTasks.failure.taskHasWorkspace',
              'This task already has a workspace. Unlink it first.'
            ),
      workspace_required: translate(
        'localTasks.failure.workspaceRequired',
        'Link or start a workspace for the task first.'
      ),
      session_already_linked: (task: string): string =>
        task
          ? translate(
              'localTasks.failure.sessionAlreadyLinkedTo',
              'This session is already linked to “{{task}}”.',
              { task }
            )
          : translate(
              'localTasks.failure.sessionAlreadyLinked',
              'This session is already linked to a task.'
            ),
      host_not_owned: translate(
        'localTasks.failure.hostNotOwned',
        "That workspace or session is on another Orca; link it in that host's tasks."
      ),
      desktop_only: translate(
        'localTasks.failure.desktopOnly',
        'Only a desktop or web client can do this, not the phone.'
      ),
      attention_item_mismatch: translate(
        'localTasks.failure.attentionItemMismatch',
        'That item belongs to another session, so nothing was marked.'
      )
    } satisfies Record<LocalTaskFailureCode, string | ((detail: string) => string)>,
    failureGeneric: (code: string): string =>
      translate('localTasks.failure.generic', "This host's Orca refused this ({{code}}).", {
        code
      }),
    deliveryUnknown: translate(
      'localTasks.failure.deliveryUnknown',
      "The connection dropped before this host's Orca answered. Try again; it will not be applied twice."
    ),
    writeError: (message: string): string =>
      translate('localTasks.failure.writeError', 'Could not save the change: {{message}}', {
        message
      })
  }
}
