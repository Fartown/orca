import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentHookServer } from '../agent-hooks/server'
import { buildBody, PANE, postHookEvent } from '../agent-hooks/server.test-fixtures'

vi.mock('../telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../telemetry/cohort-classifier', () => ({ getCohortAtEmit: () => ({}) }))

const probe = vi.hoisted(() =>
  vi.fn(async (): Promise<'live' | 'unverifiable' | 'exited'> => 'unverifiable')
)
vi.mock('../../shared/agent-process-presence-probe', () => ({ probeAgentProcessPresence: probe }))

const OWNER_PID = 4001
const OTHER_PID = 4002
const servers: AgentHookServer[] = []

afterEach(() => {
  for (const server of servers.splice(0)) {
    server.stop()
  }
  probe.mockReset()
  probe.mockResolvedValue('unverifiable')
})

async function createServer(): Promise<AgentHookServer> {
  const server = new AgentHookServer()
  servers.push(server)
  await server.start({ env: 'production' })
  return server
}

async function hook(
  server: AgentHookServer,
  event: string,
  session: string,
  pid: number,
  reason?: string
): Promise<void> {
  const agentProcess = JSON.stringify({
    pid,
    platform: process.platform,
    startTime: `birth-${pid}`
  })
  const response = await postHookEvent(
    server,
    buildBody(
      {
        hook_event_name: event,
        session_id: session,
        source: 'startup',
        reason,
        ...(event === 'UserPromptSubmit' ? { prompt: `${session} task` } : {})
      },
      { agentProcess }
    )
  )
  expect(response.status).toBe(204)
}

function ownerSession(server: AgentHookServer): string | undefined {
  return server._getStateForTests().lastStatusByPaneKey.get(PANE)?.providerSession?.id
}

describe('Claude activity window with process presence', () => {
  it('refuses a background call from another live process and asks the host about the owner', async () => {
    const server = await createServer()
    probe.mockResolvedValue('live')
    await hook(server, 'UserPromptSubmit', 'session-a', OWNER_PID)
    await hook(server, 'SessionStart', 'session-b', OTHER_PID)
    await vi.waitFor(() => expect(probe).toHaveBeenCalledOnce())
    await hook(server, 'UserPromptSubmit', 'session-b', OTHER_PID)
    expect(ownerSession(server)).toBe('session-a')
  })

  it('accepts the owner process switching sessions inside the window', async () => {
    const server = await createServer()
    await hook(server, 'UserPromptSubmit', 'session-a', OWNER_PID)
    await hook(server, 'SessionEnd', 'session-a', OWNER_PID, 'clear')
    await hook(server, 'UserPromptSubmit', 'session-b', OWNER_PID)
    expect(ownerSession(server)).toBe('session-b')
    expect(probe).not.toHaveBeenCalled()
  })

  describe('when process detection registered the pane before any hook', () => {
    // Why: an Orca-launched TUI is first seen by its foreground process, so the pane's owner
    // carries no process and only the guard's own record knows which process the session runs in.
    async function detectedServer(): Promise<AgentHookServer> {
      const server = await createServer()
      server.ingestTerminalStatus({
        paneKey: PANE,
        payload: { state: 'idle', prompt: '', agentType: 'claude' } as never,
        origin: 'process'
      })
      await hook(server, 'SessionStart', 'session-a', OWNER_PID)
      await hook(server, 'UserPromptSubmit', 'session-a', OWNER_PID)
      expect(server._getStateForTests().lastStatusByPaneKey.get(PANE)?.agentPresence?.process).toBe(
        undefined
      )
      return server
    }

    it('accepts /clear in the owner process inside the window', async () => {
      const server = await detectedServer()
      await hook(server, 'SessionEnd', 'session-a', OWNER_PID, 'clear')
      await hook(server, 'SessionStart', 'session-b', OWNER_PID)
      await hook(server, 'UserPromptSubmit', 'session-b', OWNER_PID)
      expect(ownerSession(server)).toBe('session-b')
    })

    it('still refuses a background call from another process', async () => {
      const server = await detectedServer()
      await hook(server, 'SessionStart', 'session-b', OTHER_PID)
      await hook(server, 'UserPromptSubmit', 'session-b', OTHER_PID)
      expect(ownerSession(server)).toBe('session-a')
    })
  })

  it('lets a relaunch replace an owner whose process exited inside the window', async () => {
    const server = await createServer()
    probe.mockResolvedValue('exited')
    await hook(server, 'UserPromptSubmit', 'session-a', OWNER_PID)
    await hook(server, 'SessionStart', 'session-b', OTHER_PID)
    await vi.waitFor(() => expect(probe).toHaveBeenCalledOnce())
    await hook(server, 'UserPromptSubmit', 'session-b', OTHER_PID)
    expect(ownerSession(server)).toBe('session-b')
  })
})
