import { describe, expect, it } from 'vitest'
import type { RpcClient } from '../transport/rpc-client'
import { loadLocalTaskAgentOptions } from './local-task-agent-options'

/** A host answering settings and agent detection; each machine reports its own agents. */
function host(detected: Record<string, string[]>): RpcClient {
  return {
    sendRequest: async (method) => ({
      id: method,
      ok: true,
      result: method === 'settings.get' ? { settings: {} } : (detected[method] ?? [])
    }),
    subscribe: () => () => {},
    updateTerminalSubscriptionViewport: () => {},
    getState: () => 'connected',
    getReconnectAttempt: () => 0,
    getLastConnectedAt: () => null,
    onStateChange: () => () => {},
    notifyForeground: () => {},
    close: () => {}
  }
}

describe('agents offered when starting a task in a new workspace', () => {
  it("asks a server for the agents on its own SSH target, not the paired host's same-named one", async () => {
    const desktop = host({ 'preflight.detectRemoteAgents': ['codex'] })
    const server = host({ 'preflight.detectRemoteAgents': ['claude'] })
    const options = await loadLocalTaskAgentOptions({
      client: desktop,
      launchClient: server,
      hostCapabilities: [],
      target: { kind: 'create', hostId: 'ssh:box' }
    })
    expect(options.map((option) => option.agent)).toEqual(['claude'])
  })
})
