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
