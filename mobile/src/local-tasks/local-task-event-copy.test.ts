import { describe, expect, it } from 'vitest'
import type { LocalTaskEvent } from '../../../src/shared/local-tasks/local-task-types'
import { localTasksCopy } from './local-tasks-copy'
import { describeLocalTaskEvent } from './local-task-event-copy'

const copy = localTasksCopy()

function line(event: Pick<LocalTaskEvent, 'kind' | 'source' | 'payload'>) {
  return describeLocalTaskEvent(
    copy,
    { id: 'e', taskId: 't', body: null, createdAt: 0, editedAt: null, ...event },
    new Map(),
    new Map([['t12', { title: 'Export orders as CSV' }]])
  )
}

describe('a task activity line on the phone', () => {
  it('names the rule behind an automatic status change, with no actor in front', () => {
    expect(
      line({
        kind: 'status',
        source: 'rule',
        payload: { fromName: 'Todo', toName: 'Done', rule: 'pr-merged', prNumber: 72 }
      })
    ).toEqual({ actor: null, text: copy.eventRulePrMerged('72', 'Todo', 'Done') })
  })

  it('says where Start work ran, and names a parent by its title', () => {
    expect(
      line({
        kind: 'workspace-linked',
        source: 'mobile',
        payload: { name: 'shop-12', via: 'start', hostLabel: 'minizc' }
      })
    ).toEqual({ actor: 'You (phone)', text: copy.eventWorkspaceStarted('shop-12', 'minizc') })
    expect(line({ kind: 'parent', source: 'desktop', payload: { to: 't12' } }).text).toBe(
      copy.eventParentSet('Export orders as CSV')
    )
  })
})
