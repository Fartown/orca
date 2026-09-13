import { GoalEditorDraftStore } from './goal-editor-draft-store'
import { GoalAcceptanceDrafts } from './goal-acceptance-drafts'
import { randomUUID } from 'node:crypto'
import type {
  GoalAdoptLegacyParams,
  GoalAmendParams,
  GoalArchiveParams,
  GoalControlParams,
  GoalCreateParams,
  GoalDetail,
  GoalDriverVerdict,
  GoalListParams,
  GoalOperation,
  GoalRebindParams,
  GoalRpcResults
} from '../../shared/goals/goal-control-contract'
import { toGoalOperation, type GoalRecord } from '../../shared/goals/goal-store-records'
import { GoalBindingAdmission } from './goal-binding-admission'
import { GoalContinuationControl } from './goal-continuation-control'
import type { GoalDriverLauncher } from './goal-driver-launch'
import { inspectGoalDriver, type GoalDriverLivenessInput } from './goal-driver-liveness'
import { GoalLegacyAdoption } from './goal-legacy-adoption'
import { GoalOperationReceipts, type GoalRejection } from './goal-operation-receipts'
import { GoalRevisionControl } from './goal-revision-control'
import { GoalRunCommitter } from './goal-run-commit'
import type { GoalStore } from './goal-store'
import { projectGoalEvidence } from './goal-evidence-projection'
import {
  goalMatchesFilter,
  goalMatchesWorktree,
  projectGoalSummary,
  type GoalHookFacts,
  type GoalTerminalFacts
} from './goal-summary-projection'

export type GoalControlServiceDependencies = {
  store: GoalStore
  terminals: GoalTerminalFacts
  hooks: GoalHookFacts
  launcher: GoalDriverLauncher
  userDataPath: string
  resolveDraftWorkspace?: (selector: string) => Promise<string>
  inspectDriver?: (input: GoalDriverLivenessInput) => Promise<GoalDriverVerdict>
  now?: () => number
  newId?: () => string
}

/** Coordinates receipts and the detached driver; the host never injects into a terminal. */
export class GoalControlService {
  readonly drafts: GoalAcceptanceDrafts
  readonly editorDrafts: GoalEditorDraftStore
  private readonly store: GoalStore
  private readonly hooks: GoalHookFacts
  private readonly terminals: GoalTerminalFacts
  private readonly admission: GoalBindingAdmission
  private readonly receipts: GoalOperationReceipts
  private readonly runs: GoalRunCommitter
  private readonly continuation: GoalContinuationControl
  private readonly revisions: GoalRevisionControl
  private readonly legacy: GoalLegacyAdoption
  private readonly now: () => number
  private readonly newId: () => string

  constructor(dependencies: GoalControlServiceDependencies) {
    this.store = dependencies.store
    this.hooks = dependencies.hooks
    this.terminals = dependencies.terminals
    this.now = dependencies.now ?? Date.now
    this.newId = dependencies.newId ?? randomUUID
    this.admission = new GoalBindingAdmission({
      store: this.store,
      terminals: this.terminals,
      inspectDriver: dependencies.inspectDriver ?? inspectGoalDriver
    })
    this.drafts = new GoalAcceptanceDrafts({
      goalHome: this.store.goalHome,
      entryPath: dependencies.launcher.entryPath,
      admission: this.admission,
      resolveWorkspace: dependencies.resolveDraftWorkspace
    })
    this.editorDrafts = new GoalEditorDraftStore(this.store.goalHome, this.drafts)
    this.receipts = new GoalOperationReceipts({
      store: this.store,
      inspectRecordDriver: (record) => this.admission.inspectRecordDriver(record),
      now: this.now
    })
    this.runs = new GoalRunCommitter({
      store: this.store,
      launcher: dependencies.launcher,
      userDataPath: dependencies.userDataPath,
      now: this.now
    })
    this.continuation = new GoalContinuationControl({
      store: this.store,
      admission: this.admission,
      receipts: this.receipts,
      runs: this.runs,
      newId: this.newId,
      now: this.now
    })
    this.revisions = new GoalRevisionControl({
      store: this.store,
      admission: this.admission,
      receipts: this.receipts,
      runs: this.runs,
      continuation: this.continuation,
      projection: () => this.projectionSources(),
      now: this.now
    })
    this.legacy = new GoalLegacyAdoption({
      store: this.store,
      terminals: this.terminals,
      inspectDriver: dependencies.inspectDriver ?? inspectGoalDriver,
      now: this.now,
      newId: this.newId
    })
  }

  async list(params: GoalListParams): Promise<GoalRpcResults['goals.list']> {
    const all = await this.store.listRecords()
    const records = all.filter((record) => goalMatchesWorktree(record, params.worktree))
    const summaries = await Promise.all(
      records.map((record) => projectGoalSummary(record, this.projectionSources()))
    )
    // Why: legacy CLI goals are only known by workspace path, so a worktree filter by id hides them.
    const legacy = (await this.legacy.listUnadopted(all)).filter(
      (summary) => !params.worktree || summary.workspace.path === params.worktree
    )
    const items = [...summaries, ...legacy]
      .filter((summary) => goalMatchesFilter(summary, params.filter, params.query))
      .sort((a, b) => a.goalId.localeCompare(b.goalId))
    return { items, observedAt: this.now() }
  }

  async adoptLegacy(params: GoalAdoptLegacyParams): Promise<GoalOperation> {
    const replay = await this.receipts.replay(params)
    return replay ?? this.legacy.adopt(params, this.receipts)
  }

  async get(goalId: string): Promise<GoalDetail | null> {
    const record = await this.store.readRecord(goalId)
    if (!record) {
      return null
    }
    const summary = await projectGoalSummary(record, this.projectionSources())
    const legacy = await this.store.readOwnedLegacyRecord(record)
    const latestReceipt = record.lastOperationId
      ? await this.store.readReceipt(record.lastOperationId)
      : null
    return {
      ...summary,
      spec: record.spec,
      budget: record.budget,
      evidence: projectGoalEvidence(record, legacy),
      latestOperation: latestReceipt
        ? toGoalOperation(await this.receipts.settle(latestReceipt))
        : null
    }
  }

  operation(clientOperationId: string): Promise<GoalOperation | null> {
    return this.receipts.read(clientOperationId)
  }

  async create(params: GoalCreateParams): Promise<GoalOperation> {
    const replay = await this.receipts.replay(params)
    if (replay) {
      return replay
    }
    const target = await this.admission.validate(params.binding)
    if ('code' in target) {
      return this.receipts.reject(params, null, target)
    }
    const conflict = await this.admission.findWorkspaceConflict(target.worktreePath, null)
    if (conflict) {
      return this.receipts.reject(params, null, conflict)
    }
    const goalId = this.newId()
    const runId = this.newId()
    const now = this.now()
    const record: GoalRecord = {
      version: 1,
      goalId,
      authorityExecutionHostId: params.authorityExecutionHostId,
      createdAt: now,
      updatedAt: now,
      binding: params.binding,
      workspace: {
        selector: params.binding.worktree,
        path: target.worktreePath,
        worktreeId: target.worktreeId || null
      },
      spec: params.spec,
      budget: params.budget,
      specRevision: 1,
      runtimeFence: 0,
      continuation: 'enabled',
      archived: false,
      legacyKey: null,
      currentRun: null,
      lastOperationId: params.clientOperationId
    }
    await this.receipts.persist(
      this.receipts.build(params, goalId, 'accepted', 'ok', 'Starting the goal driver.', {
        runtimeFence: null,
        runId
      })
    )
    await this.store.writeRecord(record)
    await this.store.appendVersion(goalId, { specRevision: 1, savedAt: now, spec: params.spec })
    try {
      const launched = await this.runs.launchRun(record, runId, 'start')
      return this.receipts.persist(
        this.receipts.build(params, goalId, 'applied', 'ok', 'The goal driver is running.', {
          runtimeFence: launched.runtimeFence,
          runId
        })
      )
    } catch (error) {
      // The goal never existed for the user; only the receipt keeps the failure.
      await this.store.deleteGoal(goalId)
      return this.receipts.reject(params, null, {
        code: 'driver_error',
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  control(params: GoalControlParams): Promise<GoalOperation> {
    return this.fenced(params, (record) => {
      switch (params.action) {
        case 'pause':
          return this.continuation.pause(params, record)
        case 'resume':
          return this.continuation.resume(params, record)
        case 'stop':
          return this.continuation.stop(params, record)
      }
    })
  }

  amend(params: GoalAmendParams): Promise<GoalOperation> {
    return this.fenced(params, (record) => this.revisions.amend(params, record))
  }

  rebind(params: GoalRebindParams): Promise<GoalOperation> {
    return this.fenced(params, (record) => this.revisions.rebind(params, record))
  }

  archive(params: GoalArchiveParams): Promise<GoalOperation> {
    return this.fenced(params, (record) => this.revisions.archive(params, record))
  }

  async versions(goalId: string): Promise<GoalRpcResults['goals.versions']> {
    const record = await this.store.readRecord(goalId)
    return { items: record ? await this.revisions.versions(record) : [] }
  }

  /** Replay, existence, fence and run checks shared by every mutation on an existing goal. */
  private async fenced(
    params: GoalControlParams | GoalAmendParams | GoalRebindParams | GoalArchiveParams,
    apply: (record: GoalRecord) => Promise<GoalOperation>
  ): Promise<GoalOperation> {
    const replay = await this.receipts.replay(params)
    if (replay) {
      return replay
    }
    const record = await this.store.readRecord(params.goalId)
    if (!record) {
      return this.receipts.reject(params, null, {
        code: 'target_changed',
        message: 'The goal no longer exists.'
      })
    }
    const fence = checkFence(record, params)
    return fence ? this.receipts.reject(params, record.goalId, fence) : apply(record)
  }

  private projectionSources() {
    return {
      terminals: this.terminals,
      hooks: this.hooks,
      readLegacyRecord: (key: string) => this.store.readLegacyRecord(key),
      inspectDriver: (record: GoalRecord) => this.admission.inspectRecordDriver(record),
      now: this.now
    }
  }
}

function checkFence(
  record: GoalRecord,
  params: { expectedRuntimeFence: number; expectedRunId: string | null }
): GoalRejection | null {
  if (record.runtimeFence !== params.expectedRuntimeFence) {
    return {
      code: 'target_changed',
      message: `The goal changed (fence ${record.runtimeFence}); reload and retry.`
    }
  }
  if ((record.currentRun?.runId ?? null) !== params.expectedRunId) {
    return { code: 'target_changed', message: 'The goal is on a different run; reload and retry.' }
  }
  return null
}
