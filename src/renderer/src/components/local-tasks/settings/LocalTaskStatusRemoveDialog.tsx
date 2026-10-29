import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import type {
  LocalTaskProject,
  LocalTaskStatusDef
} from '../../../../../shared/local-tasks/local-task-types'
import { localTasksClient } from '@/local-tasks/local-tasks-runtime-client'
import { runLocalTaskWrite } from '@/local-tasks/local-task-writes'
import { LocalTaskStatusIcon } from '../LocalTaskIcons'

/** Removing a status that tasks still use asks where those tasks go (REQ-003). */
export function LocalTaskStatusRemoveDialog({
  project,
  status,
  usage,
  onClose
}: {
  project: LocalTaskProject
  status: LocalTaskStatusDef
  usage: number
  onClose: () => void
}): React.JSX.Element {
  const others = project.statuses.filter((candidate) => candidate.id !== status.id)
  const [targetId, setTargetId] = useState(
    (others.find((candidate) => candidate.category === status.category) ?? others[0])?.id ?? ''
  )
  const [busy, setBusy] = useState(false)
  const remove = async (): Promise<void> => {
    setBusy(true)
    const result = await runLocalTaskWrite(() =>
      localTasksClient.removeStatus({
        statusId: status.id,
        moveTasksToStatusId: usage > 0 ? targetId : undefined
      })
    )
    setBusy(false)
    if (result) {
      onClose()
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      <DialogContent size="compact">
        <DialogHeader>
          <DialogTitle>
            {translate('localTasks.settings.removeStatusTitle', 'Remove “{{name}}”?', {
              name: status.name
            })}
          </DialogTitle>
          <DialogDescription>
            {usage > 0
              ? translate(
                  'localTasks.settings.removeStatusInUse',
                  'Tasks using this status: {{count}}. Choose where they go.',
                  { count: usage }
                )
              : translate('localTasks.settings.removeStatusUnused', 'No task uses this status.')}
          </DialogDescription>
        </DialogHeader>
        {usage > 0 ? (
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger
              aria-label={translate('localTasks.settings.moveTasksTo', 'Move tasks to')}
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {others.map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  <LocalTaskStatusIcon category={candidate.category} color={candidate.color} />
                  {candidate.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {translate('localTasks.common.cancel', 'Cancel')}
          </Button>
          <Button
            variant="destructive"
            disabled={busy || (usage > 0 && !targetId)}
            onClick={() => void remove()}
          >
            {translate('localTasks.settings.removeStatusConfirm', 'Remove status')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
