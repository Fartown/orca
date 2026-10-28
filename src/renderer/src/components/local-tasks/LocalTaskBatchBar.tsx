import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { translate } from '@/i18n/i18n'
import {
  localTaskPageStore,
  useLocalTaskPage,
  type LocalTaskPickerKind
} from '@/local-tasks/local-task-page-store'
import { useCanWriteLocalTaskRows } from '@/local-tasks/local-task-write-access'
import type { LocalTaskListModel } from './use-local-task-list-model'

function PickerButton({
  kind,
  label,
  shortcut,
  taskIds,
  disabled
}: {
  kind: LocalTaskPickerKind
  label: string
  shortcut: string
  taskIds: string[]
  disabled: boolean
}): React.JSX.Element {
  return (
    <Button
      variant="outline"
      size="xs"
      disabled={disabled}
      onClick={() => localTaskPageStore.getState().openPicker(kind, taskIds)}
    >
      {label}
      <ShortcutKeyCombo keys={[shortcut]} keyCapClassName="min-w-4 px-1 py-0 text-3xs" />
    </Button>
  )
}

/** Multi-select actions: one batch write per change (REQ-006). */
export function LocalTaskBatchBar({ model }: { model: LocalTaskListModel }): React.JSX.Element {
  const selected = useLocalTaskPage((state) => state.selectedTaskIds)
  // Why: a task deleted elsewhere drops out of the batch instead of failing it.
  const taskIds = selected.filter((taskId) => model.index.tasksById.has(taskId))
  // Why every task: a batch spanning a read-only or unreachable library would fail part-way.
  const writable = useCanWriteLocalTaskRows(taskIds)
  return (
    <div
      role="toolbar"
      aria-label={translate('localTasks.batch.label', 'Selected tasks')}
      className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1"
    >
      <span className="text-xs text-foreground">
        {translate('localTasks.batch.count', '{{count}} selected', { count: taskIds.length })}
      </span>
      <PickerButton
        kind="status"
        label={translate('localTasks.batch.status', 'Status')}
        shortcut="S"
        taskIds={taskIds}
        disabled={!writable}
      />
      <PickerButton
        kind="priority"
        label={translate('localTasks.batch.priority', 'Priority')}
        shortcut="P"
        taskIds={taskIds}
        disabled={!writable}
      />
      <PickerButton
        kind="labels"
        label={translate('localTasks.batch.labels', 'Labels')}
        shortcut="L"
        taskIds={taskIds}
        disabled={!writable}
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
