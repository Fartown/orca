import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const MAIN_ROOT = join(import.meta.dirname, '..')

describe('Issue host lifecycle wiring', () => {
  it('wires desktop and Electron serve after shared hook startup and before serve RPC', () => {
    const source = readFileSync(join(MAIN_ROOT, 'index.ts'), 'utf8')
    const hookSettled = source.indexOf('const issueFeatureReady = localPtyStartupReady.then')
    const bootstrap = source.indexOf(
      'issueFeatureBootstrap = await startIssueFeatureForHost',
      hookSettled
    )
    const serveRpc = source.indexOf('await runtimeRpc.start().catch', bootstrap)
    const dispose = source.indexOf('issueFeatureBootstrap?.dispose()')
    const hookStop = source.indexOf('agentHookServer.stop()', dispose)

    expect(hookSettled).toBeGreaterThan(0)
    expect(bootstrap).toBeGreaterThan(hookSettled)
    expect(serveRpc).toBeGreaterThan(bootstrap)
    expect(hookStop).toBeGreaterThan(dispose)
  })

  it('starts the singleton hook before orcad PTY and disposes Issue before RPC and hook', () => {
    const source = readFileSync(join(MAIN_ROOT, 'orcad', 'orcad-entry.ts'), 'utf8')
    const hookStart = source.indexOf('await agentHookServer.start')
    const pty = source.indexOf('registerHeadlessPtyRuntime(', hookStart)
    const bootstrap = source.indexOf('startIssueFeatureForHost(', pty)
    const rpcStart = source.indexOf('await rpc.start()', bootstrap)
    const issueDispose = source.indexOf('issueBootstrap?.dispose()')
    const rpcStop = source.indexOf('await rpc.stop()', issueDispose)
    const hookStop = source.indexOf('agentHookServer.stop()', rpcStop)

    expect(pty).toBeGreaterThan(hookStart)
    expect(bootstrap).toBeGreaterThan(pty)
    expect(rpcStart).toBeGreaterThan(bootstrap)
    expect(rpcStop).toBeGreaterThan(issueDispose)
    expect(hookStop).toBeGreaterThan(rpcStop)
    expect(source).not.toContain('new AgentHookServer')
    expect(source).toContain('buildAgentHookPtyEnv: () => agentHookServer.buildPtyEnv()')
  })
})
