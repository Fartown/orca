import type {
  LocalTaskProposal,
  LocalTaskProposalItemResult
} from '../../../shared/local-tasks/local-task-dispatcher-types'

/**
 * Where one item of a decided proposal stands, read only from the claim and the recorded results
 * (D-018). Items run one at a time in kept order and each result is saved before the next starts,
 * so the first kept item without a result is the one in flight, and the ones after it never began.
 */
export type LocalTaskProposalItemStage =
  | 'done'
  | 'failed'
  /** The execution window is live and this is the first item without a result. */
  | 'running'
  /** Confirmed and not started: unclaimed, or behind the item in flight. */
  | 'waiting'
  /** The window went away before this item reported: it may or may not have run. */
  | 'unknown'
  /** The window went away before this item began. */
  | 'skipped'
  /** The host cannot say whether the window is still live (an older host). */
  | 'unverifiable'
  /** The person left it out when confirming. */
  | 'dropped'

export type LocalTaskProposalItemProgress = {
  index: number
  stage: LocalTaskProposalItemStage
  result: LocalTaskProposalItemResult | null
}

export type LocalTaskProposalProgress = {
  items: LocalTaskProposalItemProgress[]
  /** Kept items whose result was recorded ok. */
  done: number
  /** Kept items: what "done x of y" counts against. */
  total: number
  unknown: number
}

type OpenStages = { first: LocalTaskProposalItemStage; rest: LocalTaskProposalItemStage }

function openStages(proposal: LocalTaskProposal, runningHere: boolean): OpenStages | null {
  switch (proposal.status) {
    case 'confirmed':
      return runningHere
        ? { first: 'running', rest: 'waiting' }
        : { first: 'waiting', rest: 'waiting' }
    case 'executing':
      if (runningHere || proposal.executionActive === true) {
        return { first: 'running', rest: 'waiting' }
      }
      return proposal.executionActive === false
        ? { first: 'unknown', rest: 'skipped' }
        : { first: 'unverifiable', rest: 'unverifiable' }
    case 'executed':
      // Why: a finished run reports every kept item; a gap means its window was closed out early.
      return { first: 'unknown', rest: 'skipped' }
    case 'pending':
    case 'dismissed':
      return null
  }
}

/** Null while the person has not confirmed it, or after they dismissed it. */
export function localTaskProposalProgress(
  proposal: LocalTaskProposal,
  runningHere: boolean
): LocalTaskProposalProgress | null {
  const open = openStages(proposal, runningHere)
  if (!open) {
    return null
  }
  const results = new Map((proposal.results ?? []).map((result) => [result.index, result]))
  // Why the kept order: it is the order the items run in.
  const runOrder = proposal.keptItemIndexes ?? proposal.items.map((_, index) => index)
  const byIndex = new Map<number, LocalTaskProposalItemProgress>()
  let reachedOpen = false
  for (const index of runOrder) {
    if (index < 0 || index >= proposal.items.length || byIndex.has(index)) {
      continue
    }
    const result = results.get(index) ?? null
    if (result) {
      byIndex.set(index, { index, stage: result.ok ? 'done' : 'failed', result })
      continue
    }
    byIndex.set(index, { index, stage: reachedOpen ? open.rest : open.first, result: null })
    reachedOpen = true
  }
  const items = proposal.items.map(
    (_, index): LocalTaskProposalItemProgress =>
      byIndex.get(index) ?? { index, stage: 'dropped', result: null }
  )
  return {
    items,
    done: items.filter((item) => item.stage === 'done').length,
    total: byIndex.size,
    unknown: items.filter((item) => item.stage === 'unknown').length
  }
}
