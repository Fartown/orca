import type {
  ProjectGroupingIndex,
  ProjectSectionEntry,
  ProjectSectionModel,
  ProjectSectionRepo,
  ProjectSectionSetup
} from '../sidebar-list/sections/project-section-grouping'

const projectNameGroupingCache = new WeakMap<
  ProjectSectionModel,
  WeakMap<ReadonlyMap<string, ProjectSectionRepo>, ProjectGroupingIndex | null>
>()

export const defaultGroupingRepos: ReadonlyMap<string, ProjectSectionRepo> = new Map()

export function getProjectNameGroupingCache(model: ProjectSectionModel) {
  let cache = projectNameGroupingCache.get(model)
  if (!cache) {
    cache = new WeakMap()
    projectNameGroupingCache.set(model, cache)
  }
  return cache
}

export function withNameGroupHostScope(
  model: ProjectSectionModel | undefined,
  view: { workspaceHostScope: string; visibleWorkspaceHostIds: readonly string[] | null }
): ProjectSectionModel | undefined {
  return (
    model && {
      ...model,
      groupNamesByHost: view.workspaceHostScope !== 'all' || view.visibleWorkspaceHostIds !== null
    }
  )
}

export type SidebarProjectNameTarget = {
  key: string
  label: string
  repoId: string
  protectedCheckout: boolean
  containerKey?: string | null
  hostKey?: string
}

export type SidebarProjectNameGroup = {
  key: string
  label: string
  repoIds: ReadonlySet<string>
}

type GetProjectGrouping = (
  repoId: string,
  repos: ReadonlyMap<string, Pick<ProjectSectionRepo, 'displayName'>>,
  index: ProjectGroupingIndex
) => { key: string; label: string }
type IsProtectedCheckout = (setup: ProjectSectionSetup, index: ProjectGroupingIndex) => boolean

/** Completes a grouping index with its name groups and caches it; the rules are the section module's own. */
export function buildSidebarProjectNameGroupsIndex(
  base: Omit<ProjectGroupingIndex, 'nameGroups'>,
  model: ProjectSectionModel,
  repos: ReadonlyMap<string, ProjectSectionRepo>,
  [getGrouping, isProtected]: readonly [GetProjectGrouping, IsProtectedCheckout]
): ProjectGroupingIndex {
  // Why: grouping lookups are cached per index object, so the groups are built against the index that is returned.
  const index: ProjectGroupingIndex = { ...base, nameGroups: new Map() }
  index.nameGroups = buildSidebarProjectNameGroupsForSetups(
    index,
    repos,
    getGrouping,
    isProtected,
    model.groupNamesByHost
  )
  getProjectNameGroupingCache(model).set(repos, index)
  return index
}

export function toDisplayedProjectGrouping<T extends { key: string; label: string }>(
  target: T,
  index: ProjectGroupingIndex | null
): T {
  const group = index?.nameGroups.get(target.key)
  return group ? { ...target, key: group.key, label: group.label } : target
}

export function buildSidebarProjectNameGroupsForSetups(
  index: ProjectGroupingIndex,
  repos: ReadonlyMap<string, Pick<ProjectSectionRepo, 'displayName' | 'projectGroupId'>>,
  getGrouping: GetProjectGrouping,
  isProtected: IsProtectedCheckout,
  groupByHost = false
): ReadonlyMap<string, SidebarProjectNameGroup> {
  return buildSidebarProjectNameGroups(
    [...index.setupByRepoId.values()]
      .filter((setup) => index.projectById.has(setup.projectId))
      .map((setup) => ({
        ...getGrouping(setup.repoId, repos, index),
        repoId: setup.repoId,
        containerKey: repos.get(setup.repoId)?.projectGroupId,
        hostKey: groupByHost ? setup.hostId : undefined,
        protectedCheckout: !repos.has(setup.repoId) || isProtected(setup, index)
      }))
  )
}

export function buildSidebarProjectNameGroups(
  targets: readonly SidebarProjectNameTarget[]
): ReadonlyMap<string, SidebarProjectNameGroup> {
  const byName = new Map<string, SidebarProjectNameTarget[]>()
  const containers = new Map<string, Set<string>>()
  const protectedKeys = new Set(
    targets.filter((target) => target.protectedCheckout).map((target) => target.key)
  )
  for (const target of targets) {
    const scope = containers.get(target.key) ?? new Set<string>()
    scope.add(JSON.stringify([target.containerKey ?? '', target.hostKey ?? '']))
    containers.set(target.key, scope)
  }
  for (const target of targets) {
    const name = target.label.trim()
    if (!name || protectedKeys.has(target.key) || (containers.get(target.key)?.size ?? 0) > 1) {
      continue
    }
    const scopedName = JSON.stringify([target.containerKey ?? '', target.hostKey ?? '', name])
    const members = byName.get(scopedName) ?? []
    members.push(target)
    byName.set(scopedName, members)
  }
  const groups = new Map<string, SidebarProjectNameGroup>()
  for (const members of byName.values()) {
    const label = members[0].label.trim()
    const sourceKeys = new Set(members.map((member) => member.key))
    if (sourceKeys.size < 2) {
      continue
    }
    const group = {
      key: `sidebar-name:${encodeURIComponent(label)}${members[0].containerKey ? `::group:${encodeURIComponent(members[0].containerKey)}` : ''}${members[0].hostKey ? `::host:${encodeURIComponent(members[0].hostKey)}` : ''}`,
      label,
      repoIds: new Set(members.map((member) => member.repoId))
    }
    for (const key of sourceKeys) {
      groups.set(key, group)
    }
  }
  return groups
}

export function mergeSidebarProjectNameSections<Item, R extends ProjectSectionRepo>(
  sections: ReadonlyMap<string, ProjectSectionEntry<Item, R>>,
  groups: ReadonlyMap<string, SidebarProjectNameGroup>
): Map<string, ProjectSectionEntry<Item, R>> {
  const display = new Map<string, ProjectSectionEntry<Item, R>>()
  for (const [key, section] of sections) {
    const group = groups.get(key)
    if (!group) {
      display.set(key, section)
      continue
    }
    const previous = display.get(group.key)
    display.set(group.key, {
      ...(previous ?? section),
      label: group.label,
      items: [...(previous?.items ?? []), ...section.items],
      activityItems: [...(previous?.activityItems ?? []), ...(section.activityItems ?? [])],
      repoIds: new Set([...(previous?.repoIds ?? []), ...section.repoIds])
    })
  }
  return display
}

export function mergeOrderedSidebarProjectNameSections<Item, R extends ProjectSectionRepo>(
  ordered: Iterable<readonly [string, ProjectSectionEntry<Item, R>]>,
  index: ProjectGroupingIndex | null
): [string, ProjectSectionEntry<Item, R>][] {
  return [...mergeSidebarProjectNameSections(new Map(ordered), index?.nameGroups ?? new Map())]
}
