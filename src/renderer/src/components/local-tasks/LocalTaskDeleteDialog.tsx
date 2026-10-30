import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import { localTaskPageStore } from '@/local-tasks/local-task-page-store'
import { localTasksClient } from '@/local-tasks/local-tasks-runtime-client'
import { runLocalTaskWrite } from '@/local-tasks/local-task-writes'
import { useLocalTaskEscapeLayer } from './use-local-task-page-keys'

/** Deleting a task deletes its whole subtree; the dialog says how many go with it (REQ-004). */
export function LocalTaskDeleteDialog({
  task,
  descendantCount,
  open,
  onOpenChange
}: {
  task: LocalTask
  /** Every level below the task. */
  descendantCount: number
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  useLocalTaskEscapeLayer('dialog', open, () => onOpenChange(false))
  const remove = async (): Promise<void> => {
    setBusy(true)
    const result = await runLocalTaskWrite(() => localTasksClient.removeTask(task.id))
    setBusy(false)
    if (!result) {
      return
    }
    onOpenChange(false)
    localTaskPageStore.getState().openDetail(null)
    toast.success(translate('localTasks.delete.done', 'Deleted “{{title}}”', { title: task.title }))
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-local-task-overlay="" size="compact">
        <DialogHeader>
          <DialogTitle>
            {translate('localTasks.delete.title', 'Delete “{{title}}”?', { title: task.title })}
          </DialogTitle>
          <DialogDescription>
            {descendantCount > 0
              ? translate(
                  'localTasks.delete.withSubtasks',
                  'Its subtasks at every level ({{count}}) are deleted with it. Only task records are removed; workspaces and sessions are not touched.',
                  { count: descendantCount }
                )
              : translate(
                  'localTasks.delete.single',
                  'Only the task record is removed; workspaces and sessions are not touched.'
                )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {translate('localTasks.common.cancel', 'Cancel')}
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => void remove()}>
            {translate('localTasks.delete.confirm', 'Delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
