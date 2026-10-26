import { ListTodo } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { isWebClientLocation } from '@/lib/web-client-location'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { useLocalTaskPage } from '@/local-tasks/local-task-page-store'
import { activateLocalTaskSource } from '@/local-tasks/local-task-source-activation'

/** True while the task page shows the Local source; a browser client never does. */
export function useLocalTaskSourceActive(): boolean {
  const active = useLocalTaskPage((state) => state.localActive)
  return active && !isWebClientLocation()
}

/** Sits before the upstream sources and matches their button recipe (REQ-008). */
export function LocalTaskSourceButton(): React.JSX.Element | null {
  const active = useLocalTaskSourceActive()
  if (isWebClientLocation()) {
    return null
  }
  const label = translate('localTasks.source.label', 'Local tasks')
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
