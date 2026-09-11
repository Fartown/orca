import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { RelayAgentHookServer } from '../../relay/agent-hook-server'
import { AgentHookServer } from '../agent-hooks/server'
import { makePaneKey } from '../../shared/stable-pane-id'
import type { AgentHookRelayEnvelope } from '../../shared/agent-hook-relay'

const PANE = makePaneKey('relay-window', '11111111-1111-4111-8111-111111111111')
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

describe('Claude window across the real relay HTTP transport', () => {
  let dir: string
  let relay: RelayAgentHookServer
  let main: AgentHookServer
  let now: number
  let forward: Mock<(event: AgentHookRelayEnvelope) => void>

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'claude-activity-relay-'))
    now = 100
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    main = new AgentHookServer()
    forward = vi.fn((event) => main.ingestRemote(event, 'fixture-host'))
    relay = new RelayAgentHookServer({ endpointDir: dir, forward })
  })

  afterEach(() => {
    relay.stop()
    main.stop()
    vi.restoreAllMocks()
    rmSync(dir, { recursive: true, force: true })
  })

  async function post(id: string, name: string) {
    const { port, token } = relay.getCoordinates()
    const response = await fetch(`http://127.0.0.1:${port}/hook/claude`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Orca-Agent-Hook-Token': token },
      body: JSON.stringify({
        paneKey: PANE,
        payload: {
          hook_event_name: name,
          session_id: id,
          source: 'startup',
          prompt: 'fixture',
          tool_name: 'Bash'
        }
      })
    })
    expect(response.status).toBe(204)
  }

  it('drops the whole competing sequence before forwarding, then admits after silence', async () => {
    await relay.start()
    await post(A, 'UserPromptSubmit')
    const original = main._getStateForTests().lastStatusByPaneKey.get(PANE)
    for (const name of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop']) {
      await post(B, name)
      expect(forward).toHaveBeenCalledTimes(1)
      expect(main._getStateForTests().lastStatusByPaneKey.get(PANE)).toBe(original)
    }
    expect(forward.mock.calls[0][0]).not.toHaveProperty('claudeSessionActivityByPaneKey')
    now += 30_000
    await post(B, 'SessionStart')
    expect(forward).toHaveBeenCalledTimes(2)
    expect(main._getStateForTests().lastStatusByPaneKey.get(PANE)?.providerSession?.id).toBe(B)
  })

  it('does not turn relay spool replay into a fresh activity observation', async () => {
    mkdirSync(join(dir, 'spool'))
    writeFileSync(
      join(dir, 'spool', 'pane-claude.jsonl'),
      `${JSON.stringify({
        paneKey: PANE,
        source: 'claude',
        env: 'remote',
        version: '1',
        hookEventName: 'UserPromptSubmit',
        receivedAt: Date.now(),
        payload: { hook_event_name: 'UserPromptSubmit', session_id: A, prompt: 'spooled' }
      })}\n`
    )
    await relay.start()
    expect(forward).toHaveBeenCalledTimes(1)
    expect(main._getStateForTests().claudeSessionActivityByPaneKey.size).toBe(0)
    await post(B, 'SessionStart')
    expect(forward).toHaveBeenCalledTimes(2)
    expect(main._getStateForTests().lastStatusByPaneKey.get(PANE)?.providerSession?.id).toBe(B)
  })
})
