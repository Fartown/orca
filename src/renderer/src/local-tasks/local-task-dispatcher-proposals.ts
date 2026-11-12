import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { LocalTaskProposal } from '../../../shared/local-tasks/local-task-dispatcher-types'
import { localTaskDispatcherClient } from './local-task-dispatcher-client'
import {
  forgetLocalTaskProposalEdits,
  withLocalTaskProposalEdits
} from './local-task-proposal-edits'
import { executeLocalTaskProposal } from './local-task-proposal-execution'
import { runLocalTaskWrite } from './local-task-writes'

type ProposalsState = {
  pending: LocalTaskProposal[]
  /** Confirmed on another device, or before this window could claim it. */
  unrun: LocalTaskProposal[]
  /** Claimed and not reported: running somewhere, or interrupted while it ran. */
  claimed: LocalTaskProposal[]
  /** Proposals this window is running now. */
  running: readonly string[]
  /** Runs this window stopped because a result could not be recorded: it runs them no more. */
  abandoned: readonly string[]
}

export const localTaskProposalsStore = createStore<ProposalsState>(() => ({
  pending: [],
  unrun: [],
  claimed: [],
  running: [],
  abandoned: []
}))

export function useLocalTaskProposals<T>(select: (state: ProposalsState) => T): T {
  return useStore(localTaskProposalsStore, select)
}

let latestRead = 0

/** Re-reads the proposals waiting on the person; a slow read never overwrites a later one. */
export async function refreshLocalTaskProposals(): Promise<void> {
  const sequence = ++latestRead
  try {
    const [pending, confirmed, executing] = await Promise.all([
      localTaskDispatcherClient.list('pending'),
      localTaskDispatcherClient.list('confirmed'),
      localTaskDispatcherClient.list('executing')
    ])
    if (sequence !== latestRead) {
      return
    }
    // Why: a decision landing between the reads must not show one proposal twice.
    const seen = new Set(pending.proposals.map((proposal) => proposal.id))
    const unseen = (proposal: LocalTaskProposal): boolean => {
      const fresh = !seen.has(proposal.id)
      seen.add(proposal.id)
      return fresh
    }
    localTaskProposalsStore.setState({
      pending: pending.proposals,
      unrun: confirmed.proposals.filter(unseen),
      claimed: executing.proposals.filter(unseen)
    })
    forgetLocalTaskProposalEdits(seen)
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

function setAbandoned(proposalId: string, abandoned: boolean): void {
  localTaskProposalsStore.setState((state) => ({
    abandoned: abandoned
      ? [...state.abandoned.filter((id) => id !== proposalId), proposalId]
      : state.abandoned.filter((id) => id !== proposalId)
  }))
}

/**
 * Stops a run whose result could not be recorded. Why release: this window's connection still
 * holds the claim, and while it does nobody, this window included, could close the proposal out.
 */
async function abandonLocalTaskProposalRun(proposalId: string): Promise<void> {
  setAbandoned(proposalId, true)
  await localTaskDispatcherClient.release(proposalId).catch((error: unknown) => {
    console.error('local tasks: releasing an abandoned proposal run failed', error)
  })
}

/**
 * Claims a confirmed proposal, runs it once in this window and says how it went. The claim is
 * what stops a second window, a stale card or a reload from running the same items again.
 */
export async function runLocalTaskProposal(proposal: LocalTaskProposal): Promise<void> {
  if (localTaskProposalsStore.getState().running.includes(proposal.id)) {
    return
  }
  setRunning(proposal.id, true)
  try {
    const claimed = await localTaskDispatcherClient.claim(proposal.id).catch((error: unknown) => {
      console.error('local tasks: claiming a proposal failed', error)
      return null
    })
    // Why apart from a refusal: a request that never got an answer ran nothing and can be retried.
    if (claimed === null) {
      toast.error(
        translate(
          'localTasks.dispatcher.claimFailed',
          'Couldn’t reach the task library, so nothing ran. Try again.'
        )
      )
      return
    }
    if (!claimed.ok || claimed.proposal.executionActive !== true) {
      toast.info(
        translate(
          'localTasks.dispatcher.claimedElsewhere',
          'This proposal is already running or has run.'
        )
      )
      return
    }
    const results = await executeLocalTaskProposal(withLocalTaskProposalEdits(claimed.proposal))
    if (!results) {
      await abandonLocalTaskProposalRun(proposal.id)
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

/**
 * Closes a proposal whose run was interrupted, without running anything again: some items may
 * have run, so the person checks the tasks rather than repeating them.
 */
export async function finishInterruptedLocalTaskProposal(proposalId: string): Promise<void> {
  const state = localTaskProposalsStore.getState()
  const abandonedHere = state.abandoned.includes(proposalId)
  if (
    state.running.includes(proposalId) ||
    (!abandonedHere &&
      state.claimed.find((proposal) => proposal.id === proposalId)?.executionActive !== false)
  ) {
    return
  }
  if (abandonedHere) {
    // Why first: the host lets nobody close a run while this window's connection still claims it.
    const released = await localTaskDispatcherClient.release(proposalId).then(
      () => true,
      (error: unknown) => {
        toast.error(
          translate('localTasks.failure.callFailed', 'Could not save the change: {{message}}', {
            message: error instanceof Error ? error.message : String(error)
          })
        )
        return false
      }
    )
    if (!released) {
      return
    }
  }
  const finished = await runLocalTaskWrite(() =>
    localTaskDispatcherClient.recordResults(proposalId, [], true)
  )
  if (finished) {
    setAbandoned(proposalId, false)
  }
  void refreshLocalTaskProposals()
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
