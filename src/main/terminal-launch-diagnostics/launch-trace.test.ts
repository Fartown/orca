import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLocalFileSink } from '../observability/local-file-sink'
import { setActiveSink } from '../observability/tracer'
import { createDaemonFileLog } from '../daemon/daemon-file-log'
import { traceDaemonTerminalLaunch } from './daemon-launch-trace'
import { launchReference } from '../../shared/terminal-launch-diagnostics/launch-evidence'
import {
  recordTerminalLaunchStage,
  traceTerminalClaimOwnerLiveness,
  traceTerminalLaunchRpc,
  traceTerminalPtyAdmission
} from './launch-trace'

const dirs: string[] = []
const closes: (() => void)[] = []
afterEach(() => {
  setActiveSink(null)
  closes.splice(0).forEach((close) => close())
  dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }))
})

function traceFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'orca-launch-trace-'))
  dirs.push(dir)
  const filePath = join(dir, 'main.trace.ndjson')
  const sink = createLocalFileSink({ filePath, batchWindowMs: 100_000 })
  closes.push(() => sink.close())
  setActiveSink(sink)
  return filePath
}

describe('durable launch tracing', () => {
  it.each([
    'terminal.create',
    'terminal.createAgentSession',
    'terminal.ensureAgentSession',
    'session.tabs.createTerminal',
    'worktree.activate',
    'session.tabs.activate',
    'terminal.resolvePane'
  ])('captures %s before completion and joins nested PTY evidence', async (method) => {
    const file = traceFile()
    const result = {
      id: 'req',
      ok: true,
      result: { terminal: { tabId: 'tab', leafId: 'leaf', ptyId: 'pty' } }
    }
    await expect(
      traceTerminalLaunchRpc(
        { method, id: 'req', params: { command: 'private-command' } },
        { clientId: 'private-credential', clientKind: 'runtime' },
        async () => {
          expect(readFileSync(file, 'utf8')).toContain('rpc-accepted')
          return traceTerminalPtyAdmission(
            { tabId: 'tab', connectionId: 'ssh-target' },
            async () => {
              recordTerminalLaunchStage('provider-returned', {
                tabId: 'tab',
                ptyId: 'pty',
                isReattach: true
              })
              return result
            }
          )
        }
      )
    ).resolves.toBe(result)
    const rows = readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(new Set(rows.map((r) => r.traceId)).size).toBe(1)
    expect(rows.some((r) => r.name === 'terminal.launch.rpc' && r.attributes.result.tabRef)).toBe(
      true
    )
    expect(readFileSync(file, 'utf8')).not.toMatch(/private-command|private-credential/)
  })

  it.each([undefined, 'payload-request'])(
    'keeps the RPC envelope request identity over %s',
    async (requestId) => {
      const file = traceFile()
      await traceTerminalLaunchRpc(
        { method: 'terminal.create', id: 'envelope-request', params: { requestId } },
        undefined,
        async () => ({ ok: true })
      )
      const rows = readFileSync(file, 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      expect(rows).toHaveLength(2)
      for (const row of rows) {
        expect(row.attributes.requestRef).toBe(launchReference('envelope-request'))
      }
    }
  )

  it('keeps overlapping requests separate', async () => {
    const file = traceFile()
    await Promise.all(
      ['one', 'two'].map((id) =>
        traceTerminalLaunchRpc({ method: 'terminal.create', id }, undefined, async () => {
          await Promise.resolve()
          recordTerminalLaunchStage('provider-returned', { ptyId: id })
          return { ok: true }
        })
      )
    )
    const rows = readFileSync(file, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(new Set(rows.map((r) => r.traceId)).size).toBe(2)
  })

  it('does not serialize thrown exception text or change the thrown error', async () => {
    const file = traceFile(),
      error = new Error('private-command private-password')
    await expect(
      traceTerminalLaunchRpc({ method: 'terminal.create', id: 'req' }, undefined, async () => {
        throw error
      })
    ).rejects.toBe(error)
    expect(readFileSync(file, 'utf8')).toContain('terminal_launch_failed')
    expect(readFileSync(file, 'utf8')).not.toMatch(/private-command|private-password/)
  })

  it('preserves live/exited/unverifiable probe outcomes without additional probes', async () => {
    const file = traceFile()
    for (const value of [true, false]) {
      const probe = vi.fn(async () => value)
      expect(await traceTerminalClaimOwnerLiveness({}, probe)).toBe(value)
      expect(probe).toHaveBeenCalledOnce()
    }
    const error = new Error('private-owner-error')
    await expect(
      traceTerminalClaimOwnerLiveness({}, async () => {
        throw error
      })
    ).rejects.toBe(error)
    const output = readFileSync(file, 'utf8')
    expect(output).toContain('claim-owner-live')
    expect(output).toContain('claim-owner-exited')
    expect(output).toContain('claim-owner-unverifiable')
    expect(output).not.toContain(error.message)
  })

  it('remains fail-open with no sink or a failing sink, and does not trace terminal input', async () => {
    const invoke = vi.fn(async () => 42)
    setActiveSink({
      push() {
        throw new Error('disk full')
      },
      flush() {
        throw new Error('disk full')
      },
      close() {}
    })
    await expect(
      traceTerminalLaunchRpc({ method: 'terminal.create', id: 'req' }, undefined, invoke)
    ).resolves.toBe(42)
    expect(invoke).toHaveBeenCalledOnce()
    const file = traceFile()
    await traceTerminalLaunchRpc(
      { method: 'terminal.send', id: 'req', params: { text: 'private-input' } },
      undefined,
      invoke
    )
    expect(readFileSync(file, 'utf8')).toBe('')
  })

  it('records daemon requests and actual creation/attachment/failure on disk', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orca-launch-daemon-'))
    dirs.push(dir)
    const file = join(dir, 'daemon.log'),
      log = createDaemonFileLog(file)
    closes.push(() => log.close())
    const request = {
      id: 'private-request',
      payload: { sessionId: 'private-session', command: 'private-command' }
    }
    await traceDaemonTerminalLaunch(log, 'private-client', request, async () => ({
      isNew: true,
      incarnationId: 'incarnation'
    }))
    await traceDaemonTerminalLaunch(log, 'private-client', request, async () => ({ isNew: false }))
    await expect(
      traceDaemonTerminalLaunch(log, 'private-client', request, async () => {
        throw new Error('private-failure')
      })
    ).rejects.toThrow('private-failure')
    const output = readFileSync(file, 'utf8')
    for (const event of [
      'terminal-launch-request',
      'terminal-launch-created',
      'terminal-launch-attached',
      'terminal-launch-failed'
    ]) {
      expect(output).toContain(event)
    }
    expect(output).not.toMatch(/private-/)
    await expect(
      traceDaemonTerminalLaunch(
        {
          log() {
            throw new Error('full')
          },
          close() {}
        },
        'client',
        request,
        async () => 99
      )
    ).resolves.toBe(99)
  })
})
