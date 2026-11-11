import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { useMemo } from 'react'
import { translate } from '@/i18n/i18n'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import { collectLocalTaskLabels, type LocalTaskIndex } from '@/local-tasks/local-task-grouping'
import { localTaskParentCandidates } from '../../../../shared/local-tasks/local-task-hierarchy'
import {
  setLocalTasksPriority,
  setLocalTasksStatus,
  toggleLocalTasksLabel,
  updateLocalTaskFields
} from '@/local-tasks/local-task-writes'
import { useLocalTaskRowWriteReason } from '@/local-tasks/local-task-write-reason'
import { LocalTaskActionTooltip } from './LocalTaskActionTooltip'
import {
  LocalTaskLabelsPicker,
  LocalTaskParentPicker,
  LocalTaskPrioritySelect,
  LocalTaskStatusSelect
} from './LocalTaskFieldPickers'

function Property({
  label,
  reason = null,
  children
}: {
  label: string
  /** Why the field is greyed, said on hover. */
  reason?: string | null
  children: React.ReactElement
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="sr-only">{label}</span>{' '}
      <div className="min-w-0">
        <LocalTaskActionTooltip reason={reason} wrapperClassName="flex min-w-0">
          {children}
        </LocalTaskActionTooltip>
      </div>
    </div>
  )
}

/**
 * The task's property chips: status always, the rest once set. "Edit properties…" in the task menu
 * opens every field, unset ones included, anchored on this row.
 */
export function LocalTaskDetailProperties({
  task,
  index,
  allTasks,
  writable,
  expanded = false,
  editing = false,
  onEditingChange
}: {
  task: LocalTask
  index: LocalTaskIndex
  allTasks: readonly LocalTask[]
  writable: boolean
  expanded?: boolean
  editing?: boolean
  onEditingChange?: (open: boolean) => void
}): React.JSX.Element {
  const writeReason = useLocalTaskRowWriteReason(task.id)
  const reason = writable ? null : writeReason
  const project = index.projectsById.get(task.projectId)
  const suggestions = useMemo(() => collectLocalTaskLabels(allTasks), [allTasks])
  const parents = useMemo(
    () => localTaskParentCandidates(task, task.projectId, allTasks, index),
    [allTasks, index, task]
  )

  const chips = (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
      <Property label={translate('localTasks.field.status', 'Status')} reason={reason}>
        <LocalTaskStatusSelect
          project={project}
          value={task.statusId}
          disabled={!writable}
          onChange={(statusId) => void setLocalTasksStatus([task], { statusId })}
        />
      </Property>
      {expanded || task.priority > 0 ? (
        <Property label={translate('localTasks.field.priority', 'Priority')} reason={reason}>
          <LocalTaskPrioritySelect
            value={task.priority}
            disabled={!writable}
            onChange={(priority) => void setLocalTasksPriority([task], priority)}
          />
        </Property>
      ) : null}
      {expanded || task.labels.length > 0 ? (
        <Property label={translate('localTasks.field.labels', 'Labels')} reason={reason}>
          <LocalTaskLabelsPicker
            value={task.labels}
            suggestions={suggestions}
            emptyText={translate('localTasks.field.noLabels', 'No labels')}
            disabled={!writable}
            onToggle={(label) => void toggleLocalTasksLabel([task], label)}
          />
        </Property>
      ) : null}
      {expanded || task.parentId !== null ? (
        <Property label={translate('localTasks.field.parent', 'Parent task')} reason={reason}>
          <LocalTaskParentPicker
            candidates={parents}
            value={task.parentId}
            emptyText={translate('localTasks.field.noParent', 'No parent')}
            disabled={!writable}
            onChange={(parentId) => void updateLocalTaskFields(task, { parentId })}
          />
        </Property>
      ) : null}
    </div>
  )
  if (expanded || !onEditingChange) {
    return chips
  }
  return (
    <Popover open={editing} onOpenChange={onEditingChange}>
      <PopoverAnchor asChild>{chips}</PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-80"
        aria-label={translate('localTasks.detail.properties', 'Task properties')}
      >
        <LocalTaskDetailProperties
          task={task}
          index={index}
          allTasks={allTasks}
          writable={writable}
          expanded
        />
      </PopoverContent>
    </Popover>
  )
}
