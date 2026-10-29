import { translate } from '@/i18n/i18n'
import type { LocalTaskFailure } from '../../../shared/local-tasks/local-task-types'

/** What the user reads when the task library refuses a change. */
export function describeLocalTaskFailure(
  failure: LocalTaskFailure | { ok: false; code: string; detail?: string }
): string {
  switch (failure.code) {
    case 'not_found':
      return translate('localTasks.failure.notFound', 'This item no longer exists.')
    case 'stale':
      return translate(
        'localTasks.failure.stale',
        'This was changed somewhere else first. The latest version is shown now; make your change again.'
      )
    case 'read_only':
      return translate(
        'localTasks.failure.readOnly',
        'Tasks are read-only here because a newer version of Orca wrote them.'
      )
    case 'prefix_taken':
      return failure.detail
        ? translate(
            'localTasks.failure.prefixTakenBy',
            'The prefix is already used by project "{{project}}", now or as an earlier prefix.',
            { project: failure.detail }
          )
        : translate(
            'localTasks.failure.prefixTaken',
            'The prefix is already used by another project.'
          )
    case 'prefix_history_in_project':
      return translate(
        'localTasks.failure.prefixHistoryInProject',
        'This prefix was used by tasks moved into this project. Choose another prefix to keep their refs unambiguous.'
      )
    case 'prefix_invalid':
      return translate(
        'localTasks.failure.prefixInvalid',
        'Use 1–10 letters or digits for the prefix, starting with a letter.'
      )
    case 'parent_invalid':
      return translate(
        'localTasks.failure.parentInvalidTree',
        'A parent must be in the same project, and a task cannot go under itself or one of its own subtasks.'
      )
    case 'status_invalid':
      return translate(
        'localTasks.failure.statusInvalid',
        'That status does not belong to this task’s project.'
      )
    case 'status_in_use':
      return translate(
        'localTasks.failure.statusInUse',
        'Tasks still use this status. Choose a status to move them to first.'
      )
    case 'last_status_in_category':
      return translate(
        'localTasks.failure.lastStatusInCategory',
        'Each category needs at least one status.'
      )
    case 'comment_not_editable':
      return translate('localTasks.failure.commentNotEditable', 'Only comments can be edited.')
    case 'workspace_already_linked':
      return failure.detail
        ? translate(
            'localTasks.failure.workspaceAlreadyLinkedTo',
            'This workspace already belongs to {{name}}. Unlink it there first.',
            { name: failure.detail }
          )
        : translate(
            'localTasks.failure.workspaceAlreadyLinked',
            'This workspace already belongs to another task.'
          )
    case 'task_has_workspace':
      return failure.detail
        ? translate(
            'localTasks.failure.taskHasWorkspaceNamed',
            'This task already works in “{{name}}”. Unlink it first, or start over to replace it.',
            { name: failure.detail }
          )
        : translate(
            'localTasks.failure.taskHasWorkspace',
            'This task already has a workspace. Unlink it first, or start over to replace it.'
          )
    case 'workspace_required':
      return translate(
        'localTasks.failure.workspaceRequiredTree',
        'Start or link a workspace for this task or one of its parents first.'
      )
    case 'session_already_linked':
      return failure.detail
        ? translate(
            'localTasks.failure.sessionAlreadyLinkedTo',
            'This session is already linked to {{task}}.',
            { task: failure.detail }
          )
        : translate(
            'localTasks.failure.sessionAlreadyLinked',
            'This session is already linked to a task.'
          )
    case 'host_not_owned':
      return translate(
        'localTasks.failure.hostNotOwned',
        'This workspace runs on another Orca, so it can’t be linked to a task kept here.'
      )
    case 'desktop_only':
      return translate('localTasks.failure.notFromPhone', 'This can’t be done from the phone.')
    case 'attention_item_mismatch':
      return translate(
        'localTasks.failure.attentionItemMismatch',
        'This item belongs to another session, so nothing was marked.'
      )
    case 'invalid_argument':
      return translate(
        'localTasks.failure.invalidArgument',
        'This change could not be saved. Check the fields and try again.'
      )
    default:
      return translate(
        'localTasks.failure.invalidArgument',
        'This change could not be saved. Check the fields and try again.'
      )
  }
}
