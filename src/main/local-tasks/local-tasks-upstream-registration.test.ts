import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
// Why a value import: the Bun runner only moves SQLite tests to Node when they import this directly.
import SyncDatabase from '../sqlite/sync-database'
import {
  LOCAL_TASKS_RUNTIME_CAPABILITY,
  LOCAL_TASKS_V2_RUNTIME_CAPABILITY
} from '../../shared/local-tasks/local-tasks-capability'
import { OrcaRuntimeService } from '../runtime/orca-runtime'
import { RpcDispatcher } from '../runtime/rpc/dispatcher'
import { LOCAL_TASK_METHODS } from '../runtime/rpc/methods/local-tasks'
import { startLocalTasksHost } from './local-tasks-host-lifecycle'

// These reach each registration through what the app itself builds, not through the upstream file
// holding the seam. When upstream moves that file, a merge can leave the fork's copy behind unused,
// and a check on the old file would still pass; these fail instead (#108).

const cleanups: (() => void)[] = []

afterEach(() => {
  for (const cleanup of cleanups.splice(0).toReversed()) {
    cleanup()
  }
})

function startHost(): void {
  const userDataPath = mkdtempSync(join(tmpdir(), 'local-tasks-registration-'))
  const stop = startLocalTasksHost({ profileId: 'profile-a', userDataPath })
  cleanups.push(() => rmSync(userDataPath, { recursive: true, force: true }), stop)
}

async function failureCode(dispatcher: RpcDispatcher, method: string): Promise<string | null> {
  const response = await dispatcher.dispatch(
    { id: method, authToken: 'test-token', method, params: {} },
    { clientKind: 'runtime' }
  )
  return response.ok ? null : response.error.code
}

describe('local tasks stay registered where the app reads them (#108)', () => {
  it('the runtime advertises the task library in its status', () => {
    expect(SyncDatabase).toBeDefined()
    startHost()
    expect(new OrcaRuntimeService().getStatus().capabilities).toEqual(
      expect.arrayContaining([LOCAL_TASKS_RUNTIME_CAPABILITY, LOCAL_TASKS_V2_RUNTIME_CAPABILITY])
    )
  })

  it('the default dispatcher knows every localTasks method', async () => {
    const dispatcher = new RpcDispatcher({ runtime: new OrcaRuntimeService() })
    const unknown = await failureCode(dispatcher, 'localTasks.noSuchMethod')
    expect(unknown).not.toBeNull()
    for (const method of LOCAL_TASK_METHODS) {
      expect({ method: method.name, code: await failureCode(dispatcher, method.name) }).not.toEqual(
        { method: method.name, code: unknown }
      )
    }
  })
})
