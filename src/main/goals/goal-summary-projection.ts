import {
  goalObjectivePreview,
  type GoalCompletion,
  type GoalDriverVerdict,
  type GoalListFilter,
  type GoalPhase,
  type GoalSummary,
  type GoalSummaryNotice
} from '../../shared/goals/goal-control-contract'
import {
  ownedLegacyRecord,
  type GoalNotice,
  type GoalRecord,
  type GoalRecoveryRecord,
  type LegacyGoalRecord
} from '../../shared/goals/goal-store-records'
import type { PtyLivenessVerdict } from '../../shared/pty-liveness-verdict'
import type { GoalTerminalSnapshot } from '../../shared/goals/goal-host-facts'
import { projectTurnEvidence, type GoalTurnEvidence, type GoalTurnRow } from './goal-turn-evidence'

export type GoalTerminalFacts = {
  showTerminal(handle: string): Promise<GoalTerminalSnapshot>
}

export type GoalHookFacts = {
  getStatusSnapshotForPane(paneKey: string): GoalTurnRow[]
}

export type GoalProjectionSources = {
  terminals: GoalTerminalFacts
  hooks: GoalHookFacts
  readLegacyRecord(key: string): Promise<LegacyGoalRecord | null>
  /** Host-side recovery notices; absent in callers that never run the recovery scan. */
  readRecovery?(goalId: string): Promise<GoalRecoveryRecord>
  inspectDriver(record: GoalRecord): Promise<GoalDriverVerdict>
  now(): number
}

export type GoalTerminalObservation = {
  terminal: PtyLivenessVerdict
  paneKey: string | null
  incarnationDrift: boolean
}

export async function projectGoalSummary(
  record: GoalRecord,
  sources: GoalProjectionSources
): Promise<GoalSummary> {
  const legacy = ownedLegacyRecord(
    record,
    record.legacyKey ? await sources.readLegacyRecord(record.legacyKey) : null
  )
  const driver = await sources.inspectDriver(record)
  const observed = await observeTerminal(record, sources.terminals)
  const evidence = observed.paneKey
    ? projectTurnEvidence(sources.hooks.getStatusSnapshotForPane(observed.paneKey))
    : projectTurnEvidence([])
  const { phase, reason } = projectPhase(record, legacy, driver, evidence)
  const recovery = sources.readRecovery ? await sources.readRecovery(record.goalId) : null
  const notices = projectNotices(
    [...(legacy?.notices ?? []), ...(recovery?.notices ?? [])],
    sources.now()
  )
  return {
    goalId: record.goalId,
    objectivePreview: goalObjectivePreview(record.spec.objective),
    workspace: {
      selector: record.workspace.selector,
      path: record.workspace.path,
      executionHostId: record.authorityExecutionHostId
    },
    binding: record.binding,
    runtimeFence: record.runtimeFence,
    specRevision: record.specRevision,
    runId: record.currentRun?.runId ?? null,
    continuation: record.continuation,
    phase,
    reason: observed.incarnationDrift ? 'The bound terminal was restarted.' : reason,
    completion: projectCompletion(record, legacy),
    stopSupport: 'request_only',
    driver,
    terminal: observed.terminal,
    agentStatus: evidence.agentStatus,
    turn: evidence.turn,
    archived: record.archived,
    turns: legacy?.turns ?? 0,
    activeMs: legacy?.activeMs ?? 0,
    observedAt: sources.now(),
    ...(legacy?.guardMs !== undefined ? { guardMs: legacy.guardMs } : {}),
    ...(notices.length > 0 ? { notices } : {})
  }
}

const NOTICE_WINDOW_MS = 24 * 60 * 60_000

/** Unresolved notices from the last day, oldest first; the client shows each id once. */
export function projectNotices(notices: readonly GoalNotice[], now: number): GoalSummaryNotice[] {
  return notices
    .filter((notice) => !notice.resolvedAt && now - notice.at < NOTICE_WINDOW_MS)
    .sort((a, b) => a.at - b.at)
    .map(({ id, kind, text, at }) => ({ id, kind, text, at }))
}

/** The bound pane's turn facts alone, for callers that only need to know whether a turn is open. */
export async function observeTurn(
  record: GoalRecord,
  sources: Pick<GoalProjectionSources, 'terminals' | 'hooks'>
): Promise<GoalTurnEvidence> {
  const observed = await observeTerminal(record, sources.terminals)
  return observed.paneKey
    ? projectTurnEvidence(sources.hooks.getStatusSnapshotForPane(observed.paneKey))
    : projectTurnEvidence([])
}

export function goalMatchesFilter(
  summary: GoalSummary,
  filter: GoalListFilter,
  query: string | undefined
): boolean {
  if (query && !summary.objectivePreview.toLowerCase().includes(query.trim().toLowerCase())) {
    return false
  }
  switch (filter) {
    case 'all':
      return true
    case 'history':
      return summary.archived || summary.phase === 'complete'
    case 'running':
      return (
        !summary.archived &&
        (summary.phase === 'starting' ||
          summary.phase === 'executing' ||
          summary.phase === 'verifying')
      )
    case 'attention':
      return (
        !summary.archived &&
        (summary.phase === 'waiting_user' ||
          summary.phase === 'interrupted' ||
          summary.phase === 'budget_exhausted' ||
          summary.phase === 'idle')
      )
  }
}

export function goalMatchesWorktree(record: GoalRecord, worktree: string | undefined): boolean {
  if (!worktree) {
    return true
  }
  return (
    record.workspace.selector === worktree ||
    record.workspace.path === worktree ||
    record.workspace.worktreeId === worktree
  )
}

/**
 * The terminal verdict is a projection of what the runtime already knows about
 * the bound PTY. Only an observed exit, or a PTY incarnation other than the one
 * the goal was bound to, reads as exited; a handle the host cannot resolve
 * (restart, reload, closed tab) is lost contact and stays unverifiable.
 */
export async function observeTerminal(
  record: GoalRecord,
  terminals: GoalTerminalFacts
): Promise<GoalTerminalObservation> {
  let show: GoalTerminalSnapshot
  try {
    show = await terminals.showTerminal(record.binding.terminal)
  } catch (error) {
    return {
      terminal: {
        status: 'unverifiable',
        reason: `the bound terminal could not be resolved: ${errorMessage(error)}`
      },
      paneKey: null,
      incarnationDrift: false
    }
  }
  const paneKey = show.tabId && show.leafId ? `${show.tabId}:${show.leafId}` : null
  if (show.incarnationId && show.incarnationId !== record.binding.expectedIncarnationId) {
    return { terminal: { status: 'exited' }, paneKey, incarnationDrift: true }
  }
  if (show.ptyId && show.connected) {
    return { terminal: { status: 'live', ptyIds: [show.ptyId] }, paneKey, incarnationDrift: false }
  }
  if (show.exitCause) {
    return { terminal: { status: 'exited' }, paneKey, incarnationDrift: false }
  }
  return {
    terminal: { status: 'unverifiable', reason: 'the terminal is not connected' },
    paneKey,
    incarnationDrift: false
  }
}

function projectPhase(
  record: GoalRecord,
  legacy: LegacyGoalRecord | null,
  driver: GoalDriverVerdict,
  evidence: GoalTurnEvidence
): { phase: GoalPhase; reason: string | null } {
  if (!legacy) {
    return record.currentRun
      ? { phase: 'starting', reason: null }
      : { phase: 'idle', reason: 'The goal has not been started.' }
  }
  switch (legacy.state) {
    case 'complete':
      return { phase: 'complete', reason: legacy.finishReason ?? null }
    case 'budget_exhausted':
      return { phase: 'budget_exhausted', reason: legacy.finishReason ?? null }
    case 'blocked':
    case 'stalled':
    case 'aborted':
      return { phase: 'interrupted', reason: legacy.finishReason ?? null }
    case 'active':
      break
  }
  if (driver.status === 'exited') {
    return {
      phase: 'interrupted',
      reason: legacy.driverError?.message ?? 'The driver exited while the goal was active.'
    }
  }
  if (legacy.awaitingUser) {
    return { phase: 'waiting_user', reason: legacy.awaitingUser.reason }
  }
  if (driver.status === 'unverifiable') {
    return { phase: 'executing', reason: driver.reason }
  }
  if (record.continuation === 'paused' && evidence.turn !== 'running') {
    return { phase: 'idle', reason: 'Continuation is paused.' }
  }
  // The guard's latest observation is the most useful one-line status there is.
  return { phase: 'executing', reason: legacy.guardObservation ?? null }
}

/** Verified only by evidence from the current definition; an amend retires the old verdict. */
function projectCompletion(record: GoalRecord, legacy: LegacyGoalRecord | null): GoalCompletion {
  if (!legacy || legacy.state !== 'complete') {
    return 'not_complete'
  }
  const evidenceRevision = legacy.specRevision ?? record.specRevision
  return evidenceRevision === record.specRevision && legacy.lastAcceptance?.result.passed
    ? 'verified'
    : 'unverified'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
