import { beforeEach, describe, expect, it } from 'vitest'
import { localTasksDomainStore } from './local-tasks-domain-store'
import {
  localTaskBoardDropRefusal,
  localTaskCreateWriteReason,
  localTaskLibraryWriteReason,
  localTaskRowsWriteReason
} from './local-task-write-reason'

const SERVER = 'runtime:env-1'

beforeEach(() => {
  localTasksDomainStore.setState(localTasksDomainStore.getInitialState())
  const domain = localTasksDomainStore.getState()
  domain.openEndpoint('local')
  domain.openEndpoint(SERVER)
  const own = domain.writer('local')
  own.setConnection('live')
  own.setHostState('ready', null)
  const server = domain.writer(SERVER)
  server.setConnection('live')
  server.setHostState('read-only', null)
})

describe('why a greyed control takes no change, said where it is', () => {
  it('names the host that is out of contact, and never offers to redial it', () => {
    expect(
      localTaskLibraryWriteReason(
        { inContact: false, connection: 'live', hostState: 'ready' },
        'minizc'
      )
    ).toBe('minizc is not connected, so its tasks can’t be changed now.')
    expect(
      localTaskLibraryWriteReason(
        { inContact: true, connection: 'connecting', hostState: 'ready' },
        ''
      )
    ).toBe('Reconnecting to the task library…')
    expect(
      localTaskLibraryWriteReason({ inContact: true, connection: 'live', hostState: 'ready' }, '')
    ).toBeNull()
  })

  it('answers for the library of the row that blocks a batch, not the page’s own', () => {
    expect(localTaskRowsWriteReason(['t1'])).toBeNull()
    expect(localTaskRowsWriteReason(['t1', `${SERVER}/t2`])).toBe(
      'Read only: a newer version of Orca saved these tasks.'
    )
    expect(localTaskCreateWriteReason(`${SERVER}/theirs`)).toBe(
      'Read only: a newer version of Orca saved these tasks.'
    )
  })

  it('says why a board column refuses a card from another project', () => {
    const column = {
      kind: 'status' as const,
      key: 'review',
      tasks: [],
      status: {
        id: 'review',
        projectId: 'web',
        category: 'review' as const,
        name: 'In Review',
        color: 'blue' as const,
        position: 0
      }
    }
    const names: Record<string, string> = { shop: 'Shop', web: 'Web' }
    const card = { id: 't1', title: 'Order export', projectId: 'shop' }
    expect(localTaskBoardDropRefusal(column, card, (id) => names[id] ?? '?')).toBe(
      '“Order export” is in Shop; this column’s status belongs to Web. Move the task to that project first.'
    )
    expect(
      localTaskBoardDropRefusal(column, { ...card, projectId: 'web' }, (id) => names[id] ?? '?')
    ).toBeNull()
  })
})
