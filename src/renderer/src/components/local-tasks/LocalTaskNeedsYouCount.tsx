import { translate } from '@/i18n/i18n'
import { useLocalTasksDomain } from '@/local-tasks/local-tasks-domain-store'
import { selectLocalTaskSourceVisible } from '@/local-tasks/local-task-source-visibility'

/** The global Needs you count (§8.2): every library's items, none once Local is hidden. */
export function useLocalTaskNeedsYouCount(): number {
  return useLocalTasksDomain((state) =>
    selectLocalTaskSourceVisible(state) ? (state.progress?.items.length ?? 0) : 0
  )
}

export function localTaskNeedsYouCountLabel(count: number): string {
  return translate('localTasks.needsYou.sidebarCount', '{{count}} sessions need you', { count })
}

function shownCount(count: number): string {
  return count > 99 ? '99+' : String(count)
}

/**
 * The count on the sidebar's Tasks button. Reads only the feature's own store, so it mounts
 * without a provider. It fades while the row's source shortcuts show, and stays hidden where those
 * shortcuts are always shown (no hover): there the Local shortcut carries it instead.
 */
export function LocalTaskNeedsYouCount(): React.JSX.Element | null {
  const count = useLocalTaskNeedsYouCount()
  if (count === 0) {
    return null
  }
  return (
    <span className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-primary px-1.5 py-px text-3xs font-semibold text-primary-foreground transition-opacity can-hover:block can-hover:group-hover:opacity-0 can-hover:group-focus-within:opacity-0">
      <span aria-hidden>{shownCount(count)}</span>
      <span className="sr-only">{localTaskNeedsYouCountLabel(count)}</span>
    </span>
  )
}

/**
 * The same count pinned to the Local shortcut, so it stays in sight while the shortcuts show; the
 * shortcut's own label carries it for screen readers.
 */
export function LocalTaskNeedsYouBadge({ count }: { count: number }): React.JSX.Element | null {
  if (count === 0) {
    return null
  }
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-3xs font-semibold leading-none text-primary-foreground"
    >
      {shownCount(count)}
    </span>
  )
}
