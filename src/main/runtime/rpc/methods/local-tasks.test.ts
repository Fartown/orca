import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
// Why a value import: the Bun runner only moves SQLite tests to Node when they import this directly.
import SyncDatabase from '../../../sqlite/sync-database'
import {
  getAppEnvironment,
  hasAppEnvironment,
  setAppEnvironment
} from '../../../../shared/app-environment'
import { LOCAL_TASKS_RUNTIME_CAPABILITY } from '../../../../shared/local-tasks/local-tasks-capability'
import { startOrcadLocalTasks } from '../../../local-tasks/orcad-local-tasks'
import { ensureActiveOrcaProfile } from '../../../orca-profiles/profile-index-store'
import { getLocalTasksDatabasePath } from '../../../local-tasks/local-tasks-database'
import { startLocalTasksHost } from '../../../local-tasks/local-tasks-host-lifecycle'
import { localTasksReadiness } from '../../../local-tasks/local-tasks-readiness'
import { localTasksRuntimeCapabilities } from '../../../local-tasks/local-tasks-runtime-capability'
import {
  isForkExecutionHostRelayMethod,
  isMobileRpcMethodAllowed
} from '../../runtime-rpc/fork-mobile-rpc-method-allowlist'
import { isDesktopClientCaller, sourceOf } from '../../../local-tasks/local-tasks-rpc-caller'
import { ALL_RPC_METHODS } from './index'
import { LOCAL_TASK_DESKTOP_ONLY_METHODS } from './local-task-link-methods'
import { LOCAL_TASK_METHODS } from './local-tasks'

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
  it('is registered once; the phone reaches everything but desktop UI preferences and desktop feeds', () => {
    const names: string[] = LOCAL_TASK_METHODS.map((method) => method.name)
    expect(ALL_RPC_METHODS.filter((method) => names.includes(method.name))).toHaveLength(
      names.length
    )
    expect(names).toEqual(expect.arrayContaining([...LOCAL_TASK_DESKTOP_ONLY_METHODS]))
    // Removed with D-008: the host judges and claims for itself, and clients send replies directly.
    for (const gone of [
      'localTasks.attention.publish',
      'localTasks.links.resolveSession',
      'localTasks.replies.list',
      'localTasks.replies.enqueue',
      'localTasks.replies.cancel',
      'localTasks.replies.settle'
    ]) {
      expect(names).not.toContain(gone)
    }
    for (const name of names) {
      const phoneMay =
        !name.startsWith('localTasks.preferences.') &&
        !LOCAL_TASK_DESKTOP_ONLY_METHODS.includes(name)
      expect(isMobileRpcMethodAllowed(name)).toBe(phoneMay)
      // What a phone may call it may also aim at a server through its desktop.
      expect(isForkExecutionHostRelayMethod(name)).toBe(phoneMay)
    }
    expect(isForkExecutionHostRelayMethod('fileAttachment.startUpload')).toBe(false)
  })

  it('lets any desktop but no phone feed workspace resolution and merged PRs', () => {
    expect(isDesktopClientCaller({ clientKind: 'runtime', caller: { kind: 'desktop' } })).toBe(true)
    expect(
      isDesktopClientCaller({
        clientKind: 'runtime',
        caller: { kind: 'paired-device', deviceId: 'other-desktop' }
      })
    ).toBe(true)
    expect(
      isDesktopClientCaller({
        clientKind: 'mobile',
        caller: { kind: 'paired-device', deviceId: 'phone' }
      })
    ).toBe(false)
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
    const project = service.createProject({ clientOperationId: 'p1', name: '调研', prefix: 'RS' })
    const task = service.createTask(
      { clientOperationId: 't1', projectId: project.ok ? project.project.id : '', title: '竞品' },
      'mobile'
    )
    expect(task).toMatchObject({ ok: true, task: { ref: 'RS-1' } })
    expect(service.execution.getProgress()).toMatchObject({ sessions: [], items: [] })
    const file = new SyncDatabase(getLocalTasksDatabasePath('profile-a', userDataPath), {
      readonly: true
    })
    expect(file.prepare('SELECT COUNT(*) AS count FROM local_tasks').get()).toEqual({ count: 1 })
    file.close()
  })
})

describe('orcad task library', () => {
  it('opens the orcad profile’s library and watches the host’s status until closed', () => {
    const userDataPath = mkdtempSync(join(tmpdir(), 'local-tasks-orcad-'))
    const previous = hasAppEnvironment() ? getAppEnvironment() : null
    setAppEnvironment({
      getPath: () => userDataPath,
      getAppPath: () => userDataPath,
      getVersion: () => '0.0.0-test',
      isPackaged: () => false,
      onWillQuit: () => {},
      exit: () => {},
      getAppMetrics: () => []
    })
    cleanups.push(() => {
      if (previous) {
        setAppEnvironment(previous)
      }
      rmSync(userDataPath, { recursive: true, force: true })
    })
    const watching = new Set<string>()
    const stop = startOrcadLocalTasks({
      hasLiveTerminalForPaneKey: () => false,
      onClientEvent: () => {
        watching.add('client-events')
        return () => watching.delete('client-events')
      }
    })
    expect(localTasksReadiness.status()).toMatchObject({ taskHost: true, state: 'ready' })
    expect(localTasksRuntimeCapabilities()).toEqual([LOCAL_TASKS_RUNTIME_CAPABILITY])
    expect(watching.has('client-events')).toBe(true)
    const profileId = ensureActiveOrcaProfile(userDataPath).profile.id
    expect(existsSync(getLocalTasksDatabasePath(profileId, userDataPath))).toBe(true)
    stop()
    expect(watching.size).toBe(0)
    expect(localTasksReadiness.status()).toMatchObject({ taskHost: false })
  })
})
