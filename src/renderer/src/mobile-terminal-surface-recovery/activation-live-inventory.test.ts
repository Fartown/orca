import { describe, expect, it, vi } from 'vitest'
import { runWorktreeAgentActivationGate } from '../lib/worktree-agent-activation-gate'
import { listed, testDeps, WORKTREE_ID } from '../lib/worktree-agent-activation-gate.test-fixture'

vi.mock('../../../shared/layout-owner-switch', () => ({ ORCA_LAYOUT_OWNER_IS_MAIN: false }))

describe('activation with unresolved live terminals', () => {
  it.each([
    ['unreadable owner census', null],
    ['unverified owner', new Map()]
  ] as const)('blocks automatic seeding for %s', async (_name, surfaceOwners) => {
    const ptyId = `${WORKTREE_ID}@@still-live`
    const { deps, createTab, resume } = testDeps({
      sessions: [listed(ptyId)],
      surfaceOwners,
      resumeCount: 0
    })

    await expect(runWorktreeAgentActivationGate(WORKTREE_ID, deps)).resolves.toBe('blocked')
    expect(createTab).not.toHaveBeenCalled()
    expect(resume).not.toHaveBeenCalled()
  })

  it('keeps a genuinely empty host eligible for its initial surface', async () => {
    const { deps, createTab, resume } = testDeps({ sessions: [], resumeCount: 0 })

    await expect(runWorktreeAgentActivationGate(WORKTREE_ID, deps)).resolves.toBe('empty')
    expect(createTab).not.toHaveBeenCalled()
    expect(resume).toHaveBeenCalledOnce()
  })
})
