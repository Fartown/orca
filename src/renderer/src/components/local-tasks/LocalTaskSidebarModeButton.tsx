import { useLocalTaskSourceVisible } from '@/local-tasks/local-task-source-visibility'
import { ListTodo } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import {
  chooseLocalTaskSidebarMode,
  useLocalTaskSidebarMode
} from '@/local-tasks/local-task-sidebar-mode'

export function LocalTaskSidebarModeButton(): React.JSX.Element | null {
  const enabled = useLocalTaskSidebarMode()
  const visible = useLocalTaskSourceVisible()
  const label = translate('localTasks.sidebar.toggle', 'Task mode')
  if (!visible) {
    return null
  }
  return (
    <span className="flex shrink-0 text-muted-foreground">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={label}
            aria-pressed={enabled}
            // Why: the same pressed look as the activity toggle beside it, so "on" reads alike.
            className={cn(
              enabled &&
                'bg-foreground/10 text-foreground hover:bg-foreground/15 dark:hover:bg-foreground/15'
            )}
            onClick={() => chooseLocalTaskSidebarMode(!enabled)}
          >
            <ListTodo className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {enabled
            ? translate('localTasks.sidebar.toggleOff', 'Back to workspaces')
            : translate('localTasks.sidebar.toggleOn', 'Show by task')}
        </TooltipContent>
      </Tooltip>
    </span>
  )
}
