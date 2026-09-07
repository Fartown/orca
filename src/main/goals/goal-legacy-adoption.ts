import {
  LEGACY_GOAL_ID_PREFIX,
  goalObjectivePreview,
  type GoalAdoptLegacyParams,
  type GoalDriverVerdict,
  type GoalOperation,
  type GoalSummary
} from '../../shared/goals/goal-control-contract'
import {
  GoalRecordSchema,
  type GoalRecord,
  type LegacyGoalRecord
} from '../../shared/goals/goal-store-records'
import type { GoalDriverLivenessInput } from './goal-driver-liveness'
import type { GoalOperationReceipts } from './goal-operation-receipts'
import type { GoalStore } from './goal-store'
import type { GoalTerminalFacts } from './goal-summary-projection'

export type GoalLegacyAdoptionDependencies = {
  store: GoalStore
  terminals: GoalTerminalFacts
  inspectDriver: (input: GoalDriverLivenessInput) => Promise<GoalDriverVerdict>
  now: () => number
  newId: () => string
}

/**
 * v1 CLI goals stay readable exactly as the CLI left them. They are listed
 * read-only and only become managed records on an explicit adoption, never
 * while a legacy driver still holds the workspace.
 */
export class GoalLegacyAdoption {
  constructor(private readonly deps: GoalLegacyAdoptionDependencies) {}

  /** v1 records with no managed record: read-only rows the UI can offer to import. */
  async listUnadopted(managed: readonly GoalRecord[]): Promise<GoalSummary[]> {
    const adoptedKeys = new Set(managed.map((record) => record.legacyKey).filter(Boolean))
    const legacy = (await this.deps.store.listLegacyRecords()).filter(
      (record) => !record.goalId && !adoptedKeys.has(record.key)
    )
    return Promise.all(legacy.map((record) => this.projectLegacy(record)))
  }

  async adopt(
    params: GoalAdoptLegacyParams,
    receipts: GoalOperationReceipts
  ): Promise<GoalOperation> {
    const { store, terminals, inspectDriver } = this.deps
    const legacy = await store.readLegacyRecord(params.legacyKey)
    if (!legacy) {
      return receipts.reject(params, null, {
        code: 'target_changed',
        message: 'The legacy goal no longer exists.'
      })
    }
    if (legacy.goalId) {
      return receipts.reject(params, null, {
        code: 'conflict',
        message: 'This goal is already managed.'
      })
    }
    const driver = await inspectDriver({
      pid: await store.readLegacyLockPid(legacy.key),
      goalId: '',
      legacyKey: legacy.key
    })
    if (driver.status !== 'exited') {
      return receipts.reject(params, null, {
        code: 'conflict',
        message:
          driver.status === 'live'
            ? 'A legacy driver still runs this goal; stop it with orca-goal first.'
            : `The legacy driver could not be verified: ${driver.reason}`
      })
    }
    let incarnationId: string | null = null
    let worktreeId: string | null = null
    try {
      const show = await terminals.showTerminal(legacy.terminalHandle)
      incarnationId = show.incarnationId ?? null
      worktreeId = show.worktreeId || null
    } catch {
      incarnationId = null
    }
    if (!incarnationId) {
      return receipts.reject(params, null, {
        code: 'target_changed',
        message:
          'The terminal the legacy goal used is no longer open; reopen a session and rebind after import.'
      })
    }
    const goalId = this.deps.newId()
    const now = this.deps.now()
    const acceptance = readAcceptance(legacy)
    const record: GoalRecord = {
      version: 1,
      goalId,
      authorityExecutionHostId: params.authorityExecutionHostId,
      createdAt: now,
      updatedAt: now,
      binding: {
        worktree: legacy.worktreePath,
        terminal: legacy.terminalHandle,
        expectedIncarnationId: incarnationId
      },
      workspace: { selector: legacy.worktreePath, path: legacy.worktreePath, worktreeId },
      spec: {
        objective: legacy.objective,
        criteria: [],
        acceptanceText: '',
        extraChecks: acceptance.commands,
        checkAll: acceptance.all,
        onBlocked: readOnBlocked(legacy),
        judge: 'none'
      },
      budget: {
        maxTurns: readNumber(legacy, ['budget', 'maxTurns'], 20),
        maxMinutes: readNumber(legacy, ['budget', 'maxMinutes'], 180),
        checkTimeoutSeconds: Math.max(1, Math.round(acceptance.timeoutMs / 1000))
      },
      specRevision: 1,
      runtimeFence: 0,
      continuation: 'paused',
      archived: false,
      legacyKey: legacy.key,
      currentRun: null,
      lastOperationId: params.clientOperationId
    }
    // Why: readRecord drops anything the schema rejects, so an over-limit CLI goal would vanish after an "applied" receipt.
    const parsed = GoalRecordSchema.safeParse(record)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return receipts.reject(params, null, {
        code: 'unsupported',
        message: `The legacy goal cannot be imported as-is (${issue?.path.join('.') ?? 'record'}: ${issue?.message ?? 'invalid'}).`
      })
    }
    await store.writeRecord(parsed.data)
    await store.appendVersion(goalId, { specRevision: 1, savedAt: now, spec: record.spec })
    // Why: the v1 record now names its owner so a later CLI run and this record cannot diverge.
    await store.writeLegacyRecord(legacy.key, { ...legacy, goalId, specRevision: 1 })
    return receipts.persist(
      receipts.build(
        params,
        goalId,
        'applied',
        'ok',
        'Imported; resume it to attach a driver.',
        { runtimeFence: 0, runId: null },
        { continuationPaused: true }
      )
    )
  }

  private async projectLegacy(legacy: LegacyGoalRecord): Promise<GoalSummary> {
    const driver = await this.deps.inspectDriver({
      pid: await this.deps.store.readLegacyLockPid(legacy.key),
      goalId: '',
      legacyKey: legacy.key
    })
    const phase = legacyPhase(legacy, driver)
    return {
      goalId: `${LEGACY_GOAL_ID_PREFIX}${legacy.key}`,
      objectivePreview: goalObjectivePreview(legacy.objective),
      workspace: {
        selector: legacy.worktreePath,
        path: legacy.worktreePath,
        executionHostId: 'local'
      },
      binding: {
        worktree: legacy.worktreePath,
        terminal: legacy.terminalHandle,
        expectedIncarnationId: 'legacy'
      },
      runtimeFence: 0,
      specRevision: 1,
      runId: null,
      continuation: phase === 'executing' ? 'enabled' : 'paused',
      phase,
      reason:
        legacy.finishReason ?? (driver.status === 'live' ? 'Driven by the orca-goal CLI.' : null),
      completion:
        legacy.state === 'complete'
          ? legacy.lastAcceptance?.result.passed
            ? 'verified'
            : 'unverified'
          : 'not_complete',
      stopSupport: 'unsupported',
      driver,
      terminal: { status: 'unverifiable', reason: 'legacy goals are not observed until imported' },
      agentStatus: null,
      turn: 'unknown',
      archived: false,
      turns: legacy.turns,
      activeMs: legacy.activeMs ?? 0,
      observedAt: this.deps.now(),
      legacy: { key: legacy.key }
    }
  }
}

function legacyPhase(legacy: LegacyGoalRecord, driver: GoalDriverVerdict): GoalSummary['phase'] {
  switch (legacy.state) {
    case 'complete':
      return 'complete'
    case 'budget_exhausted':
      return 'budget_exhausted'
    case 'blocked':
    case 'stalled':
    case 'aborted':
      return 'interrupted'
    case 'active':
      return driver.status === 'exited' ? 'interrupted' : 'executing'
  }
}

function readAcceptance(legacy: LegacyGoalRecord): {
  commands: string[]
  timeoutMs: number
  all: boolean
} {
  const raw = (
    legacy as { acceptance?: { commands?: unknown; timeoutMs?: unknown; all?: unknown } | null }
  ).acceptance
  return {
    commands: Array.isArray(raw?.commands)
      ? raw.commands.filter((c): c is string => typeof c === 'string')
      : [],
    timeoutMs: typeof raw?.timeoutMs === 'number' ? raw.timeoutMs : 900_000,
    all: raw?.all === true
  }
}

function readOnBlocked(legacy: LegacyGoalRecord): 'ask' | 'verify' {
  return (legacy as { onBlocked?: unknown }).onBlocked === 'verify' ? 'verify' : 'ask'
}

function readNumber(legacy: LegacyGoalRecord, path: string[], fallback: number): number {
  let cursor: unknown = legacy
  for (const part of path) {
    cursor =
      cursor && typeof cursor === 'object' ? (cursor as Record<string, unknown>)[part] : undefined
  }
  return typeof cursor === 'number' && Number.isFinite(cursor) && cursor >= 0 ? cursor : fallback
}
