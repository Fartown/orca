import type { LocalTaskLatestProgress } from './local-task-types'

/**
 * A turn end and when the round it closed began, on the library's clock: the session's previous
 * turn end, else its link. Null when that is unknown (an older record, a live row on a client).
 */
export type LocalTaskTurnEndCandidate = {
  progress: LocalTaskLatestProgress
  roundStartedAt: number | null
}

/**
 * One task's own latest progress (REQ-022): its newest writeback stands, even past the turn end of
 * the round it was written in, until a turn whose whole round came after it ends; then the newest
 * turn end shows. A turn whose round start is unknown never displaces a writeback.
 */
export function chooseLocalTaskOwnProgress(
  givenWriteback: LocalTaskLatestProgress | null,
  turnEnds: readonly LocalTaskTurnEndCandidate[]
): LocalTaskLatestProgress | null {
  // Why skip empty text: it would hide a subtask's progress on one client and not another.
  const writeback = givenWriteback?.body.trim() ? givenWriteback : null
  let newest: LocalTaskLatestProgress | null = null
  let writebackOutdated = false
  for (const turn of turnEnds) {
    if (!turn.progress.body.trim()) {
      continue
    }
    if (!newest || turn.progress.at > newest.at) {
      newest = turn.progress
    }
    if (writeback && turn.roundStartedAt !== null && turn.roundStartedAt >= writeback.at) {
      writebackOutdated = true
    }
  }
  return writeback && !writebackOutdated ? writeback : newest
}

/**
 * Whose progress a task with subtasks shows (REQ-012): its own when it has any, else the newest of
 * its descendants', which the caller labels with that subtask.
 */
export function chooseLocalTaskFamilyProgress<T extends { progress: LocalTaskLatestProgress }>(
  own: T | null,
  descendants: Iterable<T>
): T | null {
  if (own) {
    return own
  }
  let newest: T | null = null
  for (const entry of descendants) {
    if (!newest || entry.progress.at > newest.progress.at) {
      newest = entry
    }
  }
  return newest
}
