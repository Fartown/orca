import { beforeEach, describe, expect, it } from 'vitest'
import type { LocalTaskProject } from '../../../shared/local-tasks/local-task-types'
import { createLocalTasksDomainStore } from './local-tasks-domain-store'
import { canCreateLocalTask, canWriteLocalTaskRows } from './local-task-write-access'

function project(id: string): LocalTaskProject {
  return {
    id,
    name: id,
    prefix: 'P',
    aliases: [],
    repos: [],
    defaultRepoId: null,
    lastExecutionHostId: null,
    rules: { startMovesToInProgress: true, prMergedCompletes: true },
    statuses: [],
    createdAt: 0,
    updatedAt: 0,
    revision: 1
  }
}

const SERVER = 'runtime:env-1'
let store = createLocalTasksDomainStore()

beforeEach(() => {
  store = createLocalTasksDomainStore()
  store.getState().openEndpoint('local')
  store.getState().openEndpoint(SERVER)
  const own = store.getState().writer('local')
  own.setConnection('live')
  own.setHostState('ready', null)
  own.applyProjects([project('mine')])
  // A newer Orca on the server keeps its library read-only for this client.
  const server = store.getState().writer(SERVER)
  server.setConnection('live')
  server.setHostState('read-only', null)
  server.applyProjects([project(`${SERVER}/theirs`)])
})

describe('page-wide writes follow each row’s own library (D-008)', () => {
  it('lets a batch or a key act only when every row’s library takes writes', () => {
    const state = store.getState()
    expect(canWriteLocalTaskRows(state, ['t1'])).toBe(true)
    expect(canWriteLocalTaskRows(state, ['t1', `${SERVER}/t2`])).toBe(false)
    expect(canWriteLocalTaskRows(state, [])).toBe(false)
  })

  it('opens New task in the scoped project only when its library takes writes, else in any', () => {
    expect(canCreateLocalTask(store.getState(), `${SERVER}/theirs`)).toBe(false)
    expect(canCreateLocalTask(store.getState(), 'mine')).toBe(true)
    expect(canCreateLocalTask(store.getState(), null)).toBe(true)
    store.getState().setEndpointContact('local', false)
    expect(canCreateLocalTask(store.getState(), null)).toBe(false)
  })
})
