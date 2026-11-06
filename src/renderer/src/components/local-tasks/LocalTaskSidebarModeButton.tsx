import { useLocalTaskSourceVisible } from '@/local-tasks/local-task-source-visibility'
import { ListTree } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
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
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          aria-pressed={enabled}
          onClick={() => chooseLocalTaskSidebarMode(!enabled)}
        >
          <ListTree className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
