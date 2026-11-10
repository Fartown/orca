import { useNow } from '@/hooks/use-now'
import { useLocalTaskProposals } from '@/local-tasks/local-task-dispatcher-proposals'
import { useLocalTaskDispatcherPane } from '@/local-tasks/local-task-dispatcher-session'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import { LocalTaskProposalCard, useProposalNames } from './LocalTaskProposalCard'

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
  const pending = useLocalTaskProposals((state) => state.pending)
  const unrun = useLocalTaskProposals((state) => state.unrun)
  const claimed = useLocalTaskProposals((state) => state.claimed)
  const names = useProposalNames()
  const now = useNow(60_000)
  const ours = live && paneKey !== null && parsePaneKey(paneKey)?.tabId === tabId
  const waiting = [...pending, ...unrun, ...claimed]
  if (!ours || waiting.length === 0) {
    return null
  }
  return (
    <div className="flex max-h-[50%] shrink-0 flex-col gap-2 overflow-y-auto px-3 pt-2 scrollbar-sleek">
      {waiting.map((proposal) => (
        <LocalTaskProposalCard key={proposal.id} proposal={proposal} names={names} now={now} />
      ))}
    </div>
  )
}
