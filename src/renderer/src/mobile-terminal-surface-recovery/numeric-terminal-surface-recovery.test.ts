import { describe, expect, it, vi } from 'vitest'
import { adoptLiveWorkspacePtySurfaces } from '../lib/worktree-agent-live-surface-adoption'
import { runWorktreeAgentActivationGate } from '../lib/worktree-agent-activation-gate'
import {
  LIVE_LEAF_ID,
  SIBLING_LEAF_ID,
  seedExistingSurface,
  testDeps,
  WORKTREE_ID
} from '../lib/worktree-agent-activation-gate.test-fixture'

vi.mock('../../../shared/layout-owner-switch', () => ({ ORCA_LAYOUT_OWNER_IS_MAIN: false }))

describe('numeric terminal surface recovery', () => {
  it.each([WORKTREE_ID, 'folder:acp-workspace'])(
    'restores the host-recorded numeric terminals despite stale bindings outside %s',
    async (worktreeId) => {
      const records = [
        { ptyId: '4', tabId: 'original-4', paneKey: `original-4:${LIVE_LEAF_ID}` },
        { ptyId: '5', tabId: 'original-5', paneKey: `original-5:${SIBLING_LEAF_ID}` }
      ]
      const { deps, createTab } = testDeps({
        sessions: records.map(({ ptyId }) => ({
          id: ptyId,
          cwd: '/acp-workspace',
          worktreeId,
          title: 'Claude',
          agentOwnership: 'present'
        })),
        surfaceOwners: new Map(
          records.map((record) => [record.ptyId, { unowned: true, recorded: record }])
        )
      })
      const state = deps.getState()
      for (const record of records) {
        seedExistingSurface(state, {
          tabId: `stale-${record.ptyId}`,
          leafId: LIVE_LEAF_ID,
          worktreeId: 'other-repo::/other-workspace',
          boundPtyId: record.ptyId
        })
        state.ptyIdsByTabId[`stale-${record.ptyId}`] = [record.ptyId]
      }
      for (let activation = 0; activation < 3; activation += 1) {
        await expect(runWorktreeAgentActivationGate(worktreeId, deps)).resolves.toBe('adopted')
      }
      expect(createTab).toHaveBeenCalledTimes(2)
      expect(state.tabsByWorktree[worktreeId]?.map((tab) => tab.id)).toEqual([
        'original-4',
        'original-5'
      ])
      for (const record of records) {
        expect(createTab).toHaveBeenCalledWith(worktreeId, undefined, undefined, {
          id: record.tabId,
          initialLeafId: record.paneKey.split(':')[1],
          initialPtyId: record.ptyId,
          activate: false,
          recordInteraction: false
        })
        expect(state.ptyIdsByTabId[`stale-${record.ptyId}`]).toEqual([record.ptyId])
      }
    }
  )

  it('withholds a numeric fallback when the host cannot name its original pane', async () => {
    const { deps, createTab } = testDeps({
      sessions: [
        {
          id: '4',
          cwd: '/acp-workspace',
          worktreeId: WORKTREE_ID,
          title: 'Claude',
          agentOwnership: 'present'
        }
      ],
      surfaceOwners: new Map([['4', { unowned: true, recorded: null }]])
    })
    await expect(runWorktreeAgentActivationGate(WORKTREE_ID, deps)).resolves.toBe('blocked')
    expect(createTab).not.toHaveBeenCalled()
  })

  it('withholds a numeric fallback when another PTY occupies the recorded pane', async () => {
    const record = { ptyId: '4', tabId: 'original-4', paneKey: `original-4:${LIVE_LEAF_ID}` }
    const { deps, createTab } = testDeps({
      surfaceOwners: new Map([['4', { unowned: true, recorded: record }]])
    })
    seedExistingSurface(deps.getState(), {
      tabId: record.tabId,
      leafId: LIVE_LEAF_ID,
      boundPtyId: 'other-live-pty'
    })
    await expect(
      adoptLiveWorkspacePtySurfaces(deps.getState, WORKTREE_ID, ['4'], deps.listSurfaceOwners)
    ).resolves.toEqual({ surfaced: false, declinedPtyIds: ['4'] })
    expect(createTab).not.toHaveBeenCalled()
    expect(deps.getState().terminalLayoutsByTabId[record.tabId].ptyIdsByLeafId[LIVE_LEAF_ID]).toBe(
      'other-live-pty'
    )
  })
})
