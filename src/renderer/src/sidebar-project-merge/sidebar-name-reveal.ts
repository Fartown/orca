import { useMemo } from 'react'
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

/** The pending sidebar row reveal, retargeted to the displayed name group that renders it. */
export function useSidebarNameReveal<T extends { rowKey: string }>(args: {
  pendingRevealSidebarRow: T | null
  occurrencePlan?: { bySection: ReadonlyMap<string, unknown> }
  repoMap: Map<string, Repo>
  projectGrouping?: ProjectSectionModel
}): T | null {
  const { pendingRevealSidebarRow, occurrencePlan, repoMap, projectGrouping } = args
  return useMemo(
    () =>
      resolveSidebarNameReveal(pendingRevealSidebarRow, {
        sectionKeys: occurrencePlan?.bySection,
        repoMap,
        model: projectGrouping
      }),
    [pendingRevealSidebarRow, occurrencePlan, repoMap, projectGrouping]
  )
}
