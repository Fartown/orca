import { describe, expect, it, vi } from 'vitest'
import { CLOSED_TERMINAL_TAB_TOMBSTONE_TTL_MS } from '../../../shared/closed-terminal-tab-tombstones'
import { isValidHostTerminalTabId } from '../../../shared/terminal-tab-id'
import { createTestStore } from '../store/slices/store-test-helpers'
import { adoptLiveWorkspacePtySurfaces } from '../lib/worktree-agent-live-surface-adoption'
import {
  LIVE_LEAF_ID,
  listed,
  seedExistingSurface,
  SIBLING_LEAF_ID,
  testDeps,
  UNOWNED,
  WORKTREE_ID
} from '../lib/worktree-agent-activation-gate.test-fixture'

vi.mock('../../../shared/layout-owner-switch', () => ({ ORCA_LAYOUT_OWNER_IS_MAIN: false }))

const ptyId = `${WORKTREE_ID}@@recorded-live`
const recorded = { paneKey: `tab-recorded:${LIVE_LEAF_ID}`, ptyId, tabId: 'tab-recorded' }

describe('recorded live terminal surface recovery', () => {
  it('restores the host-recorded tab and leaf once across three sweeps', async () => {
    const { deps, createTab } = testDeps({
      sessions: [listed(ptyId)],
      surfaceOwners: new Map([[ptyId, { unowned: true, recorded }]])
    })
    for (let sweep = 0; sweep < 3; sweep += 1) {
      await expect(
        adoptLiveWorkspacePtySurfaces(deps.getState, WORKTREE_ID, [ptyId], deps.listSurfaceOwners)
      ).resolves.toEqual({ surfaced: true, declinedPtyIds: [] })
    }
    expect(createTab).toHaveBeenCalledOnce()
    expect(createTab).toHaveBeenCalledWith(WORKTREE_ID, undefined, undefined, {
      id: 'tab-recorded',
      initialLeafId: LIVE_LEAF_ID,
      initialPtyId: ptyId,
      activate: false,
      recordInteraction: false
    })
    expect(deps.getState().tabsByWorktree[WORKTREE_ID]?.map((tab) => tab.id)).toEqual([
      'tab-recorded'
    ])
  })

  it('keeps the upstream fallback for an unrecorded PTY', async () => {
    const { deps, createTab } = testDeps({
      surfaceOwners: new Map([[ptyId, UNOWNED]])
    })
    await expect(
      adoptLiveWorkspacePtySurfaces(deps.getState, WORKTREE_ID, [ptyId], deps.listSurfaceOwners)
    ).resolves.toEqual({ surfaced: true, declinedPtyIds: [] })
    expect(createTab).toHaveBeenCalledWith(WORKTREE_ID, undefined, undefined, {
      initialPtyId: ptyId,
      activate: false,
      recordInteraction: false
    })
  })

  it('uses one fallback tab for a web surface record the real store cannot use as a tab id', async () => {
    const tabId = 'web-terminal-host%3A%3Aleaf'
    const webRecorded = { paneKey: `${tabId}:${LIVE_LEAF_ID}`, ptyId, tabId }
    expect(isValidHostTerminalTabId(tabId)).toBe(false)
    const store = createTestStore()
    const createTab = vi.spyOn(store.getState(), 'createTab')

    await expect(
      adoptLiveWorkspacePtySurfaces(
        store.getState,
        WORKTREE_ID,
        [ptyId],
        async () => new Map([[ptyId, { unowned: true, recorded: webRecorded }]])
      )
    ).resolves.toEqual({ surfaced: true, declinedPtyIds: [] })

    expect(createTab).toHaveBeenCalledOnce()
    expect(store.getState().tabsByWorktree[WORKTREE_ID]).toHaveLength(1)
    expect(store.getState().tabsByWorktree[WORKTREE_ID]?.[0]?.id).not.toBe(tabId)
  })

  it('skips exact recovery when the renderer knows the tab was closed', async () => {
    const { deps, createTab } = testDeps({
      surfaceOwners: new Map([[ptyId, { unowned: true, recorded }]])
    })
    Object.assign(deps.getState(), {
      closedTerminalTabTombstonesByTabId: {
        'tab-recorded': { closedAt: Date.now(), worktreeId: WORKTREE_ID }
      }
    })
    await expect(
      adoptLiveWorkspacePtySurfaces(deps.getState, WORKTREE_ID, [ptyId], deps.listSurfaceOwners)
    ).resolves.toEqual({ surfaced: true, declinedPtyIds: [] })
    expect(createTab).toHaveBeenCalledWith(WORKTREE_ID, undefined, undefined, {
      initialPtyId: ptyId,
      activate: false,
      recordInteraction: false
    })
  })

  it('does not use an expired close record to refuse the recorded identity', async () => {
    const { deps, createTab } = testDeps({
      surfaceOwners: new Map([[ptyId, { unowned: true, recorded }]])
    })
    Object.assign(deps.getState(), {
      closedTerminalTabTombstonesByTabId: {
        'tab-recorded': {
          closedAt: Date.now() - CLOSED_TERMINAL_TAB_TOMBSTONE_TTL_MS - 1,
          worktreeId: WORKTREE_ID
        }
      }
    })
    await expect(
      adoptLiveWorkspacePtySurfaces(deps.getState, WORKTREE_ID, [ptyId], deps.listSurfaceOwners)
    ).resolves.toEqual({ surfaced: true, declinedPtyIds: [] })
    expect(createTab).toHaveBeenCalledOnce()
  })

  it('rechecks a close that happens while the host listing is in flight', async () => {
    const { deps, createTab } = testDeps({})
    let answer!: (owners: Map<string, { unowned: true; recorded: typeof recorded }>) => void
    const listSurfaceOwners = vi.fn(
      () =>
        new Promise<Map<string, { unowned: true; recorded: typeof recorded }>>((resolve) => {
          answer = resolve
        })
    )
    const sweep = adoptLiveWorkspacePtySurfaces(
      deps.getState,
      WORKTREE_ID,
      [ptyId],
      listSurfaceOwners
    )
    Object.assign(deps.getState(), {
      closedTerminalTabTombstonesByTabId: {
        'tab-recorded': { closedAt: Date.now(), worktreeId: WORKTREE_ID }
      }
    })
    answer(new Map([[ptyId, { unowned: true, recorded }]]))
    await expect(sweep).resolves.toEqual({ surfaced: true, declinedPtyIds: [] })
    expect(createTab).toHaveBeenCalledWith(WORKTREE_ID, undefined, undefined, {
      initialPtyId: ptyId,
      activate: false,
      recordInteraction: false
    })
  })

  it('keeps the upstream fallback when a recorded leaf is occupied', async () => {
    const { deps, createTab } = testDeps({
      surfaceOwners: new Map([[ptyId, { unowned: true, recorded }]])
    })
    seedExistingSurface(deps.getState(), {
      tabId: 'tab-recorded',
      leafId: LIVE_LEAF_ID,
      boundPtyId: `${WORKTREE_ID}@@other`
    })
    await expect(
      adoptLiveWorkspacePtySurfaces(deps.getState, WORKTREE_ID, [ptyId], deps.listSurfaceOwners)
    ).resolves.toEqual({ surfaced: true, declinedPtyIds: [] })
    expect(createTab).toHaveBeenCalledWith(WORKTREE_ID, undefined, undefined, {
      initialPtyId: ptyId,
      activate: false,
      recordInteraction: false
    })
  })

  it('preserves a sibling while restoring the recorded leaf', async () => {
    const { deps, createTab } = testDeps({
      surfaceOwners: new Map([[ptyId, { unowned: true, recorded }]])
    })
    const store = deps.getState()
    seedExistingSurface(store, { tabId: 'tab-recorded', leafId: LIVE_LEAF_ID })
    const layout = store.terminalLayoutsByTabId['tab-recorded']
    layout.root = {
      type: 'split',
      direction: 'horizontal',
      first: { type: 'leaf', leafId: LIVE_LEAF_ID },
      second: { type: 'leaf', leafId: SIBLING_LEAF_ID }
    }
    layout.ptyIdsByLeafId[SIBLING_LEAF_ID] = `${WORKTREE_ID}@@sibling`
    await expect(
      adoptLiveWorkspacePtySurfaces(deps.getState, WORKTREE_ID, [ptyId], deps.listSurfaceOwners)
    ).resolves.toEqual({ surfaced: true, declinedPtyIds: [] })
    expect(createTab).not.toHaveBeenCalled()
    expect(store.terminalLayoutsByTabId['tab-recorded'].ptyIdsByLeafId).toEqual({
      [LIVE_LEAF_ID]: ptyId,
      [SIBLING_LEAF_ID]: `${WORKTREE_ID}@@sibling`
    })
  })

  it('keeps the upstream fallback for another recorded leaf after the tab was restored', async () => {
    const siblingPtyId = `${WORKTREE_ID}@@recorded-sibling`
    const sibling = {
      paneKey: `tab-recorded:${SIBLING_LEAF_ID}`,
      ptyId: siblingPtyId,
      tabId: 'tab-recorded'
    }
    const { deps, createTab } = testDeps({
      surfaceOwners: new Map([
        [ptyId, { unowned: true, recorded }],
        [siblingPtyId, { unowned: true, recorded: sibling }]
      ])
    })
    await expect(
      adoptLiveWorkspacePtySurfaces(
        deps.getState,
        WORKTREE_ID,
        [ptyId, siblingPtyId],
        deps.listSurfaceOwners
      )
    ).resolves.toEqual({ surfaced: true, declinedPtyIds: [] })
    expect(createTab).toHaveBeenCalledTimes(2)
    expect(deps.getState().terminalLayoutsByTabId['tab-recorded'].ptyIdsByLeafId).toEqual({
      [LIVE_LEAF_ID]: ptyId
    })
    expect(createTab).toHaveBeenNthCalledWith(2, WORKTREE_ID, undefined, undefined, {
      initialPtyId: siblingPtyId,
      activate: false,
      recordInteraction: false
    })
  })
})
