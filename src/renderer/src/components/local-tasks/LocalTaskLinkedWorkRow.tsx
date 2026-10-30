import { ListTodo, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useLocalTaskSourceTab } from '@/local-tasks/local-task-source-tab'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { useLocalTaskRowWriteReason } from '@/local-tasks/local-task-write-reason'
import { LocalTaskActionTooltip } from './LocalTaskActionTooltip'

function useDraftTaskId(): string | null {
  const tab = useLocalTaskSourceTab()
  return tab?.draft ? tab.selectedTaskId : null
}

/** 1 while workspace details holds a task for this workspace, so "N linked" counts it. */
export function useLocalTaskLinkedWorkCount(): number {
  const taskId = useDraftTaskId()
  return useLocalTasksDomain((state) =>
    taskId !== null && state.tasks.some((task) => task.id === taskId) ? 1 : 0
  )
}

/**
 * The workspace's task in workspace details' "Issues & tasks" (REQ-011), drawn like upstream's
 * linked rows with the title leading. Removing it changes the draft; Save writes it.
 */
export function LocalTaskLinkedWorkRow({
  disabled
}: {
  disabled: boolean
}): React.JSX.Element | null {
  const tab = useLocalTaskSourceTab()
  const taskId = useDraftTaskId()
  const linkedTaskId = tab?.draft?.linkedTaskId ?? null
  const task = useLocalTasksDomain((state) => state.tasks.find((t) => t.id === taskId))
  const projectName = useLocalTasksDomain(
    (state) => state.projects.find((project) => project.id === task?.projectId)?.name ?? ''
  )
  const replaced = useLocalTasksDomain((state) =>
    linkedTaskId !== null && linkedTaskId !== taskId
      ? state.tasks.find((t) => t.id === linkedTaskId)
      : undefined
  )
  const writeReason = useLocalTaskRowWriteReason(task?.id ?? null)
  if (!tab?.draft || !task) {
    return null
  }
  const { remove } = tab.draft
  return (
    <div data-workspace-linked-item="" className="flex min-h-8 min-w-0 items-center gap-1 py-1">
      <ListTodo className="size-3.5 shrink-0 text-muted-foreground" />
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex min-w-0 flex-1 items-baseline gap-2 text-xs">
            <span className="truncate font-medium">{task.title}</span>
            <span className="shrink-0 font-mono text-2xs text-muted-foreground">{task.ref}</span>
            {replaced ? (
              <span className="shrink-0 truncate text-2xs text-muted-foreground">
                {translate('localTasks.sourceTab.replaces', 'Replaces “{{title}}”', {
                  title: replaced.title
                })}
              </span>
            ) : null}
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          <p>{task.title}</p>
          <p>
            {translate('localTasks.sourceTab.rowDetail', '{{ref}} · Local task · {{project}}', {
              ref: task.ref,
              project: projectName
            })}
          </p>
        </TooltipContent>
      </Tooltip>
      <LocalTaskActionTooltip
        reason={writeReason}
        side="top"
        label={translate(
          'localTasks.sourceTab.unlinkHint',
          'Unlink from workspace; the task’s sessions here are unlinked too'
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={disabled || writeReason !== null}
          aria-label={translate('localTasks.sourceTab.unlinkTask', 'Unlink {{title}}', {
            title: task.title
          })}
          onClick={remove}
        >
          <X className="size-3" />
        </Button>
      </LocalTaskActionTooltip>
    </div>
  )
}
