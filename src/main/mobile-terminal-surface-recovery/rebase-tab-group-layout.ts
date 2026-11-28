import type {
  Tab,
  TabGroup,
  TabGroupLayoutNode
} from '../../shared/workspace-layout/tab-groups/tab-types'
import { pruneTabGroupLayoutAfterRetirement } from '../runtime/terminal/surface/mobile-session-terminal-retirement'

function collectLayoutGroupIds(
  layout: TabGroupLayoutNode | undefined,
  ids = new Set<string>()
): Set<string> {
  if (!layout) {
    return ids
  }
  if (layout.type === 'leaf') {
    ids.add(layout.groupId)
    return ids
  }
  collectLayoutGroupIds(layout.first, ids)
  collectLayoutGroupIds(layout.second, ids)
  return ids
}

function countPinnedPrefix(
  tabOrder: readonly string[],
  unifiedTabById: ReadonlyMap<string, Tab>
): number {
  let count = 0
  while (count < tabOrder.length && unifiedTabById.get(tabOrder[count])?.isPinned === true) {
    count += 1
  }
  return count
}

export function insertTabPreservingOrderAndPins(args: {
  tabOrder: string[]
  tabId: string
  priorIndexByTabId?: ReadonlyMap<string, number>
  unifiedTabById: ReadonlyMap<string, Tab>
}): void {
  const { tabOrder, tabId, priorIndexByTabId, unifiedTabById } = args
  const isPinned = unifiedTabById.get(tabId)?.isPinned === true
  const pinnedPrefixLength = countPinnedPrefix(tabOrder, unifiedTabById)
  const minIndex = isPinned ? 0 : pinnedPrefixLength
  const maxIndex = isPinned ? pinnedPrefixLength : tabOrder.length
  const targetPriorIndex = priorIndexByTabId?.get(tabId)
  if (targetPriorIndex !== undefined && priorIndexByTabId) {
    for (let index = minIndex; index < maxIndex; index += 1) {
      const candidatePriorIndex = priorIndexByTabId.get(tabOrder[index])
      if (candidatePriorIndex !== undefined && candidatePriorIndex > targetPriorIndex) {
        tabOrder.splice(index, 0, tabId)
        return
      }
    }
  }
  tabOrder.splice(maxIndex, 0, tabId)
}

export function insertGroupPreservingPriorOrder(
  groups: TabGroup[],
  group: TabGroup,
  priorGroupIndexById: ReadonlyMap<string, number>
): void {
  const targetIndex = priorGroupIndexById.get(group.id)
  if (targetIndex !== undefined) {
    for (let index = 0; index < groups.length; index += 1) {
      const candidateIndex = priorGroupIndexById.get(groups[index].id)
      if (candidateIndex !== undefined && candidateIndex > targetIndex) {
        groups.splice(index, 0, group)
        return
      }
    }
  }
  groups.push(group)
}

export function rebaseTabGroupLayoutForRestoredGroups(args: {
  groups: readonly TabGroup[]
  incomingGroupLayout: TabGroupLayoutNode | undefined
  priorGroupLayout: TabGroupLayoutNode | undefined
}): TabGroupLayoutNode | undefined {
  const { groups, incomingGroupLayout, priorGroupLayout } = args
  if (groups.length === 0 || (!incomingGroupLayout && !priorGroupLayout)) {
    return undefined
  }
  const validGroupIds = new Set(groups.map((group) => group.id))
  const prunedIncoming = pruneTabGroupLayoutAfterRetirement(incomingGroupLayout, validGroupIds)
  const prunedPrior = pruneTabGroupLayoutAfterRetirement(priorGroupLayout, validGroupIds)
  const incomingIds = collectLayoutGroupIds(prunedIncoming)
  const priorIds = collectLayoutGroupIds(prunedPrior)

  let layout: TabGroupLayoutNode | undefined
  if (prunedIncoming && incomingIds.size === validGroupIds.size) {
    layout = prunedIncoming
  } else if (prunedPrior && priorIds.size === validGroupIds.size) {
    layout = prunedPrior
  } else if (prunedPrior && (!prunedIncoming || priorIds.size > incomingIds.size)) {
    layout = prunedPrior
  } else {
    layout = prunedIncoming
  }

  const coveredIds = collectLayoutGroupIds(layout)
  for (const group of groups) {
    if (coveredIds.has(group.id)) {
      continue
    }
    const leaf: TabGroupLayoutNode = { type: 'leaf', groupId: group.id }
    layout = layout
      ? { type: 'split', direction: 'horizontal', ratio: 0.5, first: layout, second: leaf }
      : leaf
    coveredIds.add(group.id)
  }
  return layout
}
