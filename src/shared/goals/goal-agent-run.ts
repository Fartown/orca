import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runProcess } from '../child-process/run-process'
import { GOAL_AGENT_PROVIDERS, type GoalAgentFamily } from './goal-agent-provider'

export type GoalAgentRunInput = {
  agent: GoalAgentFamily
  prompt: string
  cwd: string
  timeoutMs: number
  signal?: AbortSignal
}

export type GoalAgentRunResult = { ok: true; text: string } | { ok: false; error: string }

/**
 * One headless guard call. Full access on purpose: verifying a goal means building,
 * running and writing scratch files, and the working agent already runs unsandboxed
 * in the same workspace; the guard's boundaries live in its prompt.
 */
export async function runGoalAgent(
  input: GoalAgentRunInput,
  run: typeof runProcess = runProcess
): Promise<GoalAgentRunResult> {
  const provider = GOAL_AGENT_PROVIDERS[input.agent]
  const scratch = await mkdtemp(join(tmpdir(), 'orca-goal-guard-'))
  const outFile = join(scratch, 'verdict.md')
  try {
    const output = await run({
      program: input.agent,
      args: provider.args(input.prompt, {
        cwd: input.cwd,
        outFile,
        sandbox: 'danger-full-access'
      }),
      cwd: input.cwd,
      env: process.env,
      detached: true,
      terminationBarrier: true,
      timeoutMs: input.timeoutMs,
      signal: input.signal,
      maxOutputBytes: 8_000_000
    })
    if (input.signal?.aborted) {
      return { ok: false, error: '守卫调用已取消' }
    }
    const text = await provider.read({ ...output, outFile }).catch(() => null)
    if (output.timedOut) {
      return { ok: false, error: `守卫超过 ${Math.round(input.timeoutMs / 1000)} 秒没有给出结论` }
    }
    if (!text || text.startsWith('验收裁判报错:')) {
      const detail = (text || output.stderr || output.stdout || '').trim().slice(-800)
      return {
        ok: false,
        error: `守卫(${input.agent})没有给出结论,退出码 ${output.code}${detail ? `:${detail}` : ''}`
      }
    }
    return { ok: true, text }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    await rm(scratch, { recursive: true, force: true }).catch(() => {})
  }
}
