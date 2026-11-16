import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { LocalTaskProposal } from '../../../shared/local-tasks/local-task-dispatcher-types'
import {
  localTaskDispatcherClient,
  localTaskDispatcherClientFor
} from './local-task-dispatcher-client'
import { localTaskIdEndpoint } from './local-task-endpoints'
import {
  getLocalTaskDispatcherEndpoint,
  getLocalTaskDispatcherEpoch,
  isLocalTaskDispatcherSourceCurrent
} from './local-task-dispatcher-source'
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
const activeRuns = new Set<string>()

export function resetLocalTaskProposals(): void {
  latestRead += 1
  localTaskProposalsStore.setState({
    pending: [],
    unrun: [],
    claimed: [],
    running: [],
    abandoned: []
  })
}

/** Re-reads the proposals waiting on the person; a slow read never overwrites a later one. */
export async function refreshLocalTaskProposals(): Promise<void> {
  const sequence = ++latestRead
  const endpoint = getLocalTaskDispatcherEndpoint()
  const epoch = getLocalTaskDispatcherEpoch()
  if (!isLocalTaskDispatcherSourceCurrent(endpoint, epoch)) {
    return
  }
  const client = localTaskDispatcherClientFor(endpoint)
  try {
    const [pending, confirmed, executing] = await Promise.all([
      client.list('pending'),
      client.list('confirmed'),
      client.list('executing')
    ])
    if (sequence !== latestRead || !isLocalTaskDispatcherSourceCurrent(endpoint, epoch)) {
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
  if (running) {
    activeRuns.add(proposalId)
  } else {
    activeRuns.delete(proposalId)
  }
  if (localTaskIdEndpoint(proposalId) !== getLocalTaskDispatcherEndpoint()) {
    return
  }
  localTaskProposalsStore.setState((state) => ({
    running: running
      ? [...state.running, proposalId]
      : state.running.filter((id) => id !== proposalId)
  }))
}

function setAbandoned(proposalId: string, abandoned: boolean): void {
  if (localTaskIdEndpoint(proposalId) !== getLocalTaskDispatcherEndpoint()) {
    return
  }
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
  const endpoint = getLocalTaskDispatcherEndpoint()
  const epoch = getLocalTaskDispatcherEpoch()
  if (
    activeRuns.has(proposal.id) ||
    localTaskIdEndpoint(proposal.id) !== endpoint ||
    !isLocalTaskDispatcherSourceCurrent(endpoint, epoch)
  ) {
    return
  }
  setRunning(proposal.id, true)
  try {
    const claimed = await localTaskDispatcherClient.claim(proposal.id).catch((error: unknown) => {
      console.error('local tasks: claiming a proposal failed', error)
      return null
    })
    if (!isLocalTaskDispatcherSourceCurrent(endpoint, epoch)) {
      if (claimed?.ok && claimed.proposal.executionActive) {
        await localTaskDispatcherClient.release(proposal.id).catch(() => {})
      }
      return
    }
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
    if (!isLocalTaskDispatcherSourceCurrent(endpoint, epoch)) {
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
  if (
    !isLocalTaskDispatcherSourceCurrent(
      localTaskIdEndpoint(proposalId),
      getLocalTaskDispatcherEpoch()
    )
  ) {
    return
  }
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
  if (
    !isLocalTaskDispatcherSourceCurrent(
      localTaskIdEndpoint(proposalId),
      getLocalTaskDispatcherEpoch()
    )
  ) {
    return
  }
  const decided = await runLocalTaskWrite(() =>
    localTaskDispatcherClient.decide(proposalId, decision, keep)
  )
  if (decided && decision === 'confirmed') {
    await runLocalTaskProposal(decided.proposal)
    return
  }
  void refreshLocalTaskProposals()
}
