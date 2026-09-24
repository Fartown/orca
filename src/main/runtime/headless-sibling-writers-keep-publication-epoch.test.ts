import { describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from './orca-runtime'
import { getDefaultWorkspaceSession } from '../../shared/constants'
import type {
  RuntimeMobileSessionBrowserTab,
  RuntimeMobileSessionTabGroup,
  RuntimeMobileSessionTabsSnapshot,
  RuntimeMobileSessionTerminalTab
} from '../../shared/runtime-types'

/**
 * Sibling headless writers are not publisher handovers either.
 *
 * `closeHeadlessMobileTerminalTab` stopped minting a fresh `headless:<now>` epoch on every close
 * (#19860) because a paired client retires the epoch a new publisher displaces, and the web
 * mirror's retirement is final — the renderer's next publication, carrying the epoch the write
 * had just retired, was rejected forever. The sibling writers (move, props, pane layout,
 * activation, browser-tab retirement) minted on the same assumption: each had the stored snapshot
 * in hand yet published a stranger's epoch for a worktree the renderer generation still owns.
 * These cases pin every one of them to carrying the stored epoch forward.
 */
const WORKTREE_ID = 'repo-1::/tmp/headless-siblings'
const LEAF_ID = '11111111-1111-4111-8111-111111111111'
const LIVE_EPOCH = 'renderer-generation-1'

function makeStore() {
  const session = getDefaultWorkspaceSession()
  return {
    getWorkspaceSession: vi.fn(() => session),
    setWorkspaceSession: vi.fn(),
    flushOrThrow: vi.fn(),
    getRepos: vi.fn(() => [
      {
        id: 'repo-1',
        path: '/tmp/headless-siblings',
        displayName: 'headless',
        badgeColor: '#000000',
        addedAt: 0
      }
    ]),
    getAllWorktreeMeta: vi.fn(() => ({})),
    getWorktreeMeta: vi.fn(() => undefined),
    setWorktreeMeta: vi.fn(),
    removeWorktreeMeta: vi.fn(),
    getSettings: vi.fn(() => ({ workspaceDir: '/tmp/workspaces' })),
    getProjects: vi.fn(() => [])
  }
}

function terminalTab(parentTabId: string, leafId: string): RuntimeMobileSessionTerminalTab {
  return {
    type: 'terminal',
    id: `${parentTabId}::${leafId}`,
    parentTabId,
    leafId,
    title: 'Terminal',
    isActive: true
  }
}

function browserTab(id: string, pageId: string): RuntimeMobileSessionBrowserTab {
  return {
    type: 'browser',
    id,
    title: 'Browser',
    browserWorkspaceId: WORKTREE_ID,
    browserPageId: pageId,
    url: 'https://example.com',
    loading: false,
    canGoBack: false,
    canGoForward: false,
    isActive: false
  }
}

function storedSnapshot(
  tabs: RuntimeMobileSessionTabsSnapshot['tabs'],
  tabGroups?: RuntimeMobileSessionTabGroup[]
): RuntimeMobileSessionTabsSnapshot {
  return {
    worktree: WORKTREE_ID,
    publicationEpoch: LIVE_EPOCH,
    snapshotVersion: 4,
    activeGroupId: null,
    activeTabId: `tab-a::${LEAF_ID}`,
    activeTabType: 'terminal',
    ...(tabGroups ? { tabGroups } : {}),
    tabs
  }
}

type RuntimeInternals = {
  activateHeadlessMobileSessionTerminalTab: (
    worktreeId: string,
    snapshot: RuntimeMobileSessionTabsSnapshot,
    activeTab: RuntimeMobileSessionTerminalTab
  ) => void
  moveHeadlessMobileSessionTab: (
    worktreeId: string,
    snapshot: RuntimeMobileSessionTabsSnapshot,
    move: { kind: 'reorder'; tabId: string; targetGroupId: string; tabOrder: string[] }
  ) => { moved: boolean }
  applyHeadlessSessionTabPropsToSnapshot: (
    worktreeId: string,
    tabId: string,
    props: { isPinned?: boolean }
  ) => void
  applyHeadlessTerminalPaneLayoutToSnapshot: (
    worktreeId: string,
    args: {
      tabId: string
      root: { type: 'leaf'; leafId: string } | null
      expandedLeafId: string | null
    }
  ) => void
  retireRuntimeOwnedBrowserSessionTab: (worktreeId: string, browserPageId: string) => boolean
  mobileSessionTabsByWorktree: Map<string, RuntimeMobileSessionTabsSnapshot>
}

function runtimeWith(snapshot: RuntimeMobileSessionTabsSnapshot): RuntimeInternals {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: makeStore covers the reads this suite drives.
  const runtime = new OrcaRuntimeService(makeStore() as never)
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the writers are protected; reaching them is the only way to drive a headless write.
  const internals = runtime as unknown as RuntimeInternals
  internals.mobileSessionTabsByWorktree.set(WORKTREE_ID, snapshot)
  return internals
}

function publishedAfter(
  internals: RuntimeInternals,
  write: () => void
): RuntimeMobileSessionTabsSnapshot {
  write()
  const published = internals.mobileSessionTabsByWorktree.get(WORKTREE_ID)
  if (!published) {
    throw new Error(`the write published no snapshot for ${WORKTREE_ID}`)
  }
  return published
}

describe('headless sibling writers keep the incumbent publication epoch', () => {
  it('terminal tab activation carries the epoch forward', () => {
    const activeTab = terminalTab('tab-a', LEAF_ID)
    const internals = runtimeWith(storedSnapshot([activeTab, terminalTab('tab-b', LEAF_ID)]))
    const published = publishedAfter(internals, () =>
      internals.activateHeadlessMobileSessionTerminalTab(
        WORKTREE_ID,
        internals.mobileSessionTabsByWorktree.get(WORKTREE_ID)!,
        activeTab
      )
    )
    expect(published.publicationEpoch).toBe(LIVE_EPOCH)
    expect(published.snapshotVersion).toBe(5)
  })

  it('tab reorder carries the epoch forward', () => {
    const snapshot = storedSnapshot(
      [terminalTab('tab-a', LEAF_ID), terminalTab('tab-b', LEAF_ID)],
      [{ id: 'group-1', activeTabId: 'tab-a', tabOrder: ['tab-a', 'tab-b'] }]
    )
    const internals = runtimeWith(snapshot)
    const published = publishedAfter(internals, () =>
      internals.moveHeadlessMobileSessionTab(WORKTREE_ID, snapshot, {
        kind: 'reorder',
        tabId: 'tab-a',
        targetGroupId: 'group-1',
        tabOrder: ['tab-b', 'tab-a']
      })
    )
    expect(published.publicationEpoch).toBe(LIVE_EPOCH)
    expect(published.snapshotVersion).toBe(5)
  })

  it('tab props carry the epoch forward', () => {
    const internals = runtimeWith(
      storedSnapshot([terminalTab('tab-a', LEAF_ID), terminalTab('tab-b', LEAF_ID)])
    )
    const published = publishedAfter(internals, () =>
      internals.applyHeadlessSessionTabPropsToSnapshot(WORKTREE_ID, 'tab-a', { isPinned: true })
    )
    expect(published.publicationEpoch).toBe(LIVE_EPOCH)
    expect(published.snapshotVersion).toBe(5)
  })

  it('pane layout carries the epoch forward', () => {
    const laidOut: RuntimeMobileSessionTerminalTab = {
      ...terminalTab('tab-a', LEAF_ID),
      parentLayout: {
        root: { type: 'leaf', leafId: LEAF_ID },
        activeLeafId: LEAF_ID,
        expandedLeafId: LEAF_ID
      }
    }
    const internals = runtimeWith(storedSnapshot([laidOut, terminalTab('tab-b', LEAF_ID)]))
    const published = publishedAfter(internals, () =>
      internals.applyHeadlessTerminalPaneLayoutToSnapshot(WORKTREE_ID, {
        tabId: 'tab-a',
        root: null,
        expandedLeafId: null
      })
    )
    expect(published.publicationEpoch).toBe(LIVE_EPOCH)
    expect(published.snapshotVersion).toBe(5)
  })

  it('browser tab retirement carries the epoch forward', () => {
    const internals = runtimeWith(
      storedSnapshot([terminalTab('tab-a', LEAF_ID), browserTab('browser-1', 'page-1')])
    )
    const published = publishedAfter(internals, () => {
      internals.retireRuntimeOwnedBrowserSessionTab(WORKTREE_ID, 'page-1')
    })
    expect(published.publicationEpoch).toBe(LIVE_EPOCH)
    expect(published.snapshotVersion).toBe(5)
  })
})
