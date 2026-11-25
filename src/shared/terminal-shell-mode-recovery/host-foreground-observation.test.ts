import { describe, expect, it } from 'vitest'
import { createHostForegroundObservationReader } from './host-foreground-observation'

const binding = {
  expectedPtyId: 'term',
  expectedIncarnationId: 'inc',
  requestStartedAtMonotonic: 0,
  receivedAtMonotonic: 1
}
const observed = (authorityGeneration = 'a', observationEpoch = 1) => ({
  verdict: 'observed',
  source: 'pty-master',
  foregroundKind: 'shell',
  processName: null,
  ptyId: 'term',
  ptyIncarnationId: 'inc',
  capturedAgeMs: 0,
  authorityGeneration,
  observationEpoch
})

describe('host foreground observation identity', () => {
  it('rejects duplicate epochs and returns to retired host authorities', () => {
    const read = createHostForegroundObservationReader()
    expect(read(observed(), binding)).not.toBeNull()
    expect(read(observed(), binding)).toBeNull()
    expect(read(observed('b'), binding)).not.toBeNull()
    expect(read(observed('a', 2), binding)).toBeNull()
  })
  it('resets authority history only when the PTY incarnation changes', () => {
    const read = createHostForegroundObservationReader()
    expect(read(observed(), binding)).not.toBeNull()
    expect(read(observed(), { ...binding, expectedIncarnationId: 'new' })).toBeNull()
    expect(
      read({ ...observed(), ptyIncarnationId: 'new' }, { ...binding, expectedIncarnationId: 'new' })
    ).not.toBeNull()
  })
  it('rejects an absent incarnation and observations that became old in transit', () => {
    const read = createHostForegroundObservationReader()
    expect(read(observed(), { ...binding, expectedIncarnationId: null })).toBeNull()
    expect(read(observed(), { ...binding, receivedAtMonotonic: 2001 })).toBeNull()
  })
})
