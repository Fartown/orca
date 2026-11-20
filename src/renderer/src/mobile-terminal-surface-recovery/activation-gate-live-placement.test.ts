import { describe, expect, it, vi } from 'vitest'
import { ORCA_LAYOUT_OWNER_IS_MAIN } from '../../../shared/workspace-layout/layout-owner-switch'
import { runWorktreeAgentActivationGate } from '@/lib/workspace/activation/worktree-agent-activation-gate'
import {
  listed,
  LIVE_LEAF_ID,
  seedExistingSurface,
  SIBLING_LEAF_ID,
  testDeps,
  UNOWNED,
  WORKTREE_ID
} from './activation-gate.test-fixture'

// Live or unverifiable terminal placement must not authorize seeding a replacement shell.
const windowOwnedIt = it.skipIf(ORCA_LAYOUT_OWNER_IS_MAIN)

describe('worktree agent activation gate: live terminal placement', () => {
  windowOwnedIt(
    'restores the recorded tab and leaf when this renderer lacks that tab',
    async () => {
      const ptyId = `${WORKTREE_ID}@@live-pty`
      const recorded = { paneKey: `tab-live:${LIVE_LEAF_ID}`, ptyId, tabId: 'tab-live' }
      const { deps, createTab } = testDeps({
        sessions: [listed(ptyId)],
        surfaceOwners: new Map([[ptyId, { unowned: true, recorded }]])
      })

      await expect(runWorktreeAgentActivationGate(WORKTREE_ID, deps)).resolves.toBe('adopted')

      expect(createTab).toHaveBeenCalledOnce()
      expect(createTab).toHaveBeenCalledWith(WORKTREE_ID, undefined, undefined, {
        id: 'tab-live',
        initialLeafId: LIVE_LEAF_ID,
        initialPtyId: ptyId,
        activate: false,
        recordInteraction: false
      })
    }
  )

  it('blocks seeding when the host cannot place its live terminal', async () => {
    const livePtyId = `${WORKTREE_ID}@@live-agent`
    const { deps, createTab } = testDeps({
      sessions: [listed(livePtyId)],
      surfaceOwners: null,
      resumeCount: 0
    })

    await expect(runWorktreeAgentActivationGate(WORKTREE_ID, deps)).resolves.toBe('blocked')

    expect(createTab).not.toHaveBeenCalled()
  })

  windowOwnedIt(
    'restores the live terminal after an unverifiable census becomes authoritative',
    async () => {
      const livePtyId = `${WORKTREE_ID}@@live-codex`
      const { deps, createTab } = testDeps({
        sessions: [listed(livePtyId)],
        surfaceOwners: null,
        resumeCount: 0
      })

      await expect(runWorktreeAgentActivationGate(WORKTREE_ID, deps)).resolves.toBe('blocked')
      expect(createTab).not.toHaveBeenCalled()

      deps.listSurfaceOwners.mockResolvedValue(new Map([[livePtyId, UNOWNED]]))
      await expect(runWorktreeAgentActivationGate(WORKTREE_ID, deps)).resolves.toBe('adopted')

      const tabs = deps.getState().tabsByWorktree[WORKTREE_ID] ?? []
      expect(tabs).toHaveLength(1)
      expect(tabs[0]?.ptyId).toBe(livePtyId)
    }
  )

  it('blocks seeding when two host surfaces claim one live PTY', async () => {
    const livePtyId = `${WORKTREE_ID}@@live-agent`
    const { deps, createTab } = testDeps({
      sessions: [listed(livePtyId)],
      surfaceOwners: new Map([[livePtyId, null]]),
      resumeCount: 0
    })

    await expect(runWorktreeAgentActivationGate(WORKTREE_ID, deps)).resolves.toBe('blocked')

    expect(createTab).not.toHaveBeenCalled()
  })

  windowOwnedIt(
    'blocks seeding when the host names a leaf the persisted layout does not have',
    async () => {
      const livePtyId = `${WORKTREE_ID}@@live-agent`
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { deps, createTab } = testDeps({
        sessions: [listed(livePtyId)],
        surfaceOwners: new Map([
          [
            livePtyId,
            { paneKey: `tab-live:${SIBLING_LEAF_ID}`, ptyId: livePtyId, tabId: 'tab-live' }
          ]
        ]),
        resumeCount: 0
      })
      seedExistingSurface(deps.getState(), { tabId: 'tab-live', leafId: LIVE_LEAF_ID })

      await expect(runWorktreeAgentActivationGate(WORKTREE_ID, deps)).resolves.toBe('blocked')

      expect(createTab).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalledWith(
        '[worktree-activation] live PTYs left without a surface',
        expect.objectContaining({ worktreeId: WORKTREE_ID, declinedPtyIds: [livePtyId] })
      )
      warn.mockRestore()
    }
  )
})
