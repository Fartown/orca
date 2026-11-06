import { translate } from '@/i18n/i18n'
import type { LocalTaskProposalItem } from '../../../shared/local-tasks/local-task-dispatcher-rpc-params'

/** What a proposal card needs to name the tasks and workspaces an item points at. */
export type LocalTaskProposalNames = {
  taskRef: (taskId: string) => string
  workspace: (worktreeId: string) => string
  repo: (repoId: string) => string
}

export type LocalTaskProposalItemCopy = { title: string; detail: string | null }

/** One line per item as the person reads it before confirming (REQ-030). */
export function describeLocalTaskProposalItem(
  item: LocalTaskProposalItem,
  names: LocalTaskProposalNames
): LocalTaskProposalItemCopy {
  switch (item.kind) {
    case 'start':
      return {
        title:
          'worktreeId' in item.target
            ? translate('localTasks.dispatcher.item.startIn', 'New task “{{title}}” in {{place}}', {
                title: item.title,
                place: names.workspace(item.target.worktreeId)
              })
            : translate(
                'localTasks.dispatcher.item.startNew',
                'New task “{{title}}” in a new workspace of {{place}}',
                { title: item.title, place: names.repo(item.target.repoId) }
              ),
        detail: item.prompt
      }
    case 'subtask':
      return {
        title: translate('localTasks.dispatcher.item.subtask', 'Subtask of {{ref}}: “{{title}}”', {
          ref: names.taskRef(item.parentTaskId),
          title: item.title
        }),
        detail: item.prompt
      }
    case 'append':
      return {
        title: translate('localTasks.dispatcher.item.append', 'Tell the session on {{ref}}', {
          ref: names.taskRef(item.taskId)
        }),
        detail: item.text
      }
    case 'stop':
      return {
        title: translate('localTasks.dispatcher.item.stop', 'Stop the session on {{ref}}', {
          ref: names.taskRef(item.taskId)
        }),
        detail: item.reason
      }
    case 'link':
      return {
        title: translate('localTasks.dispatcher.item.link', 'Link {{ref}} to {{place}}', {
          ref: names.taskRef(item.taskId),
          place: names.workspace(item.target.worktreeId)
        }),
        detail: null
      }
    case 'record':
      return {
        title: translate(
          'localTasks.dispatcher.item.record',
          'Record the work in {{place}} as task “{{title}}”',
          { place: names.workspace(item.target.worktreeId), title: item.title }
        ),
        detail: null
      }
  }
}
