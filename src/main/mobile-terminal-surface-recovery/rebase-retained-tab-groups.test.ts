import { describe, expect, it } from 'vitest'
import type { Tab, TabGroup } from '../../shared/workspace-layout/tab-groups/tab-types'
import type {
  TerminalLayoutSnapshot,
  TerminalTab
} from '../../shared/workspace-layout/terminal-tab-types'
import type { WorkspaceSessionState } from '../../shared/workspace-session/workspace-session-state-types'
import { rebaseWorkspaceSessionTerminalMembership } from '../runtime/terminal/surface/workspace-session-terminal-membership-authority'

function leaf(index: number): { leafId: string; ptyId: string } {
  return { leafId: `leaf-${index}`, ptyId: `pty-${index}` }
}

function emptySession(): WorkspaceSessionState {
  return {
    activeRepoId: null,
    activeWorktreeId: null,
    activeTabId: null,
    tabsByWorktree: {},
    terminalLayoutsByTabId: {}
  }
}

function addWorkspace(
  base: WorkspaceSessionState,
  worktreeId: string,
  groupsSpec: readonly {
    id: string
    tabs: readonly {
      id: string
      leaves: readonly (readonly { leafId: string; ptyId: string }[])[]
    }[]
  }[]
): WorkspaceSessionState {
  const tabs: TerminalTab[] = []
  const unifiedTabs: Tab[] = []
  const tabGroups: TabGroup[] = []
  const terminalLayoutsByTabId: Record<string, TerminalLayoutSnapshot> = {
    ...base.terminalLayoutsByTabId
  }
  let sortOrder = 0
  for (const group of groupsSpec) {
    const tabOrder: string[] = []
    for (const tabSpec of group.tabs) {
      const firstLeaf = tabSpec.leaves[0]?.[0] ?? leaf(sortOrder + 1)
      tabs.push({
        id: tabSpec.id,
        ptyId: firstLeaf.ptyId,
        worktreeId,
        title: tabSpec.id,
        customTitle: null,
        color: null,
        sortOrder,
        createdAt: sortOrder + 1
      })
      unifiedTabs.push({
        id: tabSpec.id,
        entityId: tabSpec.id,
        groupId: group.id,
        worktreeId,
        contentType: 'terminal',
        label: tabSpec.id,
        customLabel: null,
        color: null,
        sortOrder,
        createdAt: sortOrder + 1
      })
      terminalLayoutsByTabId[tabSpec.id] = {
        root: { type: 'leaf', leafId: firstLeaf.leafId },
        activeLeafId: firstLeaf.leafId,
        expandedLeafId: null,
        ptyIdsByLeafId: { [firstLeaf.leafId]: firstLeaf.ptyId }
      }
      tabOrder.push(tabSpec.id)
      sortOrder += 1
    }
    tabGroups.push({
      id: group.id,
      worktreeId,
      activeTabId: tabOrder[0] ?? null,
      tabOrder
    })
  }
  return {
    ...base,
    tabsByWorktree: { ...base.tabsByWorktree, [worktreeId]: tabs },
    terminalLayoutsByTabId,
    unifiedTabs: { ...base.unifiedTabs, [worktreeId]: unifiedTabs },
    tabGroups: { ...base.tabGroups, [worktreeId]: tabGroups }
  }
}

describe('rebaseWorkspaceSessionTerminalMembership tabGroups retention', () => {
  it('restores dropped terminal tabs in original relative order and preserves the pinned prefix', () => {
    const worktreeId = 'repo-1::/workspace/octo'
    const priorBase = addWorkspace(emptySession(), worktreeId, [
      {
        id: 'group-1',
        tabs: [
          { id: 'tab-pin-1', leaves: [[leaf(1)]] },
          { id: 'tab-pin-2', leaves: [[leaf(2)]] },
          { id: 'tab-mid-1', leaves: [[leaf(3)]] },
          { id: 'tab-mid-2', leaves: [[leaf(4)]] },
          { id: 'tab-tail', leaves: [[leaf(5)]] }
        ]
      }
    ])
    const prior = {
      ...priorBase,
      terminalTopologyRevisionByRepoId: { 'repo-1': 82 },
      unifiedTabs: {
        [worktreeId]: priorBase.unifiedTabs![worktreeId]!.map((tab) =>
          tab.id === 'tab-pin-1' || tab.id === 'tab-pin-2' ? { ...tab, isPinned: true } : tab
        )
      }
    }

    const incomingBase = addWorkspace(emptySession(), worktreeId, [
      {
        id: 'group-1',
        tabs: [
          { id: 'tab-pin-1', leaves: [[leaf(1)]] },
          { id: 'tab-tail', leaves: [[leaf(5)]] },
          { id: 'tab-minted', leaves: [[leaf(6)]] }
        ]
      }
    ])
    const incoming = {
      ...incomingBase,
      terminalTopologyRevisionByRepoId: { 'repo-1': 80 },
      unifiedTabs: {
        [worktreeId]: incomingBase.unifiedTabs![worktreeId]!.map((tab) =>
          tab.id === 'tab-pin-1' ? { ...tab, isPinned: true } : tab
        )
      }
    }

    const rebased = rebaseWorkspaceSessionTerminalMembership(incoming, prior)

    expect(rebased.tabGroups?.[worktreeId]).toMatchObject([
      {
        id: 'group-1',
        tabOrder: ['tab-pin-1', 'tab-pin-2', 'tab-mid-1', 'tab-mid-2', 'tab-tail']
      }
    ])
  })

  it('restores prior split tabGroupLayouts and activeGroupIdByWorktree when incoming drops a prior group or replaces it with a minted group', () => {
    const worktreeId = 'repo-1::/workspace/octo'
    const priorBase = addWorkspace(emptySession(), worktreeId, [
      { id: 'group-1', tabs: [{ id: 'tab-1', leaves: [[leaf(1)]] }] },
      { id: 'group-2', tabs: [{ id: 'tab-2', leaves: [[leaf(2)]] }] }
    ])
    const priorSplit = {
      type: 'split' as const,
      direction: 'vertical' as const,
      ratio: 0.3,
      first: { type: 'leaf' as const, groupId: 'group-1' },
      second: { type: 'leaf' as const, groupId: 'group-2' }
    }
    const prior = {
      ...priorBase,
      terminalTopologyRevisionByRepoId: { 'repo-1': 82 },
      tabGroupLayouts: { [worktreeId]: priorSplit },
      activeGroupIdByWorktree: { [worktreeId]: 'group-2' }
    }

    // Scenario A: incoming replaces everything with a temporary minted group.
    const incomingMintedBase = addWorkspace(emptySession(), worktreeId, [
      { id: 'group-minted', tabs: [{ id: 'tab-minted', leaves: [[leaf(9)]] }] }
    ])
    const incomingMinted = {
      ...incomingMintedBase,
      terminalTopologyRevisionByRepoId: { 'repo-1': 80 },
      tabGroupLayouts: { [worktreeId]: { type: 'leaf' as const, groupId: 'group-minted' } },
      activeGroupIdByWorktree: { [worktreeId]: 'group-minted' }
    }
    const rewrites = { worktreeIds: new Set<string>(), tabIds: new Set<string>(), whole: false }
    const rebasedA = rebaseWorkspaceSessionTerminalMembership(incomingMinted, prior, rewrites)

    expect(rebasedA.tabGroups?.[worktreeId]?.map((g) => g.id)).toEqual(['group-1', 'group-2'])
    expect(rebasedA.tabGroupLayouts?.[worktreeId]).toEqual(priorSplit)
    expect(rebasedA.activeGroupIdByWorktree?.[worktreeId]).toBe('group-2')
    expect(rewrites.worktreeIds.has(worktreeId)).toBe(true)

    // Scenario B: incoming collapses group-2 to single-leaf group-1.
    const incomingCollapsedBase = addWorkspace(emptySession(), worktreeId, [
      { id: 'group-1', tabs: [{ id: 'tab-1', leaves: [[leaf(1)]] }] }
    ])
    const incomingCollapsed = {
      ...incomingCollapsedBase,
      terminalTopologyRevisionByRepoId: { 'repo-1': 80 },
      tabGroupLayouts: { [worktreeId]: { type: 'leaf' as const, groupId: 'group-1' } },
      activeGroupIdByWorktree: { [worktreeId]: 'group-1' }
    }
    const rebasedB = rebaseWorkspaceSessionTerminalMembership(incomingCollapsed, prior)

    expect(rebasedB.tabGroups?.[worktreeId]?.map((g) => g.id)).toEqual(['group-1', 'group-2'])
    expect(rebasedB.tabGroupLayouts?.[worktreeId]).toEqual(priorSplit)
    expect(rebasedB.activeGroupIdByWorktree?.[worktreeId]).toBe('group-1')
  })

  it('handles distinct unified tab.id vs entityId, respects incoming group moves, deduplicates prior tabOrder, and repairs orphaned groupId', () => {
    const worktreeId = 'repo-1::/workspace/octo'
    const base = addWorkspace(emptySession(), worktreeId, [
      {
        id: 'group-1',
        tabs: [
          { id: 'term-1', leaves: [[leaf(1)]] },
          { id: 'term-2', leaves: [[leaf(2)]] },
          { id: 'term-3', leaves: [[leaf(3)]] }
        ]
      }
    ])
    const prior = {
      ...base,
      terminalTopologyRevisionByRepoId: { 'repo-1': 82 },
      unifiedTabs: {
        [worktreeId]: [
          { ...base.unifiedTabs![worktreeId]![0]!, id: 'utab-1', entityId: 'term-1' },
          { ...base.unifiedTabs![worktreeId]![1]!, id: 'term-2', entityId: 'term-2' },
          {
            ...base.unifiedTabs![worktreeId]![2]!,
            id: 'term-3',
            entityId: 'term-3',
            groupId: 'deleted-group'
          }
        ]
      },
      tabGroups: {
        [worktreeId]: [
          {
            ...base.tabGroups![worktreeId]![0]!,
            // Corrupt duplicate entry + distinct unified id for term-1; term-3 omitted.
            tabOrder: ['utab-1', 'utab-1', 'term-2']
          }
        ]
      }
    }

    const incoming = {
      ...prior,
      terminalTopologyRevisionByRepoId: { 'repo-1': 80 },
      unifiedTabs: {
        [worktreeId]: [
          // Incoming moved term-2 to group-2 (which still holds an editor tab).
          { ...prior.unifiedTabs![worktreeId]![0]! },
          { ...prior.unifiedTabs![worktreeId]![1]!, groupId: 'group-2' },
          {
            id: 'editor-1',
            entityId: '/workspace/octo/README.md',
            groupId: 'group-2',
            worktreeId,
            contentType: 'editor' as const,
            label: 'README.md',
            customLabel: null,
            color: null,
            sortOrder: 0,
            createdAt: 1
          }
        ]
      },
      tabGroups: {
        [worktreeId]: [
          {
            id: 'group-1',
            worktreeId,
            activeTabId: 'utab-1',
            tabOrder: ['utab-1']
          },
          {
            id: 'group-2',
            worktreeId,
            activeTabId: 'editor-1',
            tabOrder: ['editor-1']
          }
        ]
      }
    }

    const rebased = rebaseWorkspaceSessionTerminalMembership(incoming, prior)

    // utab-1 is not duplicated; term-2 lands in its moved group-2; term-3 falls back to group-1 with groupId aligned.
    expect(rebased.tabGroups?.[worktreeId]).toMatchObject([
      { id: 'group-1', tabOrder: ['utab-1', 'term-3'] },
      { id: 'group-2', tabOrder: ['editor-1', 'term-2'] }
    ])
    const term3Unified = rebased.unifiedTabs?.[worktreeId]?.find((tab) => tab.id === 'term-3')
    expect(term3Unified?.groupId).toBe('group-1')
  })
})
