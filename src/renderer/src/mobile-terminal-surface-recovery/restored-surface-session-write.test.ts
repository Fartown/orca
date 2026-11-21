import { describe, expect, it, vi } from 'vitest'
import { runWorktreeAgentActivationGate } from '../lib/workspace/activation/worktree-agent-activation-gate'
import { LIVE_LEAF_ID, listed, testDeps, WORKTREE_ID } from './activation-gate.test-fixture'
import { writeRestoredSurfaceToMain } from './restored-surface-session-write'

vi.mock('../../../shared/workspace-layout/layout-owner-switch', () => ({
  ORCA_LAYOUT_OWNER_IS_MAIN: false
}))
vi.mock('./restored-surface-session-write', () => ({ writeRestoredSurfaceToMain: vi.fn() }))

describe('restored terminal surface session write', () => {
  it('sends a recreated tab to main right after creating it, and only once', async () => {
    const recorded = {
      ptyId: `${WORKTREE_ID}@@a1b2c3d4`,
      tabId: 'original-tab',
      paneKey: `original-tab:${LIVE_LEAF_ID}`
    }
    const { deps, createTab } = testDeps({
      sessions: [{ ...listed(recorded.ptyId), worktreeId: WORKTREE_ID }],
      surfaceOwners: new Map([[recorded.ptyId, { unowned: true, recorded }]])
    })
    const write = vi.mocked(writeRestoredSurfaceToMain)

    await expect(runWorktreeAgentActivationGate(WORKTREE_ID, deps)).resolves.toBe('adopted')
    expect(createTab).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledTimes(1)
    expect(vi.mocked(createTab).mock.invocationCallOrder[0]).toBeLessThan(
      write.mock.invocationCallOrder[0]
    )

    await expect(runWorktreeAgentActivationGate(WORKTREE_ID, deps)).resolves.toBe('adopted')
    expect(createTab).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledTimes(1)
  })
})
