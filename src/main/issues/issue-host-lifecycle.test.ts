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
})
