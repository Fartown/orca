import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { runProcess } from '../../shared/child-process/run-process'
import type { GoalAcceptanceDraft } from '../../shared/goals/goal-acceptance-draft-contract'
import type { GoalDraftAcceptanceParams } from '../../shared/goals/goal-control-contract'
import { GOAL_AGENT_PROVIDERS } from '../../shared/goals/goal-agent-provider'
import { acceptanceDraftPrompt } from '../../shared/goals/goal-acceptance-prompt'
import { readJson, writeJsonAtomic } from './goal-record-files'

export type AcceptanceDraftInput = GoalDraftAcceptanceParams & {
  fingerprint: string
  workspace: string
}

/** Only structured activity categories leave the runner; never model reasoning or tool payloads. */
export function draftActivityObserver(
  update: (activity: NonNullable<GoalAcceptanceDraft['activity']>) => void
) {
  const decoder = new StringDecoder('utf8')
  let buffer = ''
  return (chunk: Buffer | string): void => {
    buffer += typeof chunk === 'string' ? chunk : decoder.write(chunk)
    const lines = buffer.split('\n')
    buffer = lines.pop()!.slice(-262_144)
    for (const line of lines) {
      try {
        const event = JSON.parse(line)
        if (
          event.type === 'thread.started' ||
          (event.type === 'system' && event.subtype === 'init')
        ) {
          update('connected')
        } else if (
          event.type === 'item.started' &&
          ['command_execution', 'mcp_tool_call', 'web_search'].includes(event.item?.type)
        ) {
          update('tool')
        } else if (
          event.type === 'item.completed' &&
          ['command_execution', 'mcp_tool_call', 'web_search'].includes(event.item?.type)
        ) {
          update('tool_done')
        } else if (
          event.type === 'assistant' &&
          event.message?.content?.some((part: { type: string }) => part.type === 'tool_use')
        ) {
          update('tool')
        } else if (
          event.type === 'user' &&
          event.message?.content?.some((part: { type: string }) => part.type === 'tool_result')
        ) {
          update('tool_done')
        } else if (
          (event.type === 'item.completed' && event.item?.type === 'agent_message') ||
          event.type === 'result'
        ) {
          update('writing')
        }
      } catch {
        /* Ignore incomplete or non-event output. */
      }
    }
  }
}

export async function runAcceptanceDraft(
  dir: string,
  input: AcceptanceDraftInput,
  initial: GoalAcceptanceDraft,
  dependencies: { run?: typeof runProcess; abort?: AbortController } = {}
): Promise<void> {
  const abort = dependencies.abort ?? new AbortController()
  let result = { ...initial }
  let writes = Promise.resolve()
  let writeError: unknown
  const save = (): void => {
    const snapshot = { ...result }
    writes = writes
      .then(() => writeJsonAtomic(join(dir, 'result.json'), snapshot))
      .catch((error) => {
        writeError = error
      })
  }
  const readStop = async (): Promise<void> => {
    if (await readJson(join(dir, 'stop.json'))) {
      abort.abort()
    }
  }
  const timer = setInterval(() => {
    void readStop().catch(() => {})
  }, 250)
  try {
    await readStop()
    result = { ...result, phase: 'working' }
    save()
    const agent = GOAL_AGENT_PROVIDERS[input.judge]
    const outFile = join(dir, 'agent-document.md')
    const output = await (dependencies.run ?? runProcess)({
      program: input.judge,
      args: agent.args(acceptanceDraftPrompt(input.objective, input.acceptanceContext), {
        outFile,
        cwd: input.workspace,
        streamEvents: true
      }),
      cwd: input.workspace,
      env: process.env,
      detached: true,
      terminationBarrier: true,
      timeoutMs: 600_000,
      signal: abort.signal,
      maxOutputBytes: 8_000_000,
      onStdout: draftActivityObserver((activity) => {
        result = { ...result, activity, lastActivityAt: Date.now() }
        save()
      })
    })
    await readStop()
    if (abort.signal.aborted) {
      result = { ...result, status: 'cancelled', document: null }
    } else {
      if (output.code !== 0 || output.timedOut || output.outputTruncated) {
        throw new Error(
          output.stderr.trim().slice(-1500) ||
            (await agent.read({ ...output, outFile }).catch(() => null))?.slice(-1500) ||
            'Acceptance document generation failed or timed out.'
        )
      }
      const document = await agent.read({ ...output, outFile })
      if (document?.startsWith('验收裁判报错:')) {
        throw new Error(document)
      }
      if (!document || document.length > 32_000) {
        throw new Error('Guard returned an empty or oversized acceptance document.')
      }
      await writeFile(join(dir, 'acceptance.md'), document, 'utf8')
      await readStop()
      result = abort.signal.aborted
        ? { ...result, status: 'cancelled', document: null }
        : { ...result, status: 'ready', document, documentPath: join(dir, 'acceptance.md') }
    }
  } catch (error) {
    result = {
      ...result,
      status: abort.signal.aborted ? 'cancelled' : 'failed',
      error: abort.signal.aborted ? null : String(error instanceof Error ? error.message : error)
    }
  } finally {
    clearInterval(timer)
    result = { ...result, phase: undefined, finishedAt: Date.now() }
    save()
    await writes
  }
  if (writeError) {
    throw writeError
  }
}

export async function runAcceptanceDraftFile(dir: string): Promise<void> {
  const input = JSON.parse(await readFile(join(dir, 'input.json'), 'utf8')) as AcceptanceDraftInput
  const initial = JSON.parse(
    await readFile(join(dir, 'result.json'), 'utf8')
  ) as GoalAcceptanceDraft
  await writeJsonAtomic(join(dir, 'owner.json'), { pid: process.pid })
  await runAcceptanceDraft(dir, input, initial)
}
