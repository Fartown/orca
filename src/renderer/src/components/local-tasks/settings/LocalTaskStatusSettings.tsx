import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { ImeInput } from '@/lib/ime-text-field'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { isImeCompositionKeyDown } from '@/lib/ime-composition-keyboard-event'
import {
  LOCAL_TASK_STATUS_CATEGORIES,
  LOCAL_TASK_STATUS_COLORS,
  LOCAL_TASK_STATUS_NAME_MAX,
  type LocalTaskStatusCategory,
  type LocalTaskStatusColor
} from '../../../../../shared/local-tasks/local-task-model'
import type {
  LocalTaskProject,
  LocalTaskStatusDef
} from '../../../../../shared/local-tasks/local-task-types'
import {
  localTaskCategoryLabel,
  localTaskColorLabel
} from '@/local-tasks/local-task-vocabulary-copy'
import { localTasksClient } from '@/local-tasks/local-tasks-runtime-client'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { runLocalTaskWrite } from '@/local-tasks/local-task-writes'
import { LocalTaskStatusIcon, localTaskStatusColorVar } from '../LocalTaskIcons'
import { LocalTaskStatusRemoveDialog } from './LocalTaskStatusRemoveDialog'
import { LOCAL_TASK_INLINE_FIELD } from '../local-task-inline-field'

function ColorPicker({
  status,
  disabled
}: {
  status: LocalTaskStatusDef
  disabled: boolean
}): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={translate('localTasks.settings.statusColor', 'Status color')}
        >
          <span
            className="size-3 rounded-full"
            style={{ backgroundColor: localTaskStatusColorVar(status.color) }}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={status.color}
          onValueChange={(next) => {
            const color = LOCAL_TASK_STATUS_COLORS.find((candidate) => candidate === next)
            if (color) {
              void saveStatus(status, status.name, color)
            }
          }}
        >
          {LOCAL_TASK_STATUS_COLORS.map((color) => (
            <DropdownMenuRadioItem key={color} value={color}>
              <span
                className="size-3 rounded-full"
                style={{ backgroundColor: localTaskStatusColorVar(color) }}
              />
              {localTaskColorLabel(color)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function saveStatus(status: LocalTaskStatusDef, name: string, color: LocalTaskStatusColor) {
  return runLocalTaskWrite(() =>
    localTasksClient.upsertStatus({ projectId: status.projectId, statusId: status.id, name, color })
  )
}

/** Moves a status one step within its category; positions only matter inside a category. */
function reorder(project: LocalTaskProject, status: LocalTaskStatusDef, delta: -1 | 1): void {
  const ids = project.statuses.map((candidate) => candidate.id)
  const from = ids.indexOf(status.id)
  const neighbour = project.statuses[from + delta]
  if (!neighbour || neighbour.category !== status.category) {
    return
  }
  ids[from] = neighbour.id
  ids[from + delta] = status.id
  void runLocalTaskWrite(() =>
    localTasksClient.reorderStatuses({ projectId: project.id, orderedStatusIds: ids })
  )
}

function StatusRow({
  project,
  status,
  siblings,
  position,
  usage,
  writable,
  onRemove
}: {
  project: LocalTaskProject
  status: LocalTaskStatusDef
  siblings: number
  position: number
  usage: number
  writable: boolean
  onRemove: () => void
}): React.JSX.Element {
  const [name, setName] = useState(status.name)
  const commit = (): void => {
    const next = name.trim()
    if (!next || next === status.name) {
      setName(status.name)
      return
    }
    void saveStatus(status, next, status.color)
  }
  return (
    <div className="flex h-9 items-center gap-1.5 pr-1 pl-2">
      <ColorPicker status={status} disabled={!writable} />
      <ImeInput
        value={name}
        disabled={!writable}
        maxLength={LOCAL_TASK_STATUS_NAME_MAX}
        onChange={(event) => setName(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !isImeCompositionKeyDown(event)) {
            event.currentTarget.blur()
          }
        }}
        aria-label={translate('localTasks.settings.statusName', 'Status name')}
        className={cn(LOCAL_TASK_INLINE_FIELD, 'h-7 flex-1 text-[13px] text-foreground')}
      />
      <span className="w-16 shrink-0 text-right text-2xs text-muted-foreground">
        {translate('localTasks.settings.statusUsage', 'Tasks: {{count}}', { count: usage })}
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        disabled={!writable || position === 0}
        onClick={() => reorder(project, status, -1)}
        aria-label={translate('localTasks.settings.moveUp', 'Move up')}
      >
        <ArrowUp className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        disabled={!writable || position === siblings - 1}
        onClick={() => reorder(project, status, 1)}
        aria-label={translate('localTasks.settings.moveDown', 'Move down')}
      >
        <ArrowDown className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        // Why: each category keeps at least one status (REQ-003).
        disabled={!writable || siblings <= 1}
        onClick={onRemove}
        aria-label={translate('localTasks.settings.removeStatus', 'Remove status')}
        title={
          siblings <= 1
            ? translate(
                'localTasks.failure.lastStatusInCategory',
                'Each category needs at least one status.'
              )
            : undefined
        }
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}

function addStatus(project: LocalTaskProject, category: LocalTaskStatusCategory): void {
  void runLocalTaskWrite(() =>
    localTasksClient.upsertStatus({
      projectId: project.id,
      category,
      name: translate('localTasks.settings.newStatusName', 'New status'),
      color: 'gray'
    })
  )
}

/** Statuses by fixed category: add, rename, recolor, reorder, remove (REQ-003). */
export function LocalTaskStatusSettings({
  project,
  writable
}: {
  project: LocalTaskProject
  writable: boolean
}): React.JSX.Element {
  const tasks = useLocalTasksDomain((state) => state.tasks)
  const [removing, setRemoving] = useState<LocalTaskStatusDef | null>(null)
  const usage = useMemo(() => {
    const counts = new Map<string, number>()
    for (const task of tasks) {
      counts.set(task.statusId, (counts.get(task.statusId) ?? 0) + 1)
    }
    return counts
  }, [tasks])
  return (
    <section className="flex flex-col gap-2">
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-foreground">
          {translate('localTasks.settings.statusesTitle', 'Statuses')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {translate(
            'localTasks.settings.statusesHelp',
            'The six categories are fixed. A status never changes category, and each category keeps at least one. Board columns are these statuses.'
          )}
        </p>
      </div>
      <div className="divide-y divide-border/60 rounded-md border border-border/60">
        {LOCAL_TASK_STATUS_CATEGORIES.map((category) => {
          const statuses = project.statuses.filter((status) => status.category === category)
          return (
            <div key={category}>
              <div className="flex h-8 items-center gap-2 bg-muted/30 pr-1 pl-2.5 text-xs text-muted-foreground">
                <LocalTaskStatusIcon category={category} color="gray" />
                {localTaskCategoryLabel(category)}
                <Button
                  variant="ghost"
                  size="xs"
                  className="ml-auto"
                  disabled={!writable}
                  onClick={() => addStatus(project, category)}
                >
                  <Plus className="size-3" />
                  {translate('localTasks.settings.addStatus', 'Add status')}
                </Button>
              </div>
              {statuses.map((status, position) => (
                <StatusRow
                  key={`${status.id}:${status.name}`}
                  project={project}
                  status={status}
                  siblings={statuses.length}
                  position={position}
                  usage={usage.get(status.id) ?? 0}
                  writable={writable}
                  onRemove={() => setRemoving(status)}
                />
              ))}
            </div>
          )
        })}
      </div>
      {removing ? (
        <LocalTaskStatusRemoveDialog
          project={project}
          status={removing}
          usage={usage.get(removing.id) ?? 0}
          onClose={() => setRemoving(null)}
        />
      ) : null}
    </section>
  )
}
