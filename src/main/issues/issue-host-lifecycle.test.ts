import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const STARTUP_ROOT = join(import.meta.dirname, '..', 'startup')

describe('Issue host lifecycle wiring', () => {
  it('wires desktop and Electron serve after shared hook startup and before serve RPC', () => {
    const indexSource = readFileSync(join(import.meta.dirname, '..', 'index.ts'), 'utf8')
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
      'issueFeatureBootstrap = await startIssueFeatureForHost',
      hookSettled
    )
    const bindRuntime = launchSource.indexOf('bindTerminalRuntimeStartupServices')
    const bootstrapCall = launchSource.indexOf('await options.afterTerminalRuntimeStartup?.()')
    const serveRpc = launchSource.indexOf('await launchServeMode', bootstrapCall)
    const dispose = lifecycleSource.indexOf('issueFeatureBootstrap?.dispose()')
    const hookStop = quitSource.indexOf('agentHookServer.stop()')
    const startInjection = indexSource.indexOf(
      'afterTerminalRuntimeStartup: startIssueFeatureForMainProcess'
    )
    const stopInjection = indexSource.indexOf(
      "app.once('will-quit', stopIssueFeatureForMainProcess)"
    )

    expect(hookSettled).toBeGreaterThan(0)
    expect(bootstrap).toBeGreaterThan(hookSettled)
    expect(bootstrapCall).toBeGreaterThan(bindRuntime)
    expect(serveRpc).toBeGreaterThan(bootstrapCall)
    expect(dispose).toBeGreaterThan(0)
    expect(hookStop).toBeGreaterThan(0)
    expect(startInjection).toBeGreaterThan(0)
    expect(stopInjection).toBeGreaterThan(0)
  })
})
