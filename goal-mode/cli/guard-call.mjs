// 调一次守卫:渲染 G1、跑守卫 agent、取末尾 json 代码块并校验格式。格式不合格带着具体错误重跑一次。
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { renderPrompt } from './continuation-prompt.mjs'
import { parseGuardVerdict } from './guard-verdict.mjs'

/** 执行器是 TypeScript(走 spawnProcess),只在打包后的驱动里按需加载;测试注入替身。 */
async function defaultRunAgent(input) {
  const { runGoalAgent } = await import('../../src/shared/goals/goal-agent-run.ts')
  return runGoalAgent(input)
}

/**
 * @param {{ agent: 'claude'|'codex', cwd: string, timeoutMs: number, vars: object, signal?: AbortSignal }} input
 * @returns {Promise<{ ok: true, verdict: object, prompt: string, attempts: object[] } | { ok: false, reason: string, prompt: string, attempts: object[] }>}
 */
export async function callGuard(input, { runAgent = defaultRunAgent } = {}) {
  const prompt = await renderPrompt('guard', input.vars, { flatten: false })
  const attempts = []
  let text = prompt
  for (let attempt = 1; ; attempt += 1) {
    const result = await runAgent({
      agent: input.agent,
      prompt: text,
      cwd: input.cwd,
      timeoutMs: input.timeoutMs,
      signal: input.signal
    })
    if (!result.ok) {
      attempts.push({ attempt, error: result.error })
      return { ok: false, reason: result.error, prompt, attempts }
    }
    const parsed = parseGuardVerdict(result.text)
    attempts.push({
      attempt,
      output: result.text,
      ...(parsed.ok ? {} : { formatError: parsed.error })
    })
    if (parsed.ok) {
      return { ok: true, verdict: parsed.verdict, prompt, attempts }
    }
    if (attempt === 2) {
      return { ok: false, reason: `守卫两次输出的格式都不合格:${parsed.error}`, prompt, attempts }
    }
    text = `${prompt}\n\n你上一次的输出格式不合格:${parsed.error}。请重新完成这次判断,最后严格按上面的要求输出 json 代码块。`
  }
}

/** 每次守卫调用的全文留档;逐轮日志只记结论与一句观察。 */
export async function saveGuardCall(dir, sequence, entry) {
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, `${sequence}.json`)
  await fs.writeFile(file, `${JSON.stringify(entry, null, 2)}\n`, 'utf8')
  return file
}
