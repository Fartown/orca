import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runProcess } from '../../shared/child-process/run-process'
import { getManagedScript } from '../codex/codex-hook-script'

describe.skipIf(process.platform === 'win32')('Codex nested hook delivery', () => {
  let dir: string
  let server: Server
  let port: number
  let delivered: string[]

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'orca-codex-nested-'))
    delivered = []
    server = createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', () => {
        delivered.push(body)
        res.end('ok')
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as { port: number }).port
    writeFileSync(join(dir, 'hook.sh'), getManagedScript('posix'))
    writeFileSync(join(dir, 'endpoint.env'), '')
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    rmSync(dir, { recursive: true, force: true })
  })

  async function send(
    event: string,
    caller = '',
    extra: Record<string, unknown> = {},
    offline = false,
    strippedPath = false
  ) {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('ORCA_'))
    )
    return runProcess({
      program: '/bin/sh',
      args: [join(dir, 'hook.sh')],
      timeoutMs: 5_000,
      env: {
        ...env,
        ...(strippedPath ? { PATH: '' } : {}),
        CODEX_THREAD_ID: caller,
        ORCA_PANE_KEY: 'tab:11111111-1111-4111-8111-111111111111',
        ORCA_AGENT_HOOK_PORT: offline ? '' : String(port),
        ORCA_AGENT_HOOK_TOKEN: 'test',
        ORCA_AGENT_HOOK_ENDPOINT: join(dir, 'endpoint.env')
      },
      input: JSON.stringify({ hook_event_name: event, session_id: 'B', ...extra })
    })
  }

  it('drops the entire nested invocation sequence before HTTP and spooling', async () => {
    for (const event of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop']) {
      expect(await send(event, 'A')).toMatchObject({ code: 0, stderr: '', timedOut: false })
    }
    expect(delivered.length).toBe(0)
    expect(readdirSync(dir).sort()).toEqual(['endpoint.env', 'hook.sh'])
  })

  it('never queues nested traffic for replay when the endpoint is unavailable', async () => {
    await send('SessionStart', 'A', {}, true)
    expect(readdirSync(dir).sort()).toEqual(['endpoint.env', 'hook.sh'])
  })

  it('keeps main hooks, native subagents, and an immediate same-pane relaunch', async () => {
    await send('SessionStart', '', { session_id: 'A' })
    await send('SubagentStart', '', { session_id: 'A', agent_id: 'child' })
    await send('PreToolUse', '', { session_id: 'A', agent_id: 'child' })
    await send('SubagentStop', '', { session_id: 'A', agent_id: 'child' })
    await send('Stop', '', { session_id: 'A' })
    await send('SessionStart', '', { session_id: 'C' })
    expect(delivered).toHaveLength(6)
  })

  it('drains a large nested payload and tolerates a stripped PATH', async () => {
    const result = await send(
      'UserPromptSubmit',
      'A',
      { prompt: 'x'.repeat(1_000_000) },
      false,
      true
    )
    expect(result).toMatchObject({ code: 0, stderr: '', timedOut: false })
    expect(delivered.length).toBe(0)
  })

  it('retains the ordinary offline spool for a top-level invocation', async () => {
    await send('SessionStart', '', { session_id: 'A' }, true)
    expect(readdirSync(dir)).toContain('spool')
  })
})

it('routes Windows nested hooks to the existing stdin drain before posting', () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
  try {
    const script = getManagedScript('local')
    const guard = 'if defined CODEX_THREAD_ID goto :orca_agent_hook_drain_stdin'
    expect(script).toContain(guard)
    expect(script.indexOf(guard)).toBeLessThan(script.indexOf('curl.exe'))
    expect(script).toContain(':orca_agent_hook_drain_stdin')
  } finally {
    vi.restoreAllMocks()
  }
})
