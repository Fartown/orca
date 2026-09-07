import { describe, expect, it } from 'vitest'
import { canonicalJson, fingerprintPayload } from './goal-client-operation'

describe('goal client operations', () => {
  it('hashes the same logical payload identically regardless of key order', async () => {
    const a = { binding: { terminal: 't', worktree: 'w' }, spec: { objective: 'x' } }
    const b = { spec: { objective: 'x' }, binding: { worktree: 'w', terminal: 't' } }
    expect(canonicalJson(a)).toBe(canonicalJson(b))
    expect(await fingerprintPayload(a)).toBe(await fingerprintPayload(b))
    expect(await fingerprintPayload(a)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('changes the fingerprint when the payload changes', async () => {
    expect(await fingerprintPayload({ action: 'pause' })).not.toBe(
      await fingerprintPayload({ action: 'resume' })
    )
  })
})
