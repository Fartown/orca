import { lazy, Suspense } from 'react'
import { useLocalTaskDispatcherPane } from '@/local-tasks/local-task-dispatcher-pane'
import { parsePaneKey } from '../../../../shared/stable-pane-id'

// Why lazy: hosts mount the dock on every chat pane, so the cards and what runs a proposal load
// only once a pane turns out to be the dispatcher's.
const LocalTaskDispatcherPanelCards = lazy(() =>
  import('./LocalTaskDispatcherPanelCards').then((module) => ({
    default: module.LocalTaskDispatcherPanelCards
  }))
)

/**
 * The proposals still waiting on the person, docked above the dispatcher's own input (d16): the
 * same cards as the ledger. Any other tab gets nothing, so a host can mount it on every pane.
 */
export function LocalTaskDispatcherPanelDock({
  tabId
}: {
  tabId: string
}): React.JSX.Element | null {
  const { paneKey, live } = useLocalTaskDispatcherPane()
  const ours = live && paneKey !== null && parsePaneKey(paneKey)?.tabId === tabId
  return ours ? (
    <Suspense fallback={null}>
      <LocalTaskDispatcherPanelCards />
    </Suspense>
  ) : null
}
