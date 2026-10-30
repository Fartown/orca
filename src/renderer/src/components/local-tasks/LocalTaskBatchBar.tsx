import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { translate } from '@/i18n/i18n'
import {
  localTaskPageStore,
  useLocalTaskPage,
  type LocalTaskPickerKind
} from '@/local-tasks/local-task-page-store'
import { useLocalTaskRowsWriteReason } from '@/local-tasks/local-task-write-reason'
import type { LocalTaskListModel } from './use-local-task-list-model'
import { LocalTaskActionTooltip } from './LocalTaskActionTooltip'

function PickerButton({
  kind,
  label,
  shortcut,
  taskIds,
  reason
}: {
  kind: LocalTaskPickerKind
  label: string
  shortcut: string
  taskIds: string[]
  /** Why the whole batch is greyed: one selected task's library takes no change now. */
  reason: string | null
}): React.JSX.Element {
  return (
    <LocalTaskActionTooltip reason={reason}>
      <Button
        variant="outline"
        size="xs"
        disabled={reason !== null || taskIds.length === 0}
        onClick={() => localTaskPageStore.getState().openPicker(kind, taskIds)}
      >
        {label}
        <ShortcutKeyCombo keys={[shortcut]} keyCapClassName="min-w-4 px-1 py-0 text-3xs" />
      </Button>
    </LocalTaskActionTooltip>
  )
}

/** Multi-select actions: one batch write per change (REQ-006). */
export function LocalTaskBatchBar({ model }: { model: LocalTaskListModel }): React.JSX.Element {
  const selected = useLocalTaskPage((state) => state.selectedTaskIds)
  // Why: a task deleted elsewhere drops out of the batch instead of failing it.
  const taskIds = selected.filter((taskId) => model.index.tasksById.has(taskId))
  // Why every task: a batch spanning a read-only or unreachable library would fail part-way.
  const reason = useLocalTaskRowsWriteReason(taskIds)
  return (
    <div
      role="toolbar"
      aria-label={translate('localTasks.batch.label', 'Selected tasks')}
      className="flex items-center gap-2 overflow-hidden rounded-md border border-border/60 bg-muted/30 px-2 py-1"
    >
      <span className="shrink-0 whitespace-nowrap text-xs text-foreground">
        {translate('localTasks.batch.count', '{{count}} selected', { count: taskIds.length })}
      </span>
      <PickerButton
        kind="status"
        label={translate('localTasks.batch.status', 'Status')}
        shortcut="S"
        taskIds={taskIds}
        reason={reason}
      />
      <PickerButton
        kind="priority"
        label={translate('localTasks.batch.priority', 'Priority')}
        shortcut="P"
        taskIds={taskIds}
        reason={reason}
      />
      <PickerButton
        kind="labels"
        label={translate('localTasks.batch.labels', 'Labels')}
        shortcut="L"
        taskIds={taskIds}
        reason={reason}
      />
      <Button
        variant="ghost"
        size="icon-xs"
        className="ml-auto"
        onClick={() => localTaskPageStore.getState().clearSelection()}
        aria-label={translate('localTasks.batch.clear', 'Clear selection')}
      >
        <X className="size-3.5" />
      </Button>
    </div>
  )
}
