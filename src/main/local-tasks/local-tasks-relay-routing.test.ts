import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
// Why a value import: the Bun runner only moves SQLite tests to Node when they import this directly.
import '../sqlite/sync-database'
import { DeviceRegistry } from '../runtime/device-registry'
import { OrcaRuntimeRpcServer } from '../runtime/runtime-rpc'
import { createMobileRpcSurfaceRuntime } from '../runtime/runtime-rpc-mobile-method-allowlist-fixtures'
import { startLocalTasksHost } from './local-tasks-host-lifecycle'

const cleanups: (() => void)[] = []

afterEach(() => {
  for (const cleanup of cleanups.splice(0).toReversed()) {
    cleanup()
  }
})

async function phoneCall(executionHost: string | undefined) {
  const userDataPath = mkdtempSync(join(tmpdir(), 'local-tasks-relay-'))
  cleanups.push(() => rmSync(userDataPath, { recursive: true, force: true }))
  cleanups.push(startLocalTasksHost({ profileId: 'desktop', userDataPath }))
  const { runtime } = createMobileRpcSurfaceRuntime()
  const server = new OrcaRuntimeRpcServer({ runtime, userDataPath, enableWebSocket: false })
  server['deviceRegistry'] = new DeviceRegistry(userDataPath)
  const device = server['deviceRegistry']!.addDevice('phone', 'mobile')
  const replies: Record<string, unknown>[] = []
  await server['handleWebSocketMessage'](
    JSON.stringify({
      id: 'req_1',
      method: 'localTasks.projects.list',
      ...(executionHost ? { executionHost } : {}),
      deviceToken: device.token,
      params: {}
    }),
    (response) => {
      const parsed: Record<string, unknown> = JSON.parse(response)
      replies.push(parsed)
    },
    () => {}
  )
  return replies
}

describe('a phone’s task-library call through its desktop', () => {
  it('goes to the server it names, never this desktop’s own library (D-008)', async () => {
    // A legacy socket cannot relay, so reaching that refusal proves the call was routed onward.
    expect(await phoneCall('runtime:env-1')).toMatchObject([
      {
        ok: false,
        error: {
          code: 'remote_runtime_unavailable',
          message: 'Servers are reachable only over an encrypted pairing'
        }
      }
    ])
  })

  it('reads this desktop’s library when untargeted or aimed at this desktop’s own hosts', async () => {
    for (const executionHost of [undefined, 'local', 'ssh:mini']) {
      expect(await phoneCall(executionHost)).toMatchObject([{ ok: true, result: { projects: [] } }])
    }
  })
})
