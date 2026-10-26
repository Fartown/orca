import { useMemo, useState } from 'react'
import { Check, Plus } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import {
  LOCAL_TASK_LABEL_MAX,
  LOCAL_TASK_PRIORITIES,
  LOCAL_TASK_STATUS_CATEGORIES
} from '../../../../shared/local-tasks/local-task-model'
import type { LocalTask } from '../../../../shared/local-tasks/local-task-types'
import { collectLocalTaskLabels } from '@/local-tasks/local-task-grouping'
import {
  localTaskPageStore,
  useLocalTaskPage,
  type LocalTaskPickerKind
} from '@/local-tasks/local-task-page-store'
import {
  localTaskCategoryLabel,
  localTaskPriorityLabel
} from '@/local-tasks/local-task-vocabulary-copy'
import {
  setLocalTasksPriority,
  setLocalTasksStatus,
  toggleLocalTasksLabel
} from '@/local-tasks/local-task-writes'
import { LocalTaskPriorityIcon, LocalTaskStatusIcon } from './LocalTaskIcons'
import { useLocalTaskIndex } from './use-local-task-list-model'
import { useLocalTaskEscapeLayer } from './use-local-task-page-keys'

function close(): void {
  localTaskPageStore.getState().closePicker()
}

function StatusOptions({ targets }: { targets: LocalTask[] }): React.JSX.Element {
  const { index } = useLocalTaskIndex()
  const projectIds = new Set(targets.map((task) => task.projectId))
  const project = projectIds.size === 1 ? index.projectsById.get([...projectIds][0]) : undefined
  if (project) {
    return (
      <CommandGroup>
        {project.statuses.map((status) => (
          <CommandItem
            key={status.id}
            value={`${status.name} ${status.id}`}
            onSelect={() => {
              close()
              void setLocalTasksStatus(targets, { statusId: status.id })
            }}
          >
            <LocalTaskStatusIcon category={status.category} color={status.color} />
            {status.name}
          </CommandItem>
        ))}
      </CommandGroup>
    )
  }
  // Why categories: tasks from several projects share no status, only its category.
  return (
    <CommandGroup>
      {LOCAL_TASK_STATUS_CATEGORIES.map((category) => (
        <CommandItem
          key={category}
          value={localTaskCategoryLabel(category)}
          onSelect={() => {
            close()
            void setLocalTasksStatus(targets, { category })
          }}
        >
          <LocalTaskStatusIcon category={category} color="gray" />
          {localTaskCategoryLabel(category)}
        </CommandItem>
      ))}
    </CommandGroup>
  )
}

function LabelOptions({
  targets,
  query
}: {
  targets: LocalTask[]
  query: string
}): React.JSX.Element {
  const { tasks } = useLocalTaskIndex()
  const labels = useMemo(() => collectLocalTaskLabels(tasks), [tasks])
  const typed = query.trim().slice(0, LOCAL_TASK_LABEL_MAX)
  return (
    <CommandGroup>
      {labels.map((label) => {
        const onAll = targets.every((task) => task.labels.includes(label))
        return (
          <CommandItem
            key={label}
            value={label}
            onSelect={() => void toggleLocalTasksLabel(targets, label)}
          >
            <Check className={onAll ? 'size-3.5' : 'size-3.5 opacity-0'} />
            {label}
          </CommandItem>
        )
      })}
      {typed && !labels.includes(typed) ? (
        <CommandItem
          value={`+ ${typed}`}
          onSelect={() => void toggleLocalTasksLabel(targets, typed)}
        >
          <Plus className="size-3.5" />
          {translate('localTasks.picker.createLabel', 'Add label “{{label}}”', { label: typed })}
        </CommandItem>
      ) : null}
    </CommandGroup>
  )
}

function PickerBody({
  kind,
  targets
}: {
  kind: LocalTaskPickerKind
  targets: LocalTask[]
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const subject =
    targets.length === 1
      ? targets[0].ref
      : translate('localTasks.picker.taskCount', '{{count}} tasks', { count: targets.length })
  const title =
    kind === 'priority'
      ? translate('localTasks.picker.priorityTitle', 'Priority · {{subject}}', { subject })
      : kind === 'labels'
        ? translate('localTasks.picker.labelsTitle', 'Labels · {{subject}}', { subject })
        : translate('localTasks.picker.statusTitle', 'Status · {{subject}}', { subject })
  return (
    <>
      <DialogTitle className="sr-only">{title}</DialogTitle>
      <Command surface="inline" density="menu">
        <div className="pb-2 text-xs text-muted-foreground">{title}</div>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={
            kind === 'labels'
              ? translate('localTasks.picker.labelPlaceholder', 'Find or add a label')
              : translate('localTasks.picker.placeholder', 'Type to filter')
          }
        />
        <CommandList>
          <CommandEmpty>{translate('localTasks.picker.empty', 'Nothing matches.')}</CommandEmpty>
          {kind === 'status' ? <StatusOptions targets={targets} /> : null}
          {kind === 'labels' ? <LabelOptions targets={targets} query={query} /> : null}
          {kind === 'priority' ? (
            <CommandGroup>
              {LOCAL_TASK_PRIORITIES.map((priority) => (
                <CommandItem
                  key={priority}
                  value={localTaskPriorityLabel(priority)}
                  onSelect={() => {
                    close()
                    void setLocalTasksPriority(targets, priority)
                  }}
                >
                  <LocalTaskPriorityIcon priority={priority} />
                  {localTaskPriorityLabel(priority)}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      </Command>
    </>
  )
}

/** The S / P / L picker for the focused task or the selection. */
export function LocalTaskQuickPicker(): React.JSX.Element {
  const picker = useLocalTaskPage((state) => state.picker)
  const { index } = useLocalTaskIndex()
  const targets = (picker?.taskIds ?? []).flatMap((taskId) => {
    const task = index.tasksById.get(taskId)
    return task ? [task] : []
  })
  const open = picker !== null && targets.length > 0
  useLocalTaskEscapeLayer('dialog', open, close)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          close()
        }
      }}
    >
      <DialogContent
        data-local-task-overlay=""
        aria-describedby={undefined}
        showCloseButton={false}
        className="sm:max-w-sm"
      >
        {picker ? <PickerBody kind={picker.kind} targets={targets} /> : null}
      </DialogContent>
    </Dialog>
  )
}
