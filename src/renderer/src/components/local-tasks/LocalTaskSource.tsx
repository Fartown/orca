import { ListTodo } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { useLocalTaskPage } from '@/local-tasks/local-task-page-store'
import { activateLocalTaskSource } from '@/local-tasks/local-task-source-activation'
import { useLocalTaskSourceVisible } from '@/local-tasks/local-task-source-visibility'

/** True while the task page shows the Local source; a browser client shows its host's library. */
export function useLocalTaskSourceActive(): boolean {
  return useLocalTaskPage((state) => state.localActive)
}

/**
 * Sits before the upstream sources and matches their button recipe (REQ-008); like them it goes
 * once Settings → Task sources hides it.
 */
export function LocalTaskSourceButton(): React.JSX.Element | null {
  const active = useLocalTaskSourceActive()
  const visible = useLocalTaskSourceVisible()
  const label = translate('localTasks.source.label', 'Local tasks')
  if (!visible && !active) {
    return null
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={activateLocalTaskSource}
          data-task-source="local"
          aria-label={label}
          aria-pressed={active}
          className={cn(
            'group flex h-8 w-8 items-center justify-center rounded-md border transition',
            active
              ? 'border-foreground/40 bg-muted/70 text-foreground shadow-sm'
              : 'border-border/40 bg-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground'
          )}
        >
          <ListTodo className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function LocalTaskSourceSummary(): React.JSX.Element {
  const projectCount = useLocalTasksDomain((state) => state.projects.length)
  const taskCount = useLocalTasksDomain((state) => state.tasks.length)
  const label = translate(
    'localTasks.source.summary',
    'Local tasks · Projects: {{projects}} · Tasks: {{tasks}}',
    { projects: projectCount, tasks: taskCount }
  )
  return (
    <div
      className="hidden min-w-0 max-w-[min(420px,40vw)] items-center rounded-md border border-border/50 bg-muted/35 px-2 py-1 text-xs text-muted-foreground sm:flex"
      title={label}
    >
      <span className="truncate">{label}</span>
    </div>
  )
}
