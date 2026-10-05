import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RelayAgentHookServer } from '../../relay/agent-hook-server'
import type { AgentHookRelayEnvelope } from '../../shared/agent-hook-relay'
import { makePaneKey } from '../../shared/stable-pane-id'

const probe = vi.hoisted(() =>
  vi.fn(async (): Promise<'live' | 'unverifiable' | 'exited'> => 'unverifiable')
)
vi.mock('../../shared/agent-process-presence-probe', () => ({ probeAgentProcessPresence: probe }))

const OWNER_PID = 4001
const OTHER_PID = 4002
const paneKey = makePaneKey('tab-1', '11111111-1111-4111-8111-111111111111')
const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup()
  }
  probe.mockReset()
  probe.mockResolvedValue('unverifiable')
})

async function startRelay() {
  const dir = await mkdtemp(join(tmpdir(), 'relay-claude-guard-'))
  const forward = vi.fn<(envelope: AgentHookRelayEnvelope) => void>()
  const server = new RelayAgentHookServer({ endpointDir: dir, forward })
  cleanups.push(async () => {
    server.stop()
    await rm(dir, { recursive: true, force: true })
  })
  await server.start()
  const { port, token } = server.getCoordinates()
  const post = async (event: string, session: string, pid: number, reason?: string) => {
    const response = await fetch(`http://127.0.0.1:${port}/hook/claude`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Orca-Agent-Hook-Token': token },
      body: JSON.stringify({
        paneKey,
        tabId: 'tab-1',
        worktreeId: 'wt-1',
        agentProcess: JSON.stringify({
          pid,
          platform: process.platform,
          startTime: `birth-${pid}`
        }),
        payload: {
          hook_event_name: event,
          session_id: session,
          source: 'startup',
          reason,
          ...(event === 'UserPromptSubmit' ? { prompt: `${session} task` } : {})
        }
      })
    })
    expect(response.status).toBe(204)
  }
  const forwardedSessions = () =>
    forward.mock.calls.map(([envelope]) => envelope.providerSession?.id).filter(Boolean)
  return { forward, post, forwardedSessions }
}

describe('relay Claude activity window with process presence', () => {
  it('refuses a background call from another live process and asks about the owner', async () => {
    const { post, forwardedSessions } = await startRelay()
    probe.mockResolvedValue('live')
    await post('UserPromptSubmit', 'session-a', OWNER_PID)
    await post('SessionStart', 'session-b', OTHER_PID)
    await vi.waitFor(() => expect(probe).toHaveBeenCalledOnce())
    await post('UserPromptSubmit', 'session-b', OTHER_PID)
    expect(forwardedSessions()).not.toContain('session-b')
    expect(forwardedSessions().at(-1)).toBe('session-a')
  })

  it('publishes the exited owner and lets the relaunch take the pane', async () => {
    const { forward, post } = await startRelay()
    probe.mockResolvedValue('exited')
    await post('UserPromptSubmit', 'session-a', OWNER_PID)
    await post('SessionStart', 'session-b', OTHER_PID)
    await vi.waitFor(() =>
      expect(forward.mock.lastCall?.[0]).toMatchObject({
        hookEventName: 'AgentProcessExit',
        agentPresence: { ended: true, process: { pid: OWNER_PID } }
      })
    )
    await post('UserPromptSubmit', 'session-b', OTHER_PID)
    expect(forward.mock.lastCall?.[0]).toMatchObject({
      providerSession: { id: 'session-b' },
      agentPresence: { process: { pid: OTHER_PID } }
    })
  })

  it("accepts the owner process's own session switch without probing", async () => {
    const { forward, post } = await startRelay()
    await post('UserPromptSubmit', 'session-a', OWNER_PID)
    await post('SessionEnd', 'session-a', OWNER_PID, 'clear')
    await post('UserPromptSubmit', 'session-b', OWNER_PID)
    expect(forward.mock.lastCall?.[0].providerSession?.id).toBe('session-b')
    expect(probe).not.toHaveBeenCalled()
  })
})

describe('client admission of presence-aware relay traffic', () => {
  async function relayIntoClient() {
    vi.resetModules()
    const { AgentHookServer } = await import('../agent-hooks/server')
    const client = new AgentHookServer()
    cleanups.push(async () => client.stop())
    const relay = await startRelay()
    relay.forward.mockImplementation((envelope) => client.ingestRemote(envelope, 'ssh-host'))
    const clientSession = () =>
      client._getStateForTests().lastStatusByPaneKey.get(paneKey)?.providerSession?.id
    return { ...relay, clientSession }
  }

  it('follows the relay when the owner process switches sessions inside the window', async () => {
    const { post, clientSession } = await relayIntoClient()
    await post('UserPromptSubmit', 'session-a', OWNER_PID)
    await post('SessionEnd', 'session-a', OWNER_PID, 'clear')
    await post('UserPromptSubmit', 'session-c', OWNER_PID)
    expect(clientSession()).toBe('session-c')
  })

  it('still keeps the owner when the relay refuses a background call', async () => {
    const { post, clientSession } = await relayIntoClient()
    probe.mockResolvedValue('live')
    await post('UserPromptSubmit', 'session-a', OWNER_PID)
    await post('UserPromptSubmit', 'session-b', OTHER_PID)
    expect(clientSession()).toBe('session-a')
  })
})
