import {
  buildProjectGroupingIndex,
  type ProjectSectionModel
} from '../../../shared/project-section-grouping'
import type { Repo } from '../../../shared/repo-types'

export function resolveSidebarProjectNameRevealKey(
  nativeKey: string,
  sectionKeys: ReadonlyMap<string, unknown> | undefined,
  repoMap: Map<string, Repo>,
  model?: ProjectSectionModel
): string {
  if (!model || !sectionKeys || sectionKeys.has(nativeKey)) {
    return nativeKey
  }
  for (const grouping of [model, { ...model, groupNamesByHost: true }]) {
    const target = buildProjectGroupingIndex(grouping, repoMap)?.nameGroups.get(nativeKey)
    if (target && sectionKeys.has(target.key)) {
      return target.key
    }
  }
  return nativeKey
}

export function resolveSidebarNameReveal<T extends { rowKey: string }>(
  pending: T | null,
  args: {
    sectionKeys: ReadonlyMap<string, unknown> | undefined
    repoMap: Map<string, Repo>
    model?: ProjectSectionModel
  }
): T | null {
  if (!pending) {
    return null
  }
  const rowKey = resolveSidebarProjectNameRevealKey(
    pending.rowKey,
    args.sectionKeys,
    args.repoMap,
    args.model
  )
  return rowKey === pending.rowKey ? pending : { ...pending, rowKey }
}
