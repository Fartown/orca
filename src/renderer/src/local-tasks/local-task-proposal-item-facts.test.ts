import { describe, expect, it, vi } from 'vitest'
import type { LocalTaskProposalItem } from '../../../shared/local-tasks/local-task-dispatcher-rpc-params'
import type { LocalTaskSessionState } from '../../../shared/local-tasks/local-task-link-types'

vi.mock('@/store', () => ({ useAppStore: vi.fn() }))

import {
  localTaskProposalItemLock,
  type LocalTaskProposalItemFacts
} from './local-task-proposal-item-facts'

const append: LocalTaskProposalItem = { kind: 'append', taskId: 't-1', text: 'Also check CSV' }
const stop: LocalTaskProposalItem = { kind: 'stop', taskId: 't-1', reason: 'Switching agents' }
const start: LocalTaskProposalItem = {
  kind: 'start',
  title: 'Export',
  prompt: 'Add export',
  target: { worktreeId: 'repo::/w', hostId: 'ssh:box' }
}

function facts(
  state: LocalTaskSessionState | null,
  hostId: string | null = 'ssh:box',
  inContact = true,
  projectIds: string[] = []
): LocalTaskProposalItemFacts {
  return {
    hostId,
    inContact,
    place: null,
    session: state ? { agent: 'claude', state, since: 1 } : null,
    projectIds
  }
}

describe('localTaskProposalItemLock', () => {
  it('locks every kind of item on a host out of contact, whatever its session last said', () => {
    expect(localTaskProposalItemLock(start, facts(null, 'ssh:box', false))).toMatchObject({
      kind: 'host-offline',
      item: 'other'
    })
    expect(localTaskProposalItemLock(append, facts('done', 'ssh:box', false))).toMatchObject({
      kind: 'host-offline',
      item: 'append'
    })
    expect(localTaskProposalItemLock(stop, facts('working', 'runtime:env', false))).toMatchObject({
      kind: 'host-offline',
      item: 'stop'
    })
  })

  it('appends only to a session that finished a turn', () => {
    expect(localTaskProposalItemLock(append, facts('done'))).toBeNull()
    expect(localTaskProposalItemLock(append, facts('working'))).toMatchObject({
      kind: 'session-busy',
      state: 'working'
    })
    expect(localTaskProposalItemLock(append, facts('idle'))).toMatchObject({ kind: 'session-busy' })
    expect(localTaskProposalItemLock(append, facts('unknown'))).toMatchObject({
      kind: 'session-unverifiable'
    })
    expect(localTaskProposalItemLock(append, facts('exited'))).toMatchObject({
      kind: 'session-ended'
    })
  })

  it('lets a working session be stopped, but not one that ended or cannot be confirmed', () => {
    expect(localTaskProposalItemLock(stop, facts('working'))).toBeNull()
    expect(localTaskProposalItemLock(stop, facts('exited'))).toMatchObject({
      kind: 'session-ended'
    })
    expect(localTaskProposalItemLock(stop, facts('unverifiable'))).toMatchObject({
      kind: 'session-unverifiable'
    })
    expect(localTaskProposalItemLock(stop, facts(null, null))).toMatchObject({
      kind: 'session-missing'
    })
  })

  it('leaves an item whose host this window cannot name to the run itself', () => {
    expect(localTaskProposalItemLock(start, facts(null, null))).toBeNull()
  })

  it('holds a new task back until the person picks one of several projects', () => {
    const shared = ['p-shop', 'p-ops', 'p-web']
    const record: LocalTaskProposalItem = {
      kind: 'record',
      title: 'Hotfix',
      target: { worktreeId: 'repo::/hotfix' }
    }
    expect(localTaskProposalItemLock(start, facts(null, 'ssh:box', true, shared))).toEqual({
      kind: 'project-unpicked'
    })
    expect(localTaskProposalItemLock(record, facts(null, 'local', true, shared))).toEqual({
      kind: 'project-unpicked'
    })
    expect(
      localTaskProposalItemLock({ ...start, project: 'OPS' }, facts(null, 'ssh:box', true, shared))
    ).toBeNull()
    expect(localTaskProposalItemLock(start, facts(null, 'ssh:box', true, ['p-shop']))).toBeNull()
  })
})
