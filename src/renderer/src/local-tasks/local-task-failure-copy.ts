import { translate } from '@/i18n/i18n'
import type { LocalTaskFailure } from '../../../shared/local-tasks/local-task-types'

/** What the user reads when the task library refuses a change. */
export function describeLocalTaskFailure(failure: LocalTaskFailure): string {
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
    case 'prefix_invalid':
      return translate(
        'localTasks.failure.prefixInvalid',
        'Use 1–10 letters or digits for the prefix, starting with a letter.'
      )
    case 'orca_project_linked':
      return failure.detail
        ? translate(
            'localTasks.failure.orcaProjectLinkedTo',
            'This Orca project already belongs to task project "{{project}}".',
            { project: failure.detail }
          )
        : translate(
            'localTasks.failure.orcaProjectLinked',
            'This Orca project already belongs to a task project.'
          )
    case 'parent_invalid':
      return translate(
        'localTasks.failure.parentInvalid',
        'A parent must be a top-level task in the same project, and a task with subtasks cannot become a subtask.'
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
    case 'workspace_linked':
      return translate(
        'localTasks.failure.workspaceLinked',
        'This task has a linked workspace or session. Unlink it first, then try again.'
      )
  }
}
