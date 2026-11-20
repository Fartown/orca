import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { AgentHookServer } from '../agent-hooks/server/agent-hook-server'
import { buildBody, postHookEvent } from '../agent-hooks/server/testing/server.test-fixtures'

// Shapes captured from Codex 0.164: a /side fork is its own session with no rollout.
const MAIN = '01a16f91-ac03-73f2-acdc-2bc83dbedce3'
const SIDE = '01a16f91-c78b-7420-b400-e3d4afc8626a'
const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

// D-009 keeps a rollout-less Codex session from replacing a backed row.
it('keeps the backed row when a new ephemeral Codex conversation follows a finished turn', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-side-thread-'))
  dirs.push(dir)
  const server = new AgentHookServer()
  await server.start({ env: 'production' })
  try {
    const main = { session_id: MAIN, transcript_path: join(dir, 'rollout-main.jsonl') }
    await postHookEvent(
      server,
      buildBody({ ...main, hook_event_name: 'UserPromptSubmit', prompt: 'main task' }),
      '/hook/codex'
    )
    await postHookEvent(server, buildBody({ ...main, hook_event_name: 'Stop' }), '/hook/codex')
    const next = { session_id: SIDE, transcript_path: null }
    await postHookEvent(
      server,
      buildBody({ ...next, hook_event_name: 'SessionStart', source: 'startup' }),
      '/hook/codex'
    )
    await postHookEvent(
      server,
      buildBody({ ...next, hook_event_name: 'UserPromptSubmit', prompt: 'next task' }),
      '/hook/codex'
    )
    expect(server.getStatusSnapshot()[0]).toMatchObject({
      state: 'done',
      prompt: 'main task',
      providerSession: { id: MAIN }
    })
  } finally {
    server.stop()
  }
})

it('keeps a still-working backed row when a new ephemeral Codex conversation starts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-side-thread-'))
  dirs.push(dir)
  const server = new AgentHookServer()
  await server.start({ env: 'production' })
  const post = (payload: Record<string, unknown>): Promise<Response> =>
    postHookEvent(server, buildBody(payload), '/hook/codex')
  try {
    const main = { session_id: MAIN, transcript_path: join(dir, 'rollout-main.jsonl') }
    const next = { session_id: SIDE, transcript_path: null }
    await post({ ...main, hook_event_name: 'UserPromptSubmit', prompt: 'main task' })
    await post({ ...next, hook_event_name: 'SessionStart', source: 'startup' })
    await post({ ...next, hook_event_name: 'UserPromptSubmit', prompt: 'next task' })
    expect(server.getStatusSnapshot()[0]).toMatchObject({
      state: 'working',
      prompt: 'main task',
      providerSession: { id: MAIN }
    })
  } finally {
    server.stop()
  }
})
