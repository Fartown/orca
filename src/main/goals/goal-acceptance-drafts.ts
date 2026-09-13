import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { runProcess } from '../../shared/child-process/run-process'
import { spawnProcess } from '../../shared/child-process/run-process'
import {
  GoalAcceptanceDraftResult,
  type GoalAcceptanceDraft
} from '../../shared/goals/goal-acceptance-draft-contract'
import type { GoalDraftAcceptanceParams } from '../../shared/goals/goal-control-contract'
import type { GoalBindingAdmission } from './goal-binding-admission'
import { inspectGoalDriver } from './goal-driver-liveness'
import { readJson, writeJsonAtomic } from './goal-record-files'
import { runAcceptanceDraft, type AcceptanceDraftInput } from './goal-acceptance-draft-runner'

type DraftDependencies = {
  goalHome: string
  entryPath: string | null
  admission: Pick<GoalBindingAdmission, 'validate'>
  resolveWorkspace?: (selector: string) => Promise<string>
  run?: typeof runProcess
  inspect?: typeof inspectGoalDriver
}

/** Attempts belong to detached runners; the App only starts, observes and requests stops. */
export class GoalAcceptanceDrafts {
  private readonly starting = new Map<string, Promise<GoalAcceptanceDraft>>()
  private readonly localRuns = new Map<string, { abort: AbortController; settled: Promise<void> }>()
  private disposed = false
  constructor(private readonly deps: DraftDependencies) {}

  async start(params: GoalDraftAcceptanceParams): Promise<GoalAcceptanceDraft> {
    if (this.disposed) {
      throw new Error('Goal service is stopping.')
    }
    const pending = this.starting.get(params.draftId)
    if (pending) {
      await pending
    }
    const task = this.startOnce(params)
    this.starting.set(params.draftId, task)
    try {
      return await task
    } finally {
      if (this.starting.get(params.draftId) === task) {
        this.starting.delete(params.draftId)
      }
    }
  }

  private async startOnce(params: GoalDraftAcceptanceParams): Promise<GoalAcceptanceDraft> {
    const dir = this.directory(params.draftId)
    const fingerprint = JSON.stringify(params)
    const previous = (await readJson(join(dir, 'input.json'))) as AcceptanceDraftInput | null
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        throw new Error('Draft ID already used.')
      }
      const saved = await this.get(params.draftId)
      if (saved) {
        return saved
      }
      throw new Error('The previous generation could not be retrieved.')
    }
    if (!this.deps.entryPath) {
      throw new Error('The guard bundle is missing.')
    }
    let result: GoalAcceptanceDraft = {
      draftId: params.draftId,
      status: 'generating',
      objective: params.objective,
      judge: params.judge,
      workspace: params.worktree ?? params.binding?.worktree ?? '',
      document: null,
      error: null,
      phase: 'starting',
      startedAt: Date.now(),
      activity: 'starting'
    }
    await mkdir(dir, { recursive: true })
    try {
      let workspace: string
      if (params.worktree && this.deps.resolveWorkspace) {
        workspace = await this.deps.resolveWorkspace(params.worktree)
      } else {
        if (!params.binding) {
          throw new Error('Select a workspace before generating its document.')
        }
        const target = await this.deps.admission.validate(params.binding)
        if ('code' in target) {
          throw new Error(target.message)
        }
        workspace = target.worktreePath
      }
      result.workspace = workspace
      const input = { ...params, fingerprint, workspace }
      await writeJsonAtomic(join(dir, 'input.json'), input)
      await writeJsonAtomic(join(dir, 'result.json'), result)
      if (this.deps.run) {
        const abort = new AbortController()
        const settled = runAcceptanceDraft(dir, input, result, { run: this.deps.run, abort })
        this.localRuns.set(params.draftId, { abort, settled })
        void settled.finally(() => this.localRuns.delete(params.draftId)).catch(() => {})
      } else {
        const child = spawnProcess({
          program: process.execPath,
          args: [join(dirname(this.deps.entryPath), 'acceptance-draft.js'), dir],
          cwd: this.deps.goalHome,
          detached: true,
          stdio: 'ignore',
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ORCA_GOAL_DETACHED: '1' }
        })
        await new Promise<void>((resolve, reject) => {
          child.once('spawn', resolve)
          child.once('error', reject)
        })
        await writeJsonAtomic(join(dir, 'owner.json'), { pid: child.pid })
        child.unref()
      }
    } catch (error) {
      result = {
        ...result,
        status: 'failed',
        phase: undefined,
        finishedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error)
      }
      await writeJsonAtomic(join(dir, 'result.json'), result)
    }
    return result
  }

  async get(draftId: string): Promise<GoalAcceptanceDraft | null> {
    const dir = this.directory(draftId)
    const parsed = GoalAcceptanceDraftResult.safeParse(await readJson(join(dir, 'result.json')))
    if (!parsed.success) {
      return null
    }
    let result = parsed.data
    if (result.status !== 'generating') {
      return this.withDocumentPath(result)
    }
    if (!this.localRuns.has(draftId)) {
      const owner = (await readJson(join(dir, 'owner.json'))) as { pid?: number } | null
      const verdict = owner?.pid
        ? await (this.deps.inspect ?? inspectGoalDriver)({
            pid: owner.pid,
            goalId: draftId,
            legacyKey: null
          })
        : { status: 'unverifiable' as const }
      // Re-read after the liveness probe: the runner may have committed its final result while exiting.
      const latest = GoalAcceptanceDraftResult.safeParse(await readJson(join(dir, 'result.json')))
      if (latest.success) {
        result = latest.data
      }
      if (result.status !== 'generating') {
        return this.withDocumentPath(result)
      }
      if (verdict.status === 'exited') {
        result = {
          ...result,
          status: 'failed',
          phase: 'interrupted',
          finishedAt: Date.now(),
          error: 'The generation process exited without a result. Retry to generate the document.'
        }
        await writeJsonAtomic(join(dir, 'result.json'), result)
        return result
      }
      if (verdict.status === 'unverifiable') {
        return { ...result, phase: 'unverifiable' }
      }
    }
    return (await readJson(join(dir, 'stop.json'))) ? { ...result, phase: 'stopping' } : result
  }

  async cancel(draftId: string): Promise<GoalAcceptanceDraft | null> {
    const local = this.localRuns.get(draftId)
    local?.abort.abort()
    // Persist before observing: a stop during startup must reach a runner that has not booted yet.
    await writeJsonAtomic(join(this.directory(draftId), 'stop.json'), { requestedAt: Date.now() })
    if (local) {
      await local.settled
    }
    return this.get(draftId)
  }

  dispose(): void {
    this.disposed = true
  }
  private directory(id: string): string {
    return join(this.deps.goalHome, 'v2', 'drafts', id)
  }
  private withDocumentPath(result: GoalAcceptanceDraft): GoalAcceptanceDraft {
    return result.status === 'ready'
      ? { ...result, documentPath: join(this.directory(result.draftId), 'acceptance.md') }
      : result
  }
}
