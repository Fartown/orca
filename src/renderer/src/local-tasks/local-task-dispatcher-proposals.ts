import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { LocalTaskProposal } from '../../../shared/local-tasks/local-task-dispatcher-types'
import { localTaskDispatcherClient } from './local-task-dispatcher-client'
import { executeLocalTaskProposal } from './local-task-proposal-execution'
import { runLocalTaskWrite } from './local-task-writes'

type ProposalsState = {
  pending: LocalTaskProposal[]
  /** Confirmed but never run here: the window closed while it ran, or another window confirmed. */
  unrun: LocalTaskProposal[]
  /** Proposals this window is running now. */
  running: readonly string[]
}

export const localTaskProposalsStore = createStore<ProposalsState>(() => ({
  pending: [],
  unrun: [],
  running: []
}))

export function useLocalTaskProposals<T>(select: (state: ProposalsState) => T): T {
  return useStore(localTaskProposalsStore, select)
}

let latestRead = 0

/** Re-reads the proposals waiting on the person; a slow read never overwrites a later one. */
export async function refreshLocalTaskProposals(): Promise<void> {
  const sequence = ++latestRead
  try {
    const [pending, confirmed] = await Promise.all([
      localTaskDispatcherClient.list('pending'),
      localTaskDispatcherClient.list('confirmed')
    ])
    if (sequence === latestRead) {
      localTaskProposalsStore.setState({
        pending: pending.proposals,
        unrun: confirmed.proposals
      })
    }
  } catch (error) {
    console.error('local tasks: reading the dispatcher’s proposals failed', error)
  }
}

function setRunning(proposalId: string, running: boolean): void {
  localTaskProposalsStore.setState((state) => ({
    running: running
      ? [...state.running, proposalId]
      : state.running.filter((id) => id !== proposalId)
  }))
}

/** Runs a confirmed proposal once in this window and says how it went. */
export async function runLocalTaskProposal(proposal: LocalTaskProposal): Promise<void> {
  if (localTaskProposalsStore.getState().running.includes(proposal.id)) {
    return
  }
  setRunning(proposal.id, true)
  try {
    const results = await executeLocalTaskProposal(proposal)
    if (!results) {
      toast.error(
        translate('localTasks.dispatcher.reportFailed', 'The results could not be recorded.')
      )
      return
    }
    const done = results.filter((result) => result.ok).length
    const message = translate('localTasks.dispatcher.ran', 'Done {{done}} of {{total}}', {
      done,
      total: results.length
    })
    if (done === results.length) {
      toast.success(message)
    } else {
      toast.warning(message)
    }
  } finally {
    setRunning(proposal.id, false)
    void refreshLocalTaskProposals()
  }
}

/** A person's decision (REQ-030); `keep` names the items they kept, all when absent. */
export async function decideLocalTaskProposal(
  proposalId: string,
  decision: 'confirmed' | 'dismissed',
  keep?: number[]
): Promise<void> {
  const decided = await runLocalTaskWrite(() =>
    localTaskDispatcherClient.decide(proposalId, decision, keep)
  )
  if (decided && decision === 'confirmed') {
    await runLocalTaskProposal(decided.proposal)
    return
  }
  void refreshLocalTaskProposals()
}
