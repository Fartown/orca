import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
// Why a value import: the Bun runner only moves SQLite tests to Node when they import this directly.
import SyncDatabase from '../../../sqlite/sync-database'
import { LOCAL_TASKS_RUNTIME_CAPABILITY } from '../../../../shared/local-tasks/local-tasks-capability'
import { getLocalTasksDatabasePath } from '../../../local-tasks/local-tasks-database'
import { startLocalTasksHost } from '../../../local-tasks/local-tasks-host-lifecycle'
import { localTasksReadiness } from '../../../local-tasks/local-tasks-readiness'
import { localTasksRuntimeCapabilities } from '../../../local-tasks/local-tasks-runtime-capability'
import { isMobileRpcMethodAllowed } from '../../runtime-rpc/fork-mobile-rpc-method-allowlist'
import { ALL_RPC_METHODS } from './index'
import { LOCAL_TASK_METHODS, sourceOf } from './local-tasks'

const cleanups: (() => void)[] = []

afterEach(() => {
  for (const cleanup of cleanups.splice(0).toReversed()) {
    cleanup()
  }
})

function startHost(): string {
  const userDataPath = mkdtempSync(join(tmpdir(), 'local-tasks-rpc-'))
  const stop = startLocalTasksHost({ profileId: 'profile-a', userDataPath })
  cleanups.push(() => rmSync(userDataPath, { recursive: true, force: true }), stop)
  return userDataPath
}

describe('localTasks RPC', () => {
  it('is registered once; the phone reaches everything but desktop UI preferences', () => {
    const names: string[] = LOCAL_TASK_METHODS.map((method) => method.name)
    expect(ALL_RPC_METHODS.filter((method) => names.includes(method.name))).toHaveLength(
      names.length
    )
    for (const name of names) {
      expect(isMobileRpcMethodAllowed(name)).toBe(!name.startsWith('localTasks.preferences.'))
    }
  })

  it('names who wrote from the transport, never from params', () => {
    expect(
      sourceOf({ clientKind: 'mobile', caller: { kind: 'paired-device', deviceId: 'd' } })
    ).toBe('mobile')
    expect(sourceOf({ clientKind: 'runtime', caller: { kind: 'desktop' } })).toBe('desktop')
    expect(sourceOf({ caller: { kind: 'local-cli' } })).toBe('cli')
    expect(sourceOf({})).toBe('cli')
  })

  it('is no task host and advertises nothing until a library is registered', () => {
    expect(localTasksReadiness.status()).toMatchObject({ taskHost: false, state: 'not-task-host' })
    expect(localTasksRuntimeCapabilities()).toEqual([])
    expect(() => localTasksReadiness.requireService()).toThrow(/does not host a task library/)
  })

  it('serves the profile library once started and keeps its rows in that file', () => {
    const userDataPath = startHost()
    expect(localTasksReadiness.status()).toMatchObject({ taskHost: true, state: 'ready' })
    expect(localTasksRuntimeCapabilities()).toEqual([LOCAL_TASKS_RUNTIME_CAPABILITY])
    const service = localTasksReadiness.requireService()
    const project = service.createProject({
      clientOperationId: 'p1',
      name: '商城',
      prefix: 'SHOP',
      orcaProjectId: 'orca-project-shop'
    })
    const task = service.createTask(
      {
        clientOperationId: 't1',
        projectId: project.ok ? project.project.id : '',
        title: '订单导出'
      },
      'mobile'
    )
    expect(task).toMatchObject({ ok: true, task: { ref: 'SHOP-1' } })
    const file = new SyncDatabase(getLocalTasksDatabasePath('profile-a', userDataPath), {
      readonly: true
    })
    expect(file.prepare('SELECT COUNT(*) AS count FROM local_tasks').get()).toEqual({ count: 1 })
    file.close()
  })
})
