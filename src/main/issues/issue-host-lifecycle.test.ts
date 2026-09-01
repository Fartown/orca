import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const STARTUP_ROOT = join(import.meta.dirname, '..', 'startup')

describe('Issue host lifecycle wiring', () => {
  it('wires desktop and Electron serve after shared hook startup and before serve RPC', () => {
    const lifecycleSource = readFileSync(
      join(import.meta.dirname, 'issue-main-process-lifecycle.ts'),
      'utf8'
    )
    const launchSource = readFileSync(join(STARTUP_ROOT, 'main-process-runtime-launch.ts'), 'utf8')
    const quitSource = readFileSync(join(STARTUP_ROOT, 'main-process-quit.ts'), 'utf8')
    const hookSettled = lifecycleSource.indexOf(
      'const issueFeatureReady = state.localPtyStartupReady.then'
    )
    const bootstrap = lifecycleSource.indexOf(
      'state.issueFeatureBootstrap = await startIssueFeatureForHost',
      hookSettled
    )
    const bindRuntime = launchSource.indexOf('bindTerminalRuntimeStartupServices')
    const bootstrapCall = launchSource.indexOf(
      'await startIssueFeatureForMainProcess()',
      bindRuntime
    )
    const serveRpc = launchSource.indexOf('await launchServeMode', bootstrapCall)
    const dispose = quitSource.indexOf('stopIssueFeatureForMainProcess()')
    const hookStop = quitSource.indexOf('agentHookServer.stop()', dispose)

    expect(hookSettled).toBeGreaterThan(0)
    expect(bootstrap).toBeGreaterThan(hookSettled)
    expect(bootstrapCall).toBeGreaterThan(bindRuntime)
    expect(serveRpc).toBeGreaterThan(bootstrapCall)
    expect(hookStop).toBeGreaterThan(dispose)
  })
})
