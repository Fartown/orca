import {
  useLocalTaskLinkDialog,
  localTaskLinkDialogStore
} from '@/local-tasks/local-task-link-dialog-store'
import { findLocalTaskWorkspaceLink } from '@/local-tasks/local-task-link-selectors'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { localTaskEffectiveWorkspace } from '../../../../shared/local-tasks/local-task-tree'
import { LocalTaskSessionDialog } from './LocalTaskSessionDialog'
import { LocalTaskWorkspacePicker } from './LocalTaskWorkspacePicker'
import type { LocalTaskListModel } from './use-local-task-list-model'

/** Keeps task link dialogs alive while the task page switches between list and detail. */
export function LocalTaskLinkDialogHost({
  model
}: {
  model: LocalTaskListModel
}): React.JSX.Element | null {
  const dialog = useLocalTaskLinkDialog()
  const links = useLocalTasksDomain((state) => state.links)
  if (!dialog || dialog.kind === 'pick-task') {
    return null
  }
  const task = model.index.tasksById.get(dialog.taskId)
  if (!task) {
    return null
  }
  const close = (): void => localTaskLinkDialogStore.getState().close()
  if (dialog.kind === 'session') {
    const link = localTaskEffectiveWorkspace(
      task,
      model.index.tasksById,
      new Map(links.workspaces.map((workspace) => [workspace.taskId, workspace]))
    )
    return link ? <LocalTaskSessionDialog task={task} link={link} onClose={close} /> : null
  }
  const project = model.index.projectsById.get(task.projectId)
  return project ? (
    <LocalTaskWorkspacePicker
      task={task}
      project={project}
      replace={findLocalTaskWorkspaceLink(links, task.id) !== null}
      onClose={close}
    />
  ) : null
}
