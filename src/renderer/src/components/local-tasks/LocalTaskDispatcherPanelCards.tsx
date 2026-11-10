import { useNow } from '@/hooks/use-now'
import { useLocalTaskProposals } from '@/local-tasks/local-task-dispatcher-proposals'
import { LocalTaskProposalCard, useProposalNames } from './LocalTaskProposalCard'

/** The proposals still waiting on the person, as the ledger shows them; nothing when none wait. */
export function LocalTaskDispatcherPanelCards(): React.JSX.Element | null {
  const pending = useLocalTaskProposals((state) => state.pending)
  const unrun = useLocalTaskProposals((state) => state.unrun)
  const claimed = useLocalTaskProposals((state) => state.claimed)
  const names = useProposalNames()
  const now = useNow(60_000)
  const waiting = [...pending, ...unrun, ...claimed]
  if (waiting.length === 0) {
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
