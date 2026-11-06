import type { LocalTasksProposalsRecordResultsInput } from '../../shared/local-tasks/local-task-dispatcher-rpc-params'
import type { LocalTaskProposal } from '../../shared/local-tasks/local-task-dispatcher-types'
import type { LocalTaskResult } from '../../shared/local-tasks/local-task-types'
import type { LocalTasksDatabase } from './local-tasks-database'

/** Persists each known outcome before another proposal item can start. */
export function recordLocalTaskProposalResults(
  db: LocalTasksDatabase,
  proposal: LocalTaskProposal,
  input: LocalTasksProposalsRecordResultsInput,
  owner: string | null,
  connectionId: string,
  onTask: (taskId: string) => void
): LocalTaskResult<{ finalized: boolean }> {
  const finalized = input.finalize !== false
  if (owner ? owner !== connectionId : input.results.length > 0 || !finalized) {
    return { ok: false, code: 'stale', detail: 'execution-owner' }
  }
  const kept = new Set(proposal.keptItemIndexes ?? proposal.items.map((_, index) => index))
  const merged = new Map((proposal.results ?? []).map((result) => [result.index, result]))
  for (const result of input.results) {
    if (!kept.has(result.index)) {
      return { ok: false, code: 'invalid_argument', detail: 'result-index' }
    }
    const earlier = merged.get(result.index)
    if (
      earlier &&
      (earlier.ok !== result.ok ||
        earlier.taskId !== result.taskId ||
        earlier.detail !== result.detail)
    ) {
      return { ok: false, code: 'stale', detail: 'result-conflict' }
    }
    merged.set(result.index, result)
  }
  if (finalized && owner && [...kept].some((index) => !merged.has(index))) {
    return { ok: false, code: 'invalid_argument', detail: 'incomplete-results' }
  }
  db.prepare('UPDATE local_task_proposals SET status = ?, results = ? WHERE id = ?').run(
    finalized ? 'executed' : 'executing',
    JSON.stringify([...merged.values()]),
    proposal.id
  )
  for (const result of input.results) {
    if (result.taskId) {
      onTask(result.taskId)
    }
  }
  db.touch('events')
  return { ok: true, finalized }
}
