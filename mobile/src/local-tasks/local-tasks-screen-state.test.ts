import { describe, expect, it } from 'vitest'
import type { LocalTasksStatus } from '../../../src/shared/local-tasks/local-task-types'
import { localTasksCopyFor } from './local-tasks-copy'
import { localTasksScreenState } from './local-tasks-screen-state'

const copy = localTasksCopyFor('zh-CN')
const status = (
  state: LocalTasksStatus['state'],
  reason: string | null = null
): LocalTasksStatus => ({
  taskHost: true,
  state,
  reason,
  revision: 1,
  taskHostId: 'host'
})
const ready = {
  access: 'ready' as const,
  machineName: 'mbp5',
  ready: true,
  loaded: true,
  error: null
}

describe('what the task page says about the library state', () => {
  it('uses a connection message without exposing a host id', () => {
    expect(
      localTasksScreenState(copy, {
        ...ready,
        access: 'offline',
        machineName: '',
        loaded: false,
        ready: false,
        status: null
      })
    ).toMatchObject({ kind: 'gate', title: '无法连接这台主机的 Orca' })
    expect(
      localTasksScreenState(copy, {
        ...ready,
        access: 'offline',
        authFailed: true,
        loaded: false,
        ready: false,
        status: null
      })
    ).toMatchObject({ kind: 'gate', title: copy.pairingInvalid })
  })
  it('words an unavailable library plainly and keeps the raw error behind details', () => {
    const raw = 'SQLITE_CANTOPEN: unable to open database file'
    const screen = localTasksScreenState(copy, {
      ...ready,
      loaded: false,
      status: status('unavailable', raw)
    })
    expect(screen).toEqual({
      kind: 'gate',
      title: copy.libraryUnavailable,
      message: copy.libraryUnavailableHint,
      details: raw
    })
  })

  it('opens a read-only library with the reason on the page', () => {
    expect(localTasksScreenState(copy, { ...ready, status: status('read-only') })).toEqual({
      kind: 'library',
      readOnly: true,
      notice: '只读：这个任务库由更新版本的 Orca 写入，这里只能查看，不能修改。'
    })
  })

  it('keeps the loaded page but disables writes when the change stream ends', () => {
    expect(
      localTasksScreenState(copy, {
        ...ready,
        status: status('ready'),
        streamEnded: true
      })
    ).toEqual({ kind: 'library', readOnly: true, notice: copy.streamEnded })
  })
})
