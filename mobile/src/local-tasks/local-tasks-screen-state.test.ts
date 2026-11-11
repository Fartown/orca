import { describe, expect, it } from 'vitest'
import type { LocalTasksStatus } from '../../../src/shared/local-tasks/local-task-types'
import { localTasksCopy } from './local-tasks-copy'
import { localTasksScreenState } from './local-tasks-screen-state'

const copy = localTasksCopy()
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
    ).toMatchObject({ kind: 'gate', title: 'This host’s Orca is not connected' })
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
      notice: copy.libraryReadOnly
    })
  })

  it('says the status read failed, not that it is still checking, beside a loaded list', () => {
    expect(
      localTasksScreenState(copy, { ...ready, status: null, error: 'status timed out' })
    ).toEqual({ kind: 'library', readOnly: true, notice: copy.loadFailed })
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
