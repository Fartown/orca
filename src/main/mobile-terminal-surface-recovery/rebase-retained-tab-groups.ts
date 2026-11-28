import type {
  Tab,
  TabGroup,
  TabGroupLayoutNode
} from '../../shared/workspace-layout/tab-groups/tab-types'
import {
  insertGroupPreservingPriorOrder,
  insertTabPreservingOrderAndPins,
  rebaseTabGroupLayoutForRestoredGroups
} from './rebase-tab-group-layout'

type GroupSessionSlice = {
  tabGroups?: Record<string, TabGroup[]>
  tabGroupLayouts?: Record<string, TabGroupLayoutNode>
  activeTabIdByWorktree?: Record<string, string | null>
  activeGroupIdByWorktree?: Record<string, string>
}

export type RestoredTabGroupsResult = {
  groups: TabGroup[]
  unifiedTabs: Tab[]
  groupLayout: TabGroupLayoutNode | undefined
  activeGroupId: string | undefined
  activeTabId: string | null
}

/** Restore retained terminal tabs dropped by a stale renderer tabGroups write, keeping group layouts, active group, active tab, order, and pinned prefixes aligned. */
export function restoreRetainedTerminalTabsInGroups(
  worktreeId: string,
  incoming: GroupSessionSlice,
  prior: GroupSessionSlice,
  rebasedGroups: readonly TabGroup[],
  rebasedUnifiedTabs: readonly Tab[],
  validTabIds: ReadonlySet<string>,
  terminalTabIds: ReadonlySet<string>,
  fallbackTabId?: string
): RestoredTabGroupsResult {
  const priorGroups = prior.tabGroups?.[worktreeId] ?? []

  const unifiedTabById = new Map<string, Tab>()
  const terminalUnifiedByEntityId = new Map<string, Tab>()
  for (const tab of rebasedUnifiedTabs) {
    unifiedTabById.set(tab.id, tab)
    if (tab.contentType === 'terminal') {
      terminalUnifiedByEntityId.set(tab.entityId, tab)
    }
  }

  const isRetainedTerminalTabId = (tabId: string): boolean => {
    if (terminalTabIds.has(tabId)) {
      return true
    }
    const unified = unifiedTabById.get(tabId)
    return Boolean(
      unified && unified.contentType === 'terminal' && terminalTabIds.has(unified.entityId)
    )
  }

  const placedIds = new Set<string>()
  const markPlaced = (tabId: string): void => {
    placedIds.add(tabId)
    const unified = unifiedTabById.get(tabId)
    if (unified?.contentType === 'terminal') {
      placedIds.add(unified.entityId)
    }
    const byEntity = terminalUnifiedByEntityId.get(tabId)
    if (byEntity) {
      placedIds.add(byEntity.id)
    }
  }
  const isPlaced = (tabId: string): boolean => {
    if (placedIds.has(tabId)) {
      return true
    }
    const unified = unifiedTabById.get(tabId)
    if (unified?.contentType === 'terminal' && placedIds.has(unified.entityId)) {
      return true
    }
    const byEntity = terminalUnifiedByEntityId.get(tabId)
    return Boolean(byEntity && placedIds.has(byEntity.id))
  }

  for (const group of rebasedGroups) {
    for (const tabId of group.tabOrder) {
      markPlaced(tabId)
    }
  }

  const priorGroupById = new Map(priorGroups.map((group) => [group.id, group]))
  const priorGroupIndexById = new Map(priorGroups.map((group, index) => [group.id, index]))
  const availableGroupIds = new Set([
    ...rebasedGroups.map((group) => group.id),
    ...priorGroups.map((group) => group.id)
  ])

  let groups: TabGroup[] | null = null
  let groupById: Map<string, TabGroup> | null = null
  const ensureMutableGroups = (): { groups: TabGroup[]; groupById: Map<string, TabGroup> } => {
    if (!groups || !groupById) {
      groups = rebasedGroups.map((group) => ({ ...group, tabOrder: [...group.tabOrder] }))
      groupById = new Map(groups.map((group) => [group.id, group]))
    }
    return { groups, groupById }
  }

  for (const priorGroup of priorGroups) {
    const priorIndexByTabId = new Map<string, number>()
    const missing: string[] = []
    for (let index = 0; index < priorGroup.tabOrder.length; index += 1) {
      const tabId = priorGroup.tabOrder[index]
      if (!priorIndexByTabId.has(tabId)) {
        priorIndexByTabId.set(tabId, index)
      }
      if (!validTabIds.has(tabId) || !isRetainedTerminalTabId(tabId) || isPlaced(tabId)) {
        continue
      }
      const unified = unifiedTabById.get(tabId) ?? terminalUnifiedByEntityId.get(tabId)
      if (
        unified?.groupId &&
        unified.groupId !== priorGroup.id &&
        availableGroupIds.has(unified.groupId)
      ) {
        continue
      }
      markPlaced(tabId)
      missing.push(tabId)
    }
    if (missing.length === 0) {
      continue
    }
    const mutable = ensureMutableGroups()
    const existing = mutable.groupById.get(priorGroup.id)
    if (existing) {
      for (const tabId of missing) {
        insertTabPreservingOrderAndPins({
          tabOrder: existing.tabOrder,
          tabId,
          priorIndexByTabId,
          unifiedTabById
        })
      }
      if (!existing.activeTabId) {
        existing.activeTabId = missing[0] ?? null
      }
      continue
    }
    const pinnedMissing = missing.filter((tabId) => unifiedTabById.get(tabId)?.isPinned === true)
    const unpinnedMissing = missing.filter((tabId) => unifiedTabById.get(tabId)?.isPinned !== true)
    const tabOrder = [...pinnedMissing, ...unpinnedMissing]
    const restoredTabIds = new Set(tabOrder)
    const activeTabId =
      priorGroup.activeTabId && restoredTabIds.has(priorGroup.activeTabId)
        ? priorGroup.activeTabId
        : (tabOrder[0] ?? null)
    const recentTabIds = priorGroup.recentTabIds?.filter((tabId) => restoredTabIds.has(tabId))
    const restored: TabGroup = {
      ...priorGroup,
      tabOrder,
      activeTabId,
      ...(priorGroup.recentTabIds ? { recentTabIds: recentTabIds ?? [] } : {})
    }
    insertGroupPreservingPriorOrder(mutable.groups, restored, priorGroupIndexById)
    mutable.groupById.set(restored.id, restored)
  }

  let nextUnifiedTabs: Tab[] | null = null
  const ensureMutableUnifiedTabs = (): Tab[] => {
    if (!nextUnifiedTabs) {
      nextUnifiedTabs = [...rebasedUnifiedTabs]
    }
    return nextUnifiedTabs
  }

  for (let index = 0; index < rebasedUnifiedTabs.length; index += 1) {
    const tab = rebasedUnifiedTabs[index]
    if (
      tab.contentType !== 'terminal' ||
      (!terminalTabIds.has(tab.id) && !terminalTabIds.has(tab.entityId)) ||
      !validTabIds.has(tab.id) ||
      isPlaced(tab.id)
    ) {
      continue
    }
    const mutable = ensureMutableGroups()
    let target = tab.groupId ? mutable.groupById.get(tab.groupId) : undefined
    if (!target && tab.groupId) {
      const priorGroup = priorGroupById.get(tab.groupId)
      if (priorGroup) {
        const recreated: TabGroup = {
          ...priorGroup,
          tabOrder: [tab.id],
          activeTabId: tab.id,
          ...(priorGroup.recentTabIds
            ? { recentTabIds: priorGroup.recentTabIds.filter((id) => id === tab.id) }
            : {})
        }
        insertGroupPreservingPriorOrder(mutable.groups, recreated, priorGroupIndexById)
        mutable.groupById.set(recreated.id, recreated)
        markPlaced(tab.id)
        continue
      }
    }
    target ??= mutable.groups[0]
    if (!target) {
      continue
    }
    insertTabPreservingOrderAndPins({
      tabOrder: target.tabOrder,
      tabId: tab.id,
      unifiedTabById
    })
    if (!target.activeTabId) {
      target.activeTabId = tab.id
    }
    if (tab.groupId !== target.id) {
      const mutableTabs = ensureMutableUnifiedTabs()
      mutableTabs[index] = { ...tab, groupId: target.id }
    }
    markPlaced(tab.id)
  }

  const finalGroups = groups ?? [...rebasedGroups]
  const validGroupIds = new Set(finalGroups.map((group) => group.id))
  const groupLayout = rebaseTabGroupLayoutForRestoredGroups({
    groups: finalGroups,
    incomingGroupLayout: incoming.tabGroupLayouts?.[worktreeId],
    priorGroupLayout: prior.tabGroupLayouts?.[worktreeId]
  })
  const incomingActiveGroupId = incoming.activeGroupIdByWorktree?.[worktreeId]
  const priorActiveGroupId = prior.activeGroupIdByWorktree?.[worktreeId]
  const activeGroupId =
    finalGroups.length === 0
      ? undefined
      : incomingActiveGroupId && validGroupIds.has(incomingActiveGroupId)
        ? incomingActiveGroupId
        : priorActiveGroupId && validGroupIds.has(priorActiveGroupId)
          ? priorActiveGroupId
          : finalGroups[0]?.id

  const incomingActiveTabId = incoming.activeTabIdByWorktree?.[worktreeId] ?? null
  const priorActiveTabId = prior.activeTabIdByWorktree?.[worktreeId] ?? null
  const activeTabId = validTabIds.has(incomingActiveTabId ?? '')
    ? incomingActiveTabId
    : ((priorActiveTabId && validTabIds.has(priorActiveTabId)
        ? priorActiveTabId
        : (finalGroups[0]?.activeTabId ?? fallbackTabId)) ?? null)

  return {
    groups: finalGroups,
    unifiedTabs: nextUnifiedTabs ?? [...rebasedUnifiedTabs],
    groupLayout,
    activeGroupId,
    activeTabId
  }
}
