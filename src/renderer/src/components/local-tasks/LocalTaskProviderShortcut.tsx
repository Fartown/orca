import { ListTodo } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { openLocalTaskPage } from '@/local-tasks/local-task-navigation'
import { selectLocalTaskSourceVisible } from '@/local-tasks/local-task-source-visibility'
import {
  LocalTaskNeedsYouBadge,
  localTaskNeedsYouCountLabel,
  useLocalTaskNeedsYouCount
} from './LocalTaskNeedsYouCount'

/**
 * Local's shortcut beside the upstream providers' on the sidebar's Tasks button, with their recipe;
 * like them it goes when the source is hidden, and like every task entry it waits for a project.
 * It carries the Needs you count, which a device without hover would otherwise never see.
 */
export function LocalTaskProviderShortcut(): React.JSX.Element | null {
  const shown = useLocalTasksDomain(
    (state) => selectLocalTaskSourceVisible(state) && state.projects.length > 0
  )
  const count = useLocalTaskNeedsYouCount()
  if (!shown) {
    return null
  }
  const label = translate('localTasks.source.openShortcut', 'Open local tasks')
  const fullLabel = count > 0 ? `${label} · ${localTaskNeedsYouCountLabel(count)}` : label
  return (
    <button
      type="button"
      onClick={() => openLocalTaskPage()}
      className="relative rounded p-0.5 text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-worktree-sidebar-ring"
      aria-label={fullLabel}
      title={fullLabel}
    >
      <ListTodo className="size-3.5" aria-hidden />
      <LocalTaskNeedsYouBadge count={count} />
    </button>
  )
}
