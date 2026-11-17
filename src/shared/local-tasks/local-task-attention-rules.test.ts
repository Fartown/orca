import { describe, expect, it } from 'vitest'
import { AGENT_STATUS_STALE_AFTER_MS } from '../agent-status-freshness'
import { localTaskRowState, type LocalTaskStatusRow } from './local-task-attention-rules'

const OBSERVED = 1_000_000
const LATER = OBSERVED + AGENT_STATUS_STALE_AFTER_MS + 60_000

function row(state: LocalTaskStatusRow['state'], extra: Partial<LocalTaskStatusRow> = {}) {
  return {
    paneKey: 'tab-1:leaf',
    state,
    stateStartedAt: OBSERVED,
    receivedAt: OBSERVED,
    ...extra
  } satisfies LocalTaskStatusRow
}

describe('a row’s state past the stale window (REQ-014)', () => {
  it('keeps a wait for the user while its terminal runs', () => {
    expect(localTaskRowState(row('waiting'), true, LATER)).toBe('waiting')
    expect(localTaskRowState(row('blocked'), true, LATER)).toBe('blocked')
  })

  it('decays a wait whose terminal is gone, and silent work, as upstream does', () => {
    expect(localTaskRowState(row('waiting'), false, LATER)).toBe('idle')
    expect(localTaskRowState(row('blocked'), false, LATER)).toBe('idle')
    expect(localTaskRowState(row('working'), true, LATER)).toBe('unverifiable')
  })

  it('never trusts a wait replayed from disk', () => {
    expect(localTaskRowState(row('waiting', { restoredUnconfirmed: true }), true, OBSERVED)).toBe(
      'idle'
    )
  })
})
