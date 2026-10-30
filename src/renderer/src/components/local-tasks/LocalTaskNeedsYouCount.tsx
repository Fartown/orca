import { translate } from '@/i18n/i18n'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { selectLocalTaskSourceVisible } from '@/local-tasks/local-task-source-visibility'

/**
 * The global Needs you count on the sidebar's Tasks button (§8.2). Reads only the feature's own
 * store, so it mounts without a provider. It fades while the row's source shortcuts show, and
 * stays hidden where those shortcuts are always shown (no hover), or once Local is hidden.
 */
export function LocalTaskNeedsYouCount(): React.JSX.Element | null {
  const count = useLocalTasksDomain((state) =>
    selectLocalTaskSourceVisible(state) ? (state.progress?.items.length ?? 0) : 0
  )
  if (count === 0) {
    return null
  }
  return (
    <span className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground transition-opacity can-hover:block can-hover:group-hover:opacity-0 can-hover:group-focus-within:opacity-0">
      <span aria-hidden>{count > 99 ? '99+' : count}</span>
      <span className="sr-only">
        {translate('localTasks.needsYou.sidebarCount', '{{count}} sessions need you', { count })}
      </span>
    </span>
  )
}
