import { describe, expect, it } from 'vitest'
import { goalWorkspaceKey } from './goal-workspace-key'
// The v1 driver is plain JavaScript; parity with it is the whole point of this test.
import { goalKey as legacyGoalKey } from '../../../goal-mode/cli/goal-state.mjs'

describe('goalWorkspaceKey', () => {
  it('matches the v1 driver key byte for byte', () => {
    for (const path of [
      '/Users/someone/dev/orca',
      '/Users/someone/dev/orca/',
      '/tmp/Client',
      '/tmp/client',
      '/',
      'relative/dir',
      '/path with spaces/工作区'
    ]) {
      expect(goalWorkspaceKey(path)).toBe(legacyGoalKey(path))
    }
  })

  it('folds case only on case-insensitive platforms', () => {
    expect(goalWorkspaceKey('/tmp/Client', 'linux')).not.toBe(
      goalWorkspaceKey('/tmp/client', 'linux')
    )
    expect(goalWorkspaceKey('/tmp/Client', 'darwin')).toBe(
      goalWorkspaceKey('/tmp/client', 'darwin')
    )
  })

  it('refuses an empty path', () => {
    expect(() => goalWorkspaceKey('  ')).toThrow()
  })
})
