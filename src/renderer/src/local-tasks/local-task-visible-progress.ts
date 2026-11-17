import {
  chooseLocalTaskFamilyProgress,
  chooseLocalTaskOwnProgress,
  type LocalTaskTurnEndCandidate
} from '../../../shared/local-tasks/local-task-latest-progress-choice'
import type {
  LocalTask,
  LocalTaskLatestProgress
} from '../../../shared/local-tasks/local-task-types'
import { localTaskDescendantIds } from '../../../shared/local-tasks/local-task-tree'
import type { LocalTaskIndex } from './local-task-grouping'
import type { LocalTasksDomainState } from './local-tasks-domain-store'

type VisibleProgress = { task: LocalTask; progress: LocalTaskLatestProgress }

/** The task's own progress first, else its newest descendant's (REQ-012, REQ-022). */
export function localTaskVisibleProgress(
  task: LocalTask,
  index: LocalTaskIndex,
  domain: Pick<LocalTasksDomainState, 'progress' | 'links'>
): VisibleProgress | null {
  const liveTurns = liveTurnEndsByTask(domain)
  const own = (owner: LocalTask | undefined): VisibleProgress | null => {
    if (!owner) {
      return null
    }
    const saved = owner.latestProgress ?? null
    const progress = chooseLocalTaskOwnProgress(saved?.kind === 'progress' ? saved : null, [
      ...(saved?.kind === 'turn-ended' ? [{ progress: saved, roundStartedAt: null }] : []),
      ...(liveTurns.get(owner.id) ?? [])
    ])
    return progress ? { task: owner, progress } : null
  }
  const descendants = localTaskDescendantIds(task.id, index.childrenByParentId).flatMap((id) => {
    const entry = own(index.tasksById.get(id))
    return entry ? [entry] : []
  })
  return chooseLocalTaskFamilyProgress(own(task), descendants)
}

/**
 * A finished turn the host reports live, for a host that keeps no turn end of its own. Its round
 * is unknown here, so it only stands in for a turn end, never for a writeback.
 */
function liveTurnEndsByTask(
  domain: Pick<LocalTasksDomainState, 'progress' | 'links'>
): Map<string, LocalTaskTurnEndCandidate[]> {
  const byTask = new Map<string, LocalTaskTurnEndCandidate[]>()
  for (const session of domain.links.sessions) {
    const row = domain.progress?.sessions.get(session.id)
    if (!row?.lastMessage || row.stateSince === null || row.state !== 'done') {
      continue
    }
    const turns = byTask.get(session.taskId) ?? []
    turns.push({
      progress: {
        kind: 'turn-ended',
        body: row.lastMessage,
        at: row.stateSince,
        sessionLinkId: session.id
      },
      roundStartedAt: null
    })
    byTask.set(session.taskId, turns)
  }
  return byTask
}
