import { useState } from 'react'
import { Check, ChevronDown, CornerDownRight, FolderKanban, Plus, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import {
  LOCAL_TASK_LABEL_MAX,
  LOCAL_TASK_LABELS_MAX,
  LOCAL_TASK_PRIORITIES,
  type LocalTaskPriority
} from '../../../../shared/local-tasks/local-task-model'
import type { LocalTask, LocalTaskProject } from '../../../../shared/local-tasks/local-task-types'
import { localTaskPriorityLabel } from '@/local-tasks/local-task-vocabulary-copy'
import { LocalTaskPriorityIcon, LocalTaskStatusIcon } from './LocalTaskIcons'

const TRIGGER = 'max-w-full'

export function LocalTaskStatusSelect({
  project,
  value,
  onChange,
  disabled
}: {
  project: LocalTaskProject | undefined
  value: string | null
  onChange: (statusId: string) => void
  disabled?: boolean
}): React.JSX.Element {
  const current = project?.statuses.find((status) => status.id === value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled || !project}>
        <Button variant="outline" size="xs" className={TRIGGER}>
          {current ? (
            <LocalTaskStatusIcon category={current.category} color={current.color} />
          ) : null}
          <span className="truncate">
            {current?.name ?? translate('localTasks.field.status', 'Status')}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={value ?? ''} onValueChange={onChange}>
          {project?.statuses.map((status) => (
            <DropdownMenuRadioItem key={status.id} value={status.id}>
              <LocalTaskStatusIcon category={status.category} color={status.color} />
              {status.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function LocalTaskPrioritySelect({
  value,
  onChange,
  disabled
}: {
  value: LocalTaskPriority
  onChange: (priority: LocalTaskPriority) => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button variant="outline" size="xs" className={TRIGGER}>
          <LocalTaskPriorityIcon priority={value} />
          <span className="truncate">{localTaskPriorityLabel(value)}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={String(value)}
          onValueChange={(next) => {
            const priority = LOCAL_TASK_PRIORITIES.find((candidate) => String(candidate) === next)
            if (priority !== undefined) {
              onChange(priority)
            }
          }}
        >
          {LOCAL_TASK_PRIORITIES.map((priority) => (
            <DropdownMenuRadioItem key={priority} value={String(priority)}>
              <LocalTaskPriorityIcon priority={priority} />
              {localTaskPriorityLabel(priority)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function LocalTaskProjectSelect({
  projects,
  value,
  onChange,
  disabled
}: {
  projects: readonly LocalTaskProject[]
  value: string | null
  onChange: (projectId: string) => void
  disabled?: boolean
}): React.JSX.Element {
  const current = projects.find((project) => project.id === value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button variant="outline" size="xs" className={TRIGGER}>
          <FolderKanban className="size-3.5" />
          <span className="truncate">
            {current?.name ?? translate('localTasks.field.project', 'Project')}
          </span>
          {current ? (
            <span className="font-mono text-2xs text-muted-foreground">{current.prefix}</span>
          ) : null}
          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={value ?? ''} onValueChange={onChange}>
          {projects.map((project) => (
            <DropdownMenuRadioItem key={project.id} value={project.id}>
              {project.name}
              <span className="font-mono text-2xs text-muted-foreground">{project.prefix}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Toggle existing labels or type a new one; `suggestions` are labels used anywhere. */
export function LocalTaskLabelsPicker({
  value,
  suggestions,
  onToggle,
  disabled
}: {
  value: readonly string[]
  suggestions: readonly string[]
  onToggle: (label: string) => void
  disabled?: boolean
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const typed = query.trim().slice(0, LOCAL_TASK_LABEL_MAX)
  const options = [...new Set([...value, ...suggestions])]
  const full = value.length >= LOCAL_TASK_LABELS_MAX
  return (
    <Popover onOpenChange={() => setQuery('')}>
      <PopoverTrigger asChild disabled={disabled}>
        <Button variant="outline" size="xs" className={TRIGGER}>
          <Tag className="size-3.5" />
          <span className="truncate">
            {value.length > 0 ? value.join(', ') : translate('localTasks.field.labels', 'Labels')}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60">
        <Command surface="inline" density="menu">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={translate('localTasks.picker.labelPlaceholder', 'Find or add a label')}
          />
          <CommandList>
            <CommandEmpty>{translate('localTasks.picker.empty', 'Nothing matches.')}</CommandEmpty>
            <CommandGroup>
              {options.map((label) => {
                const checked = value.includes(label)
                return (
                  <CommandItem
                    key={label}
                    value={label}
                    disabled={!checked && full}
                    onSelect={() => onToggle(label)}
                  >
                    <Check className={cn('size-3.5', !checked && 'opacity-0')} />
                    {label}
                  </CommandItem>
                )
              })}
              {typed && !options.includes(typed) && !full ? (
                <CommandItem value={`+ ${typed}`} onSelect={() => onToggle(typed)}>
                  <Plus className="size-3.5" />
                  {translate('localTasks.picker.createLabel', 'Add label “{{label}}”', {
                    label: typed
                  })}
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Top-level tasks of the same project; a subtask cannot carry subtasks (REQ-004). */
export function LocalTaskParentPicker({
  candidates,
  value,
  onChange,
  disabled
}: {
  candidates: readonly LocalTask[]
  value: string | null
  onChange: (parentId: string | null) => void
  disabled?: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const current = candidates.find((task) => task.id === value)
  const choose = (parentId: string | null): void => {
    setOpen(false)
    onChange(parentId)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <Button variant="outline" size="xs" className={TRIGGER}>
          <CornerDownRight className="size-3.5" />
          <span className="truncate">
            {current
              ? `${current.ref} ${current.title}`
              : translate('localTasks.field.parent', 'Parent task')}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <Command surface="inline" density="menu">
          <CommandInput
            placeholder={translate('localTasks.picker.parentPlaceholder', 'Find a task')}
          />
          <CommandList>
            <CommandEmpty>{translate('localTasks.picker.empty', 'Nothing matches.')}</CommandEmpty>
            <CommandGroup>
              <CommandItem value="-" onSelect={() => choose(null)}>
                <Check className={cn('size-3.5', value !== null && 'opacity-0')} />
                {translate('localTasks.field.noParent', 'No parent')}
              </CommandItem>
              {candidates.map((task) => (
                <CommandItem
                  key={task.id}
                  value={`${task.ref} ${task.title}`}
                  onSelect={() => choose(task.id)}
                >
                  <Check className={cn('size-3.5', task.id !== value && 'opacity-0')} />
                  <span className="font-mono text-2xs text-muted-foreground">{task.ref}</span>
                  <span className="truncate">{task.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
