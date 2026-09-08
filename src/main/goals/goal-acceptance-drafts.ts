import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { runProcess } from '../../shared/child-process/run-process'
import {
  GoalAcceptanceDraftResult,
  type GoalAcceptanceDraft
} from '../../shared/goals/goal-acceptance-draft-contract'
import type { GoalDraftAcceptanceParams } from '../../shared/goals/goal-control-contract'
import { GOAL_AGENT_PROVIDERS } from '../../shared/goals/goal-agent-provider'
import { acceptanceDraftPrompt } from '../../shared/goals/goal-acceptance-prompt'
import type { GoalBindingAdmission } from './goal-binding-admission'

type DraftJob = {
  fingerprint: string
  result: GoalAcceptanceDraft
  abort: AbortController
  settled: Promise<void>
}

type DraftDependencies = {
  goalHome: string
  entryPath: string | null
  admission: Pick<GoalBindingAdmission, 'validate'>
  run?: typeof runProcess
}

/** Drafting has no goal record, terminal injection or execution-loop side effects. */
export class GoalAcceptanceDrafts {
  private readonly jobs = new Map<string, DraftJob>()
  private disposed = false

  constructor(private readonly deps: DraftDependencies) {}

  async start(params: GoalDraftAcceptanceParams): Promise<GoalAcceptanceDraft> {
    if (this.disposed) {
      throw new Error('Goal service is stopping.')
    }
    const fingerprint = JSON.stringify(params)
    const existing = this.jobs.get(params.draftId)
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new Error('Draft ID already used.')
      }
      return { ...existing.result }
    }
    if (!this.deps.entryPath) {
      throw new Error('The guard bundle is missing.')
    }
    if (this.jobs.size >= 32) {
      for (const [id, job] of this.jobs) {
        if (job.result.status !== 'generating') {
          this.jobs.delete(id)
        }
      }
    }
    if (this.jobs.size >= 32) {
      throw new Error('Too many documents are being generated. Wait for one to finish.')
    }
    const job: DraftJob = {
      fingerprint,
      abort: new AbortController(),
      result: {
        draftId: params.draftId,
        status: 'generating',
        objective: params.objective,
        judge: params.judge,
        workspace: params.binding.worktree,
        document: null,
        error: null
      },
      settled: Promise.resolve()
    }
    this.jobs.set(params.draftId, job)
    job.settled = this.generate(job, params)
    return { ...job.result }
  }

  async get(draftId: string): Promise<GoalAcceptanceDraft | null> {
    const job = this.jobs.get(draftId)
    if (job) {
      return { ...job.result }
    }
    try {
      return GoalAcceptanceDraftResult.parse(
        JSON.parse(await readFile(join(this.directory(draftId), 'result.json'), 'utf8'))
      )
    } catch {
      return null
    }
  }

  async cancel(draftId: string): Promise<GoalAcceptanceDraft | null> {
    const job = this.jobs.get(draftId)
    if (job?.result.status === 'generating') {
      job.abort.abort()
      await job.settled
    }
    return this.get(draftId)
  }

  dispose(): void {
    this.disposed = true
    for (const job of this.jobs.values()) {
      job.abort.abort()
    }
  }

  private directory(id: string): string {
    return join(this.deps.goalHome, 'v2', 'drafts', id)
  }

  private async generate(job: DraftJob, params: GoalDraftAcceptanceParams): Promise<void> {
    try {
      const target = await this.deps.admission.validate(params.binding)
      if ('code' in target) {
        throw new Error(target.message)
      }
      job.result.workspace = target.worktreePath
      const dir = this.directory(params.draftId)
      await mkdir(dir, { recursive: true })
      const input = join(dir, 'input.json')
      const previous = await readFile(input, 'utf8').catch(() => null)
      if (previous) {
        if (JSON.parse(previous).fingerprint !== job.fingerprint) {
          job.result = { ...job.result, status: 'failed', error: 'Draft ID already used.' }
          return
        }
        const saved = await readFile(join(dir, 'result.json'), 'utf8').catch(() => null)
        if (!saved) {
          throw new Error('The previous generation was interrupted. Generate a new document.')
        }
        job.result = GoalAcceptanceDraftResult.parse(JSON.parse(saved))
        return
      }
      await writeFile(input, JSON.stringify({ ...params, fingerprint: job.fingerprint }), 'utf8')
      const agent = GOAL_AGENT_PROVIDERS[params.judge]
      const outFile = join(dir, 'agent-document.md')
      const result = await (this.deps.run ?? runProcess)({
        program: params.judge,
        args: agent.args(acceptanceDraftPrompt(params.objective, params.acceptanceContext), {
          outFile,
          cwd: target.worktreePath
        }),
        cwd: target.worktreePath,
        env: process.env,
        detached: true,
        terminationBarrier: true,
        timeoutMs: 600_000,
        signal: job.abort.signal,
        maxOutputBytes: 8_000_000
      })
      if (job.abort.signal.aborted) {
        job.result.status = 'cancelled'
      } else if (result.code !== 0 || result.timedOut || result.outputTruncated) {
        throw new Error(
          result.stderr.trim().slice(-1500) ||
            (await agent.read({ ...result, outFile }).catch(() => null))?.slice(-1500) ||
            'Acceptance document generation failed or timed out.'
        )
      } else {
        const document = await agent.read({ ...result, outFile })
        if (document?.startsWith('验收裁判报错:')) {
          throw new Error(document)
        }
        if (!document || document.length > 32_000) {
          throw new Error('Guard returned an empty or oversized acceptance document.')
        }
        await writeFile(join(dir, 'acceptance.md'), document, 'utf8')
        job.result = job.abort.signal.aborted
          ? { ...job.result, status: 'cancelled', document: null }
          : { ...job.result, status: 'ready', document }
      }
    } catch (error) {
      job.result = {
        ...job.result,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      }
    }
    try {
      const file = join(this.directory(params.draftId), 'result.json')
      await mkdir(dirname(file), { recursive: true })
      await writeFile(`${file}.tmp`, JSON.stringify(job.result), 'utf8')
      await rename(`${file}.tmp`, file)
    } catch (error) {
      job.result = { ...job.result, status: 'failed', error: String(error) }
    }
  }
}
