import { useMemo } from 'react'
import { useAppStore } from '@/store'
import {
  buildProjectGroupingIndex,
  type ProjectSectionModel
} from '../../../shared/sidebar-list/sections/project-section-grouping'
import type { Repo } from '../../../shared/repository/repo-types'

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

/** A retargeted reveal keeps the store's request, so currency checks and clears still match it. */
export type SidebarNameReveal<T> = T & { retargetedFrom?: T }

/** The request the store holds for a possibly retargeted reveal. */
export function sidebarNameRevealSource<T>(reveal: SidebarNameReveal<T> | null): T | null {
  return reveal?.retargetedFrom ?? reveal
}

/** Whether `reveal` is still the sidebar row request the store holds. */
export function isStoredSidebarReveal(reveal: unknown): boolean {
  return reveal !== null && useAppStore.getState().pendingRevealSidebarRow === reveal
}

export function resolveSidebarNameReveal<T extends { rowKey: string }>(
  pending: T | null,
  args: {
    sectionKeys: ReadonlyMap<string, unknown> | undefined
    repoMap: Map<string, Repo>
    model?: ProjectSectionModel
  }
): SidebarNameReveal<T> | null {
  if (!pending) {
    return null
  }
  const rowKey = resolveSidebarProjectNameRevealKey(
    pending.rowKey,
    args.sectionKeys,
    args.repoMap,
    args.model
  )
  return rowKey === pending.rowKey ? pending : { ...pending, rowKey, retargetedFrom: pending }
}

/** The pending sidebar row reveal, retargeted to the displayed name group that renders it. */
export function useSidebarNameReveal<T extends { rowKey: string }>(args: {
  pendingRevealSidebarRow: T | null
  occurrencePlan?: { bySection: ReadonlyMap<string, unknown> }
  repoMap: Map<string, Repo>
  projectGrouping?: ProjectSectionModel
}): SidebarNameReveal<T> | null {
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
